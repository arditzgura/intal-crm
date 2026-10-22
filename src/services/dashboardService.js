import { count, getAggregateFromServer, getDoc, getDocs, query, serverTimestamp, setDoc, sum, where } from 'firebase/firestore'
import { auth } from '../firebase'
import { companyCol, companyDoc } from './paths'
import { itemSalesTotals, monthlySales } from './invoiceService'
import { movementsSince } from './stockService'
import { ledgerSince } from './ledgerService'
import { millis } from '../utils/date'

/**
 * Paneli me pak lexime:
 * - Gjendjet aktuale (borxhi, detyrimet ndaj furnitorëve) me sum/count nga serveri.
 * - `snapshots/{YYYY-MM}`: stoku dhe borxhi në fund të muajit, llogaritur NJË herë
 *   (herën e parë që hapet Paneli në muajin pasardhës); më pas lexohet 1 dokument.
 * - `stats/paneli` (+ `stats/paneliKosto` me lejen sheh_koston): statistikat e rënda
 *   (shitjet për artikull, grafiku, vlera e stokut, fitimi), rillogaritur kur janë më
 *   të vjetra se STATS_TTL ose me "Rifresko".
 */
export const STATS_TTL = 6 * 60 * 60 * 1000

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthStartOf = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

/** Borxhi i klientëve dhe detyrimi ndaj furnitorëve sipas monedhës, nga serveri (≈ 2 lexime për monedhë). */
export async function liveTotals() {
  const clients = companyCol('clients')
  const out = { debt: {}, debtors: {}, payables: {} }
  await Promise.all(['LEK', 'EUR', 'USD'].map(async (cur) => {
    const [d, p] = await Promise.all([
      getAggregateFromServer(query(clients, where(`gjendje.${cur}`, '>', 0)), { s: sum(`gjendje.${cur}`), n: count() }),
      getAggregateFromServer(query(clients, where(`detyrimFurnitori.${cur}`, '>', 0)), { s: sum(`detyrimFurnitori.${cur}`) }),
    ])
    if (d.data().s) out.debt[cur] = d.data().s
    if (d.data().n) out.debtors[cur] = d.data().n
    if (p.data().s) out.payables[cur] = p.data().s
  }))
  return out
}

/**
 * Paratë në LEK (gjithë kohës, arkë + bankë), nga serveri (3 lexime):
 * hyrjet = Σ lëvizjet pozitive, pagesat = Σ lëvizjet negative (pa transfertat mes
 * arkës dhe bankës, që anulojnë njëra-tjetrën), neto = hyrjet − pagesat.
 */
export async function cashTotals() {
  const col = companyCol('cashMovements')
  const lek = where('monedha', '==', 'LEK')
  const [inn, out, tr] = await Promise.all([
    getAggregateFromServer(query(col, lek, where('shuma', '>', 0)), { s: sum('shuma') }),
    getAggregateFromServer(query(col, lek, where('shuma', '<', 0)), { s: sum('shuma') }),
    getAggregateFromServer(query(col, lek, where('tipi', '==', 'transferte'), where('shuma', '>', 0)), { s: sum('shuma') }),
  ])
  const transfers = tr.data().s ?? 0
  const hyrje = (inn.data().s ?? 0) - transfers
  const pagesa = -(out.data().s ?? 0) - transfers
  return { hyrje, pagesa, neto: hyrje - pagesa }
}

/**
 * Gjendja në fund të muajit para `now`: { key, stock: { itemId: sasia }, debtLEK }.
 * Nëse nuk ekziston, llogaritet nga gjendja aktuale − lëvizjet e këtij muaji dhe ruhet.
 */
export async function ensureMonthEndSnapshot(now = new Date()) {
  const start = monthStartOf(now)
  const key = monthKey(new Date(start.getTime() - 1))
  const ref = companyDoc('snapshots', key)
  const snap = await getDoc(ref)
  if (snap.exists()) return snap.data()

  const [stockSnap, clientsSnap, stockDelta, ledgerDelta] = await Promise.all([
    getDocs(companyCol('stock')), getDocs(companyCol('clients')), movementsSince(start), ledgerSince(start),
  ])
  const stock = {}
  for (const d of stockSnap.docs) stock[d.id] = (d.data().sasia ?? 0) - (stockDelta[d.id] ?? 0)
  for (const [id, q] of Object.entries(stockDelta)) if (!(id in stock)) stock[id] = -q
  let debtLEK = 0
  for (const d of clientsSnap.docs) debtLEK += Math.max(0, (d.data().gjendje?.LEK ?? 0) - (ledgerDelta[d.id]?.LEK ?? 0))

  const data = { key, stock, debtLEK, krijuar: serverTimestamp(), uid: auth.currentUser?.uid ?? null }
  try {
    await setDoc(ref, data)
  } catch {
    // Një përdorues tjetër e krijoi njëkohësisht – përdor atë.
    const again = await getDoc(ref)
    if (again.exists()) return again.data()
  }
  return data
}

/** Lexon statistikat e ruajtura: { base, cost } (null nëse mungojnë). */
export async function readStats(withCost) {
  const [b, c] = await Promise.all([
    getDoc(companyDoc('stats', 'paneli')),
    withCost ? getDoc(companyDoc('stats', 'paneliKosto')) : Promise.resolve(null),
  ])
  return { base: b.exists() ? b.data() : null, cost: c?.exists() ? c.data() : null }
}

/** A duhen rillogaritur statistikat (të vjetra, të muajit tjetër, ose mungon kostoja). */
export function statsStale({ base, cost }, withCost, now = new Date()) {
  if (!base || base.muaji !== monthKey(now) || now - millis(base.perditesuar) > STATS_TTL) return true
  return withCost && (!cost || cost.muaji !== monthKey(now) || now - millis(cost.perditesuar) > STATS_TTL)
}

/** Fitimi me koston aktuale: Σ (shitja − sasia × kosto) për artikujt me kosto. */
export function profitFrom(sales, costs) {
  let p = 0
  for (const [id, s] of Object.entries(sales)) if (costs[id] != null) p += (s.totali ?? 0) - (s.sasia ?? 0) * costs[id]
  return p
}

/** Top artikujt sipas shitjeve: [{ id, emri, njesia, totali, sasia }]. */
export function topItemsFrom(sales, items, n = 5) {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  return Object.entries(sales)
    .filter(([id, s]) => s.totali > 0 && byId[id])
    .sort((a, b) => b[1].totali - a[1].totali)
    .slice(0, n)
    .map(([id, s]) => ({ id, emri: byId[id].emri, njesia: byId[id].njesia ?? '', totali: s.totali, sasia: s.sasia }))
}

export async function readItems() {
  const snap = await getDocs(companyCol('items'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function readCosts() {
  const snap = await getDocs(companyCol('itemCosts'))
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data().kosto]).filter(([, k]) => k != null))
}

// ---------- Shitjet për artikull (faqja Artikujt, Historiku) ----------

const monthRangeOf = (now) => ({ from: monthStartOf(now), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) })

/** `stats/artikujt`: { muaji, perditesuar, all: { itemId: { totali, sasia } }, month: {...} } ose null. */
export async function readItemStats() {
  const s = await getDoc(companyDoc('stats', 'artikujt'))
  return s.exists() ? s.data() : null
}

export function itemStatsStale(st, now = new Date()) {
  return !st || st.muaji !== monthKey(now) || now - millis(st.perditesuar) > STATS_TTL
}

function writeItemStats(all, month, now) {
  const data = { muaji: monthKey(now), perditesuar: serverTimestamp(), all, month }
  return setDoc(companyDoc('stats', 'artikujt'), data).then(() => ({ ...data, perditesuar: new Date() }))
}

/** Rillogarit shitjet e çdo artikulli (gjithë kohës + muaji aktual) dhe i ruan. */
export async function refreshItemStats(itemIds, now = new Date()) {
  const [all, month] = await Promise.all([itemSalesTotals(itemIds, {}), itemSalesTotals(itemIds, monthRangeOf(now))])
  return writeItemStats(all, month, now)
}

/**
 * Shitjet për artikull për një periudhë nga statistikat e ruajtura: "Gjithë kohës" dhe muaji aktual.
 * Për periudhat e tjera kthen null (llogariten nga serveri vetëm kur zgjidhen).
 */
export function cachedItemSales(st, range, now = new Date()) {
  if (!st) return null
  if (!range?.from && !range?.to) return st.all ?? null
  const m = monthRangeOf(now)
  if (range.from?.getTime() === m.from.getTime() && range.to?.getTime() === m.to.getTime() && st.muaji === monthKey(now)) return st.month ?? null
  return null
}

/** Rillogarit dhe ruan statistikat e Panelit. Kthen { base, cost }. */
export async function refreshStats(withCost, now = new Date()) {
  const start = monthStartOf(now)
  const monthRange = { from: start, to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) }
  const [items, stockSnap, snapshot, months, costs] = await Promise.all([
    readItems(), getDocs(companyCol('stock')), ensureMonthEndSnapshot(now), monthlySales(12), withCost ? readCosts() : null,
  ])
  const ids = items.map((i) => i.id)
  const [monthSales, allSales] = await Promise.all([
    itemSalesTotals(ids, monthRange),
    itemSalesTotals(ids, {}),
  ])
  // Të njëjtat shuma shërbejnë edhe për faqen Artikujt / Historikun
  await writeItemStats(allSales, monthSales, now)
  const stock = Object.fromEntries(stockSnap.docs.map((d) => [d.id, d.data().sasia ?? 0]))
  let stockSale = 0, prevStockSale = 0, stockCost = 0, prevStockCost = 0
  for (const i of items.filter((x) => !x.arkivuar)) {
    const q = Math.max(0, stock[i.id] ?? 0)
    const qp = Math.max(0, snapshot.stock?.[i.id] ?? 0)
    stockSale += q * (i.cmimi ?? 0)
    prevStockSale += qp * (i.cmimi ?? 0)
    if (costs?.[i.id] != null) { stockCost += q * costs[i.id]; prevStockCost += qp * costs[i.id] }
  }
  const muaji = monthKey(now)
  const meta = { muaji, perditesuar: serverTimestamp(), uid: auth.currentUser?.uid ?? null }
  const base = {
    ...meta, months, topItems: topItemsFrom(monthSales, items),
    stockSale, prevStockSale, prevDebt: snapshot.debtLEK ?? 0, snapshotKey: snapshot.key,
  }
  const writes = [setDoc(companyDoc('stats', 'paneli'), base)]
  let cost = null
  if (withCost) {
    cost = { ...meta, profitMonth: profitFrom(monthSales, costs), profitAll: profitFrom(allSales, costs), stockCost, prevStockCost }
    writes.push(setDoc(companyDoc('stats', 'paneliKosto'), cost))
  }
  await Promise.all(writes)
  const local = { perditesuar: new Date() }
  return { base: { ...base, ...local }, cost: cost && { ...cost, ...local } }
}
