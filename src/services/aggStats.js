import { getDocs, increment, onSnapshot, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { companyCol, companyDoc } from './paths'
import { addAudit } from './auditService'
import { toLek } from '../utils/money'
import { toDate } from '../utils/date'

/**
 * Statistikat e gatshme (llogariten kur ndodh veprimi, jo kur hapet faqja):
 *  - clientStats/{clientId}: { m: { 'YYYY-MM': { n, i: { itemId: { t, q, n } } } } }
 *  - itemStats/{itemId}:     { m: { 'YYYY-MM': { c: { clientId: { t, q, n } } } } }
 *  - monthStats/{YYYY-MM}:   { n, c: { clientId: { t, q, n } }, i: { itemId: { t, q, n } } }
 * t = shitja në LEK (me kursin e faturës), q = sasia, n = numri i faturave.
 * Përditësohen me increment() në të njëjtin transaction me lëshimin / ndryshimin / anulimin;
 * Admini i rindërton nga rreshtat e faturave me "Rillogarit statistikat".
 * Kostoja nuk ruhet këtu: fitimi = t − q × kosto aktuale, vetëm për ata me lejen sheh_koston.
 */

export const monthKeyOf = (date) => {
  const d = toDate(date) ?? new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Rreshtat e një fature → { itemId: { t (LEK), q } }. */
function byItem(lines, kursi) {
  const out = {}
  for (const l of lines ?? []) {
    const r = (out[l.itemId] ??= { t: 0, q: 0 })
    r.t += toLek(l.totali, kursi)
    r.q += l.sasia
  }
  return out
}

/**
 * Shkruan diferencën e statistikave për një faturë (brenda transaction-it).
 * @param inv       { clientId, data, kursi }
 * @param oldLines  rreshtat para (bosh te lëshimi)
 * @param newLines  rreshtat pas (bosh te anulimi)
 * @param invDelta  +1 lëshim, −1 anulim, 0 ndryshim
 */
export function writeInvoiceStats(tx, inv, oldLines, newLines, invDelta) {
  const mk = monthKeyOf(inv.data)
  const before = byItem(oldLines, inv.kursi)
  const after = byItem(newLines, inv.kursi)
  const items = {}
  let dtAll = 0
  let dqAll = 0
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const dt = (after[id]?.t ?? 0) - (before[id]?.t ?? 0)
    const dq = (after[id]?.q ?? 0) - (before[id]?.q ?? 0)
    const dn = (after[id] ? 1 : 0) - (before[id] ? 1 : 0)
    if (!dt && !dq && !dn) continue
    items[id] = { t: increment(dt), q: increment(dq), n: increment(dn) }
    dtAll += dt
    dqAll += dq
    tx.set(companyDoc('itemStats', id), { m: { [mk]: { c: { [inv.clientId]: items[id] } } } }, { merge: true })
  }
  if (!Object.keys(items).length && !invDelta) return
  const client = { t: increment(dtAll), q: increment(dqAll), n: increment(invDelta) }
  tx.set(companyDoc('clientStats', inv.clientId), { m: { [mk]: { n: increment(invDelta), i: items } } }, { merge: true })
  tx.set(companyDoc('monthStats', mk), { n: increment(invDelta), c: { [inv.clientId]: client }, i: items }, { merge: true })
}

// ---------- Leximi ----------

export function watchClientStats(clientId, onData, onError) {
  return onSnapshot(companyDoc('clientStats', clientId), (s) => onData(s.exists() ? s.data().m ?? {} : {}), onError)
}

export function watchItemAgg(itemId, onData, onError) {
  return onSnapshot(companyDoc('itemStats', itemId), (s) => onData(s.exists() ? s.data().m ?? {} : {}), onError)
}

/**
 * Filtri i muajve për një periudhë. Statistikat janë mujore: vlejnë për "Gjithë kohës",
 * muaj ose vite të plota. Për ditë të veçanta kthen null (llogaritet nga rreshtat).
 */
export function monthFilter(range) {
  if (!range?.from && !range?.to) return () => true
  const f = range.from
  const t = range.to
  const wholeStart = f && f.getDate() === 1 && f.getHours() === 0 && f.getMinutes() === 0
  const lastDay = t && new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  const wholeEnd = t && t.getDate() === lastDay && t.getHours() === 23
  if (!wholeStart || !wholeEnd) return null
  const a = monthKeyOf(f)
  const b = monthKeyOf(t)
  return (key) => key >= a && key <= b
}

/** Shuma e statistikave të klientit sipas artikullit: { items: { itemId: { t, q, n } }, n, t, q }. */
export function sumClient(m, test) {
  const items = {}
  let n = 0
  for (const [key, mo] of Object.entries(m ?? {})) {
    if (!test(key)) continue
    n += mo.n ?? 0
    for (const [id, v] of Object.entries(mo.i ?? {})) {
      const r = (items[id] ??= { t: 0, q: 0, n: 0 })
      r.t += v.t ?? 0
      r.q += v.q ?? 0
      r.n += v.n ?? 0
    }
  }
  const list = Object.values(items)
  return { items, n, t: list.reduce((a, r) => a + r.t, 0), q: list.reduce((a, r) => a + r.q, 0) }
}

/** Shuma e statistikave të artikullit sipas klientit + për muaj: { clients, months: { key: q }, t, q, n }. */
export function sumItem(m, test) {
  const clients = {}
  const months = {}
  for (const [key, mo] of Object.entries(m ?? {})) {
    if (!test(key)) continue
    for (const [cid, v] of Object.entries(mo.c ?? {})) {
      const r = (clients[cid] ??= { t: 0, q: 0, n: 0 })
      r.t += v.t ?? 0
      r.q += v.q ?? 0
      r.n += v.n ?? 0
      months[key] = (months[key] ?? 0) + (v.q ?? 0)
    }
  }
  const list = Object.values(clients)
  return { clients, months, t: list.reduce((a, r) => a + r.t, 0), q: list.reduce((a, r) => a + r.q, 0), n: list.reduce((a, r) => a + r.n, 0) }
}

// ---------- Rindërtimi (Admini) ----------

/**
 * Rindërton të gjitha statistikat nga rreshtat e faturave të paanuluara (një herë, p.sh. pas importit).
 * Lexon të gjithë `invoiceLines` dhe shkruan clientStats / itemStats / monthStats nga e para.
 */
export async function rebuildStats(actorName, onProgress) {
  onProgress?.('Duke lexuar rreshtat e faturave…')
  const snap = await getDocs(query(companyCol('invoiceLines'), where('anuluar', '==', false)))
  const C = {}
  const I = {}
  const M = {}
  const seen = new Set()
  for (const d of snap.docs) {
    const l = d.data()
    const mk = monthKeyOf(l.data)
    const t = toLek(l.totali, l.kursi)
    const firstOfInvoice = !seen.has(l.invoiceId)
    seen.add(l.invoiceId)
    const itemKey = `${l.invoiceId}|${l.itemId}`
    const firstOfItem = !seen.has(itemKey)
    seen.add(itemKey)
    const add = (r) => { r.t += t; r.q += l.sasia }
    // Klienti
    const cm = ((C[l.clientId] ??= {})[mk] ??= { n: 0, i: {} })
    if (firstOfInvoice) cm.n += 1
    const ci = (cm.i[l.itemId] ??= { t: 0, q: 0, n: 0 })
    add(ci)
    if (firstOfItem) ci.n += 1
    // Artikulli
    const ic = ((((I[l.itemId] ??= {})[mk] ??= { c: {} }).c)[l.clientId] ??= { t: 0, q: 0, n: 0 })
    add(ic)
    if (firstOfItem) ic.n += 1
    // Muaji
    const mo = (M[mk] ??= { n: 0, c: {}, i: {} })
    if (firstOfInvoice) mo.n += 1
    const mc = (mo.c[l.clientId] ??= { t: 0, q: 0, n: 0 })
    add(mc)
    if (firstOfInvoice) mc.n += 1
    const mi = (mo.i[l.itemId] ??= { t: 0, q: 0, n: 0 })
    add(mi)
    if (firstOfItem) mi.n += 1
  }

  // Dokumentet e vjetra që nuk kanë më shitje boshatisen
  const writes = []
  for (const [col, data, wrap] of [['clientStats', C, (m) => ({ m })], ['itemStats', I, (m) => ({ m })], ['monthStats', M, (v) => v]]) {
    const existing = await getDocs(companyCol(col))
    for (const d of existing.docs) if (!(d.id in data)) writes.push([col, d.id, col === 'monthStats' ? { n: 0, c: {}, i: {} } : { m: {} }])
    for (const [id, v] of Object.entries(data)) writes.push([col, id, wrap(v)])
  }
  for (let i = 0; i < writes.length; i += 400) {
    onProgress?.(`Duke shkruar statistikat… ${Math.min(i + 400, writes.length)} / ${writes.length}`)
    const batch = writeBatch(db)
    for (const [col, id, v] of writes.slice(i, i + 400)) batch.set(companyDoc(col, id), v)
    if (i === 0) addAudit(batch, { action: 'rillogaritje_statistikash', entity: 'stats', entityId: null, details: { rreshta: snap.size, dokumente: writes.length }, actorName })
    await batch.commit()
  }
  return { rreshta: snap.size, dokumente: writes.length }
}
