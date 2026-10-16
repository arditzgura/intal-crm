import { Timestamp, getDocFromServer, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'
import { companyDoc } from './paths'
import { RATE_SCALE } from '../utils/money'
import { normalize } from '../utils/text'

/**
 * Importi i të dhënave nga backup-i .json (version 2) i sistemit të vjetër.
 *
 * buildImportPlan() kthen një listë të rregullt shkrimesh (`ops`) me ID
 * deterministe (nga id-të e vjetra) + raportin e problemeve. runImport() i
 * shkruan me batch-e; çdo batch ruan edhe progresin te `meta/import`, ndaj
 * importi mund të ndalet (p.sh. kuota ditore e Firebase) dhe të vazhdojë nga
 * i njëjti vend pa dublikata. Shkrimet lejohen nga Rules vetëm kur Admini ka
 * hapur "mënyrën e importit" (meta/import.aktiv).
 */

export const BATCH_SIZE = 450
const WALK_IN_ID = 'klient-rastesor'
const IMPORT_NOTE = 'importuar nga sistemi i vjetër'
const metaRef = () => companyDoc('meta', 'import')

export const projectId = firebaseConfig.projectId

// ---------- Ndihmës ----------

/** 990.9 / "990.90" → 99090 (njësia e vogël). */
export const toMinor = (v) => Math.round((Number(v) || 0) * 100)
const toInt = (v) => Math.trunc(Number(v) || 0)

/** Datë e vlefshme (vitet 2000–2100) ose null; datat e gabuara (p.sh. "52026-05-02") → null. */
function parseDate(s) {
  if (!s) return null
  const str = String(s)
  let d
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, day] = str.split('-').map(Number)
    d = new Date(y, m - 1, day, 12)
  } else {
    d = new Date(str)
  }
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null
  return d
}

const ts = (date, offsetMs = 0) => Timestamp.fromMillis(date.getTime() + offsetMs)
const numId = (id) => (/^\d+$/.test(String(id)) ? Number(id) : Number.MAX_SAFE_INTEGER)
const OLD_STATUS = { 'E paguar': 'e_paguar', 'Pa paguar': 'pa_paguar', Pasuar: 'pasuar' }
const fmtCode = (prefix, n, pad) => `${prefix}${String(n).padStart(pad, '0')}`

export async function readBackupFile(file) {
  const text = await file.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Skedari nuk është JSON i vlefshëm.')
  }
  if (data.version !== 2 || !Array.isArray(data.invoices) || !Array.isArray(data.clients) || !Array.isArray(data.items)) {
    throw new Error('Ky nuk duket backup i sistemit të vjetër (version 2).')
  }
  return data
}

/** Gjurmë e planit: e njëjta → mund të vazhdohet. */
export function planHash(backup, choices) {
  return [
    backup.exportedAt,
    backup.invoices.length,
    backup.clients.length,
    backup.items.length,
    (backup.stock_entries ?? []).length,
    choices.eurRate,
    Object.entries(choices.overrides ?? {}).sort().map(([k, v]) => `${k}:${v}`).join(','),
  ].join('|')
}

// ---------- Plani ----------

/**
 * @param backup  objekti JSON
 * @param choices { eurRate (×RATE_SCALE), overrides: { invoiceId: 'vjeter' | 'llogaritur' } }
 * @param actor   { uid, emri }
 */
export function buildImportPlan(backup, choices, actor) {
  const ops = []
  const put = (col, id, data, merge = false) => ops.push({ col, id: String(id), data: { ...data, importuar: true }, merge })
  const R = {
    renumbered: [],
    duplicateGroups: 0,
    missingClients: [],
    missingItems: [],
    initialBalances: [],
    manualAdjustments: [],
    statusDiffs: [],
    labels: [],
    lineMismatches: [],
    skippedPayments: [],
    negativeStock: [],
    origins: [],
    balanceChecks: 0,
    balanceErrors: [],
    badDates: [],
    skippedPrefs: 0,
  }
  const by = { uid: actor.uid, emri: 'Import' }
  const rateOf = (cur) => (cur === 'EUR' ? choices.eurRate : RATE_SCALE)
  const curOf = (c) => (c === 'EUR' ? 'EUR' : 'LEK')

  // ---------- Klientët ----------
  const clientIdMap = new Map() // id i vjetër → id i dokumentit
  const clients = new Map() // id dokumenti → të dhënat e klientit (përfundimtare në fund)
  let maxKl = 0
  for (const c of backup.clients) {
    const isWalkIn = normalize(c.name) === 'klient rastesor'
    const docId = isWalkIn ? WALK_IN_ID : String(c.id)
    clientIdMap.set(String(c.id), docId)
    const m = /^KL(\d+)$/i.exec(c.code ?? '')
    if (m) maxKl = Math.max(maxKl, Number(m[1]))
    clients.set(docId, {
      kodi: isWalkIn ? 'KL000' : (c.code || ''),
      emri: isWalkIn ? 'Klient Rastësor' : (c.name || '(pa emër)'),
      nipt: '',
      qyteti: c.city || '',
      adresa: c.address || '',
      telefoni: c.phone || '',
      email: c.email || '',
      monedhaPreferuar: 'LEK',
      shenime: isWalkIn ? 'Klient i përhershëm për shitje me pakicë.' : '',
      tipi: 'klient',
      rastesor: isWalkIn,
      arkivuar: false,
      piketVjetra: isWalkIn ? 0 : toInt(c.points),
      gjendje: {},
      fillestare: {},
      faturaFundit: {},
    })
  }

  // ---------- Artikujt ----------
  const itemIdMap = new Map()
  const items = new Map()
  const sortedItems = backup.items.map((it, idx) => ({ it, idx })).sort((a, b) => numId(a.it.id) - numId(b.it.id) || b.idx - a.idx)
  let itemN = 0
  for (const { it } of sortedItems) {
    itemN += 1
    itemIdMap.set(String(it.id), String(it.id))
    items.set(String(it.id), {
      kodi: fmtCode('A', itemN, 3),
      emri: it.name || '(pa emër)',
      kategoria: '',
      nenkategoria: '',
      njesia: 'copë',
      cmimi: toMinor(it.price),
      stokMinimal: 0,
      arkivuar: false,
      kosto: it.purchasePrice != null && it.purchasePrice !== '' ? toMinor(it.purchasePrice) : null,
      prefs: (it.preferentialPrices ?? []).map((p) => ({ clientId: String(p.clientId), cmimi: toMinor(p.price) })),
    })
  }

  const ensureItem = (line) => {
    const id = String(line.itemId ?? '')
    if (id && itemIdMap.has(id)) return itemIdMap.get(id)
    const docId = id || `imp_artikull_${normalize(line.name).replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`
    if (!items.has(docId)) {
      itemN += 1
      items.set(docId, { kodi: fmtCode('A', itemN, 3), emri: line.name || '(artikull i panjohur)', kategoria: '', nenkategoria: '', njesia: 'copë', cmimi: toMinor(line.price), stokMinimal: 0, arkivuar: true, kosto: null, prefs: [] })
      R.missingItems.push({ id: docId, emri: line.name })
    }
    itemIdMap.set(id || docId, docId)
    return docId
  }

  const ensureClient = (inv) => {
    const id = String(inv.clientId ?? '')
    if (id && clientIdMap.has(id)) return clientIdMap.get(id)
    const docId = id || 'imp_pa_klient'
    if (!clients.has(docId)) {
      clients.set(docId, {
        kodi: inv.clientCode || 'KL-ARK', emri: inv.clientName || '(klient i panjohur)', nipt: '', qyteti: inv.clientCity || '', adresa: '',
        telefoni: inv.clientPhone || '', email: '', monedhaPreferuar: 'LEK', shenime: 'Krijuar nga importi (mungonte në backup).',
        tipi: 'klient', rastesor: false, arkivuar: true, piketVjetra: 0, gjendje: {}, fillestare: {}, faturaFundit: {},
      })
      R.missingClients.push({ id: docId, emri: inv.clientName })
    }
    clientIdMap.set(id || docId, docId)
    return docId
  }

  // ---------- Faturat: datat dhe numrat ----------
  const invoices = [...backup.invoices].sort((a, b) => numId(a.id) - numId(b.id))
  const byNumber = new Map()
  for (const inv of invoices) {
    const n = String(inv.invoiceNumber).trim()
    if (!byNumber.has(n)) byNumber.set(n, [])
    byNumber.get(n).push(inv)
  }
  const dupIds = new Set()
  const toRenumber = []
  for (const [, list] of byNumber) {
    if (list.length < 2) continue
    R.duplicateGroups += 1
    list.forEach((inv) => dupIds.add(String(inv.id)))
    toRenumber.push(...list.slice(1)) // më e vjetra (sipas id-së) e mban numrin
  }
  const realDate = (inv) => (dupIds.has(String(inv.id)) || !parseDate(inv.date) ? new Date(Number(inv.id)) : parseDate(inv.date))
  const maxNumber = Math.max(...invoices.map((i) => toInt(i.invoiceNumber)))
  const finalNumber = new Map(invoices.map((i) => [String(i.id), toInt(i.invoiceNumber)]))
  toRenumber.sort((a, b) => numId(a.id) - numId(b.id))
  toRenumber.forEach((inv, k) => {
    const n = maxNumber + 1 + k
    finalNumber.set(String(inv.id), n)
    R.renumbered.push({ id: String(inv.id), vjeter: String(inv.invoiceNumber), ri: n, data: realDate(inv) })
  })
  const usedNumbers = new Set(finalNumber.values())
  if (usedNumbers.size !== invoices.length) throw new Error('Kontrolli dështoi: mbeten numra faturash të përsëritur.')
  const nextInvoice = maxNumber + toRenumber.length + 1

  // ---------- Zinxhirët (klient + monedhë), sipas rendit të id-së ----------
  const chains = new Map()
  for (const inv of invoices) {
    const clientId = ensureClient(inv)
    const key = `${clientId}|${curOf(inv.currency)}`
    if (!chains.has(key)) chains.set(key, [])
    chains.get(key).push(inv)
  }

  const plan = new Map() // id fature → të dhëna të llogaritura
  for (const [key, list] of chains) {
    const [clientId, monedha] = key.split('|')
    let bal = 0
    list.forEach((inv, idx) => {
      const date = realDate(inv)
      const totali = toMinor(inv.subtotal)
      const gjendjaPara = toMinor(inv.previousBalance)
      const paguar = toMinor(inv.amountPaid)
      const diff = gjendjaPara - bal
      let adj = null
      const prevLabel = normalize(inv.previousBalanceLabel)
      if (idx === 0 && gjendjaPara !== 0) {
        adj = { tipi: 'gjendje_fillestare', shuma: gjendjaPara, shenim: `Gjendja fillestare (${IMPORT_NOTE})` }
        R.initialBalances.push({ klienti: clients.get(clientId).emri, monedha, shuma: gjendjaPara, fatura: finalNumber.get(String(inv.id)) })
      } else if (diff !== 0) {
        let tipi = 'rregullim'
        if (prevLabel.includes('posta') && diff > 0) tipi = 'poste'
        else if (prevLabel.includes('discount') && diff < 0) tipi = 'zbritje'
        adj = { tipi, shuma: diff, shenim: `${tipi === 'poste' ? 'Postë' : tipi === 'zbritje' ? 'Zbritje' : 'Rregullim manual i gjendjes'} (${IMPORT_NOTE})`, arsye: IMPORT_NOTE }
        R.manualAdjustments.push({ klienti: clients.get(clientId).emri, monedha, fatura: finalNumber.get(String(inv.id)), llogaritur: bal, vendosur: gjendjaPara, diferenca: diff, lloji: tipi })
      }
      if (inv.previousBalanceLabel && !/^gjendja/i.test(inv.previousBalanceLabel)) R.labels.push({ fatura: finalNumber.get(String(inv.id)), fusha: 'Gjendja', etiketa: inv.previousBalanceLabel })
      if (inv.amountPaidLabel && !/^paguar/i.test(inv.amountPaidLabel)) R.labels.push({ fatura: finalNumber.get(String(inv.id)), fusha: 'Paguar', etiketa: inv.amountPaidLabel })
      const isReturn = normalize(inv.amountPaidLabel) === 'kthim'
      const gjendjaRe = gjendjaPara + totali - paguar
      bal = gjendjaRe
      // payments[]: vetëm nëse nuk janë tashmë te "Paguar"
      const extra = []
      const pSum = (inv.payments ?? []).reduce((s, p) => s + toMinor(p.amount), 0)
      if (pSum && pSum === paguar) R.skippedPayments.push({ fatura: finalNumber.get(String(inv.id)), shuma: pSum, arsye: 'e njëjtë me "Paguar"' })
      else for (const p of inv.payments ?? []) extra.push({ shuma: toMinor(p.amount), date: parseDate(p.date) ?? date })
      for (const p of extra) bal -= p.shuma
      plan.set(String(inv.id), { clientId, monedha, idx, date, totali, gjendjaPara, gjendjaParaLlogaritur: gjendjaPara - diff, adj, paguar, isReturn, gjendjaRe, extra, mbetur: bal })
    })
    // Statuset sipas rregullit të bartjes
    list.forEach((inv, idx) => {
      const p = plan.get(String(inv.id))
      let st
      if (p.mbetur <= 0) st = 'e_paguar'
      else if (list.slice(idx + 1).some((n) => plan.get(String(n.id)).mbetur <= 0)) st = 'e_paguar'
      else if (idx === list.length - 1) st = 'pa_paguar'
      else st = 'pasuar'
      const old = OLD_STATUS[inv.status]
      if (old && old !== st) {
        R.statusDiffs.push({ id: String(inv.id), fatura: finalNumber.get(String(inv.id)), klienti: clients.get(p.clientId).emri, vjeter: old, llogaritur: st })
        if (choices.overrides?.[String(inv.id)] === 'vjeter') st = old
      }
      p.statusi = st
      p.faturaPara = idx > 0 ? String(list[idx - 1].id) : null
      p.faturaPas = idx < list.length - 1 ? String(list[idx + 1].id) : null
    })
    const last = list[list.length - 1]
    const c = clients.get(clientId)
    c.gjendje[monedha] = plan.get(String(last.id)).mbetur
    c.faturaFundit[monedha] = String(last.id)
    if (plan.get(String(list[0].id)).adj?.tipi === 'gjendje_fillestare') c.fillestare[monedha] = true
  }
  // Klientët që kanë vetëm fatura në EUR → monedha e preferuar EUR
  for (const c of clients.values()) {
    const curs = Object.keys(c.gjendje)
    if (curs.length === 1 && curs[0] === 'EUR') c.monedhaPreferuar = 'EUR'
  }

  // ---------- Shkrimet ----------
  const allDates = invoices.map(realDate)
  const firstDate = new Date(Math.min(...allDates.map((d) => d.getTime())) - 86400000)

  // 1. Cilësimet
  const cfg = backup.config ?? {}
  const origins = [...new Set((backup.stock_entries ?? []).map((s) => (s.origin || '').trim()).filter(Boolean))]
  R.origins = origins
  put('settings', 'main', {
    kompania: {
      emri: cfg.name || 'INTAL ALBANIA', nipt: cfg.nipt || '', adresa: cfg.address || '', telefoni: cfg.phone || '', email: cfg.email || '',
      website: cfg.website || '', slogani: cfg.slogan || '', banka: '', iban: '', logo: cfg.logoUrl || '',
    },
    fatura: {
      shablloni: 'klasik',
      fonti: (cfg.itemFont || 'Arial').replace(/"/g, ''),
      madhesiaFontit: Number(cfg.itemFontSize) || 12,
      gjeresiaTermike: Number(cfg.thermalWidth) || 80,
      watermarkMadhesia: Number(cfg.watermarkSize) || 0,
      watermarkTransparenca: Number(cfg.watermarkOpacity) || 0,
    },
    etiketat: {
      fatura: cfg.labelFature || 'FATURË', klienti: cfg.labelKlienti || 'KLIENTI', artikulli: cfg.labelArtikulli || 'ARTIKULLI',
      sasia: cfg.labelSasia || 'SASIA', cmimi: cfg.labelCmimi || 'ÇMIMI', nentotali: cfg.labelNentotali || 'NËNTOTALI', totali: cfg.labelTotali || 'TOTALI',
      gjendja: cfg.labelGjendja || 'GJENDJA', paguar: cfg.labelPaguar || 'PAGUAR', detyrimi: cfg.labelDetyrimi || 'DETYRIMI',
      teprica: cfg.labelTeprica || 'TEPRICA', falenderim: cfg.labelFaleminderit || 'FALEMINDERIT QË NA BESUAT!',
    },
    kategorite: { origjinat: origins.length ? origins : ['Magazina Qendrore'] },
  }, true)

  // 2. Artikujt (+ kodet, kostot, çmimet preferenciale)
  // Rreshtat me artikuj që mungojnë krijojnë artikuj "arkivuar" para shkrimit.
  for (const inv of invoices) for (const l of inv.items ?? []) ensureItem(l)
  for (const se of backup.stock_entries ?? []) for (const l of se.items ?? []) ensureItem(l)
  for (const [id, it] of items) {
    const { kosto, prefs, ...doc } = it
    put('items', id, { ...doc, krijuar: ts(firstDate) })
    put('itemCodes', it.kodi, { itemId: id })
    if (kosto != null) {
      put('itemCosts', id, { kosto })
      put('costHistory', `imp_${id}`, { itemId: id, kosto, nga: ts(firstDate) })
    }
    for (const p of prefs) {
      const cid = clientIdMap.get(p.clientId)
      if (!cid) {
        R.skippedPrefs += 1
        continue
      }
      put('preferentialPrices', `${id}_${cid}`, { itemId: id, clientId: cid, cmimi: p.cmimi, ndryshuar: ts(firstDate) })
    }
  }

  // 3. Hyrjet e mallit
  const stock = new Map()
  const addStock = (itemId, q) => stock.set(itemId, (stock.get(itemId) ?? 0) + q)
  let maxEntry = 0
  for (const se of backup.stock_entries ?? []) {
    const n = toInt(se.entryNumber)
    maxEntry = Math.max(maxEntry, n)
    const date = parseDate(se.date) ?? new Date(numId(se.id))
    const rreshtat = (se.items ?? []).map((l) => {
      const itemId = ensureItem(l)
      const sasia = toInt(l.quantity)
      const cb = toMinor(l.purchasePrice)
      const cs = toMinor(l.sellingPrice)
      return { itemId, kodi: items.get(itemId).kodi, emri: l.name || items.get(itemId).emri, njesia: 'copë', sasia, cmimiBlerjes: cb, cmimiShitjes: cs, totaliBlerje: sasia * cb, totaliShitje: sasia * cs }
    })
    const pid = String(se.id)
    put('purchases', pid, {
      numri: n, numriTekst: String(se.entryNumber), statusi: 'regjistruar', data: ts(date), origjina: 'brendshme', origjinaEmri: (se.origin || '').trim() || 'Magazina Qendrore',
      furnitorId: null, furnitor: null, kategoria: 'Mall', monedha: 'LEK', kursi: RATE_SCALE, rreshtat,
      totaliBlerje: rreshtat.reduce((s, l) => s + l.totaliBlerje, 0), totaliShitje: rreshtat.reduce((s, l) => s + l.totaliShitje, 0),
      perditesoiKoston: false, perditesoiCmimin: false, shenime: se.notes || '', krijuar: ts(date), krijuarNga: by, anuluar: null,
    })
    put('purchaseNumbers', String(n), { purchaseId: pid, krijuar: ts(date) })
    const agg = new Map()
    for (const l of rreshtat) agg.set(l.itemId, (agg.get(l.itemId) ?? 0) + l.sasia)
    for (const [itemId, q] of agg) {
      addStock(itemId, q)
      put('stockMovements', `imp_h_${pid}_${itemId}`, { itemId, tipi: 'hyrje', sasia: q, dokument: 'hyrje', invoiceId: null, purchaseId: pid, numri: n, data: ts(date), arsye: '', uid: by.uid, emri: by.emri, krijuar: ts(date) })
    }
  }

  // 4. Faturat (rreshtat, kartela, arka, stoku)
  const cash = { LEK: 0, EUR: 0 }
  for (const inv of invoices) {
    const id = String(inv.id)
    const p = plan.get(id)
    const c = clients.get(p.clientId)
    const numri = finalNumber.get(id)
    const kursi = rateOf(p.monedha)
    const rreshtat = (inv.items ?? []).map((l) => {
      const itemId = ensureItem(l)
      const sasia = toInt(l.quantity)
      const cmimi = toMinor(l.price)
      const orig = l.originalPrice != null && l.originalPrice !== '' ? toMinor(l.originalPrice) : null
      return { itemId, kodi: items.get(itemId).kodi, emri: l.name || items.get(itemId).emri, njesia: 'copë', sasia, cmimi, cmimiOrigjinal: orig != null && orig !== cmimi ? orig : null, totali: sasia * cmimi }
    })
    const sumLines = rreshtat.reduce((s, l) => s + l.totali, 0)
    if (sumLines !== p.totali) R.lineMismatches.push({ fatura: numri, rreshtat: sumLines, totali: p.totali })
    const renum = R.renumbered.find((r) => r.id === id)

    put('invoices', id, {
      numri, numriTekst: String(numri), numriVjeter: renum ? renum.vjeter : null, statusi: p.statusi, clientId: p.clientId,
      klient: { id: p.clientId, kodi: inv.clientCode || c.kodi, emri: inv.clientName || c.emri, qyteti: inv.clientCity || c.qyteti, adresa: c.adresa, telefoni: inv.clientPhone || c.telefoni, nipt: c.nipt, rastesor: c.rastesor },
      monedha: p.monedha, kursi, data: ts(p.date), rreshtat, nentotali: p.totali, totali: p.totali,
      gjendjaParaLlogaritur: p.gjendjaParaLlogaritur, gjendjaPara: p.gjendjaPara,
      rregullim: p.adj && p.adj.tipi !== 'gjendje_fillestare' ? { shuma: p.adj.shuma, arsye: IMPORT_NOTE } : null,
      paguar: p.paguar, metodaPagese: p.paguar > 0 ? 'arke' : null, gjendjaRe: p.gjendjaRe,
      mbetur: p.mbetur, faturaPara: p.faturaPara, faturaPas: p.faturaPas, piketDhene: 0, shenime: inv.notes || '',
      krijuar: ts(p.date), krijuarNga: by, leshuar: ts(p.date), leshuarNga: by, anuluar: null,
    })
    put('invoiceNumbers', String(numri), { invoiceId: id, krijuar: ts(p.date) })
    rreshtat.forEach((l, i) => {
      put('invoiceLines', `${id}_${i}`, { invoiceId: id, numri, data: ts(p.date), clientId: p.clientId, itemId: l.itemId, sasia: l.sasia, cmimi: l.cmimi, totali: l.totali, monedha: p.monedha, kursi, anuluar: false })
    })

    // Kartela: [gjendje fillestare / rregullim] + faturë + pagesë (+ payments[] shtesë)
    let bal = p.gjendjaParaLlogaritur
    let k = 0
    const ledger = (suffix, tipi, shuma, date, extra = {}) => {
      put('ledger', `imp_${id}_${suffix}`, {
        clientId: p.clientId, tipi, monedha: p.monedha, kursi, shuma, data: ts(date), shenim: extra.shenim ?? '', arsye: extra.arsye ?? '',
        metoda: tipi === 'pagese' ? 'arke' : null, faturaId: id, gjendjaPara: bal, gjendjaPas: bal + shuma, uid: by.uid, emri: by.emri, krijuar: ts(p.date, k++),
      })
      bal += shuma
    }
    if (p.adj) ledger('adj', p.adj.tipi, p.adj.shuma, p.date, { shenim: p.adj.shenim, arsye: p.adj.arsye ?? '' })
    ledger('fat', 'fature', p.totali, p.date, { shenim: `Fatura #${numri}` })
    if (p.paguar !== 0) {
      const payDate = parseDate(inv.paymentDate) ?? p.date
      if (inv.paymentDate && !parseDate(inv.paymentDate)) R.badDates.push({ fatura: numri, fusha: 'Data e pagesës', vlera: inv.paymentDate })
      if (p.isReturn) {
        ledger('pag', 'kthim', -p.paguar, payDate, { shenim: `Kthim malli te fatura #${numri} (${IMPORT_NOTE})`, arsye: IMPORT_NOTE })
      } else {
        ledger('pag', 'pagese', -p.paguar, payDate, { shenim: `Paguar te fatura #${numri}` })
        put('cashMovements', `imp_${id}_cash`, {
          llogaria: 'arke', monedha: p.monedha, kursi, shuma: p.paguar, tipi: 'arketim', data: ts(payDate), shenim: `${c.emri} – fatura #${numri} (${IMPORT_NOTE})`,
          clientId: p.clientId, ledgerId: `imp_${id}_pag`, invoiceId: id, refId: null, transferId: null, uid: by.uid, emri: by.emri, krijuar: ts(payDate),
        })
        cash[p.monedha] += p.paguar
      }
    }
    p.extra.forEach((x, j) => {
      ledger(`pp${j}`, 'pagese', -x.shuma, x.date, { shenim: `Pagesë (${IMPORT_NOTE})` })
      put('cashMovements', `imp_${id}_cash${j}`, {
        llogaria: 'arke', monedha: p.monedha, kursi, shuma: x.shuma, tipi: 'arketim', data: ts(x.date), shenim: `${c.emri} (${IMPORT_NOTE})`,
        clientId: p.clientId, ledgerId: `imp_${id}_pp${j}`, invoiceId: id, refId: null, transferId: null, uid: by.uid, emri: by.emri, krijuar: ts(x.date),
      })
      cash[p.monedha] += x.shuma
    })

    // Stoku: një lëvizje "dalje" për çdo artikull të faturës
    const agg = new Map()
    for (const l of rreshtat) agg.set(l.itemId, (agg.get(l.itemId) ?? 0) + l.sasia)
    for (const [itemId, q] of agg) {
      addStock(itemId, -q)
      put('stockMovements', `imp_d_${id}_${itemId}`, { itemId, tipi: 'dalje', sasia: -q, dokument: 'fature', invoiceId: id, purchaseId: null, numri, data: ts(p.date), arsye: '', uid: by.uid, emri: by.emri, krijuar: ts(p.date) })
    }
  }

  // 5. Pikët e vjetra
  for (const [id, c] of clients) {
    if (c.piketVjetra > 0) {
      put('loyaltyPoints', `imp_pts_${id}`, { clientId: id, tipi: 'gjendje_fillestare', pike: c.piketVjetra, piketPara: 0, piketPas: c.piketVjetra, arsye: `Pikët nga sistemi i vjetër (${IMPORT_NOTE})`, invoiceIds: [], uid: by.uid, emri: by.emri, krijuar: ts(firstDate) })
    }
  }

  // 6. Klientët (me gjendjen përfundimtare)
  for (const [id, c] of clients) {
    const { piketVjetra, ...doc } = c
    put('clients', id, { ...doc, piket: piketVjetra, lastLedgerIds: [], krijuar: ts(firstDate) })
  }

  // Kontroll: gjendja e klientit = gjendja e re e faturës së fundit (minus pagesat shtesë)
  for (const [key, list] of chains) {
    const [clientId, monedha] = key.split('|')
    const last = plan.get(String(list[list.length - 1].id))
    R.balanceChecks += 1
    const expected = last.gjendjaRe - last.extra.reduce((s, x) => s + x.shuma, 0)
    if (clients.get(clientId).gjendje[monedha] !== expected) R.balanceErrors.push({ klienti: clients.get(clientId).emri, monedha })
  }

  // 7. Stoku, arka, numëruesit
  for (const [itemId, sasia] of stock) {
    put('stock', itemId, { sasia })
    if (sasia < 0) R.negativeStock.push({ id: itemId, kodi: items.get(itemId)?.kodi, emri: items.get(itemId)?.emri, sasia })
  }
  R.negativeStock.sort((a, b) => a.sasia - b.sasia)
  put('cashBalances', 'main', { arke: { LEK: cash.LEK, ...(cash.EUR ? { EUR: cash.EUR } : {}) }, banke: {} })
  put('counters', 'invoices', { next: nextInvoice })
  put('counters', 'purchases', { next: maxEntry + 1 })
  put('counters', 'clients', { next: maxKl + 1 })
  put('counters', 'items', { next: itemN + 1 })

  const summary = {
    klientet: clients.size,
    artikujt: items.size,
    faturat: invoices.length,
    rreshtat: invoices.reduce((s, i) => s + (i.items?.length ?? 0), 0),
    hyrjet: (backup.stock_entries ?? []).length,
    arketimet: cash,
    nextInvoice,
    maxNumber,
    shkrime: ops.length + 1,
  }
  put('auditLog', 'imp_permbledhje', { action: 'import_backup', entity: 'import', entityId: null, details: { ...summary, rinumeruar: R.renumbered.length }, uid: by.uid, emri: actor.emri ?? '', koha: Timestamp.now() })
  return { ops, report: R, summary }
}

// ---------- Ekzekutimi ----------

/** Gjendja e importit; `pending` = ka shkrime që serveri s'i ka pranuar ende (p.sh. kuota). */
export function watchImportMeta(onData, onError) {
  return onSnapshot(metaRef(), { includeMetadataChanges: true }, (s) => onData(s.exists() ? { ...s.data(), pending: s.metadata.hasPendingWrites } : null), onError)
}

/** Progresi i konfirmuar nga serveri (jo kopja lokale). */
export async function readImportProgress() {
  const s = await getDocFromServer(metaRef())
  return s.exists() ? s.data() : null
}

export async function setImportMode(aktiv, extra = {}) {
  await setDoc(metaRef(), { aktiv, ndryshuar: serverTimestamp(), ...extra }, { merge: true })
}

export class QuotaError extends Error {}

/**
 * Shkruan ops nga `startAt` me batch-e. Çdo batch ruan progresin te meta/import
 * (atomik me shkrimet), ndaj mund të vazhdohet saktësisht.
 */
export async function runImport(ops, { hash, startAt = 0, onProgress }) {
  await setImportMode(true, { planHash: hash, total: ops.length, done: startAt, perfunduar: false })
  for (let i = startAt; i < ops.length; i += BATCH_SIZE) {
    const end = Math.min(i + BATCH_SIZE, ops.length)
    const batch = writeBatch(db)
    for (const op of ops.slice(i, end)) {
      const ref = companyDoc(op.col, op.id)
      if (op.merge) batch.set(ref, op.data, { merge: true })
      else batch.set(ref, op.data)
    }
    batch.set(metaRef(), { done: end, ndryshuar: serverTimestamp(), ...(end === ops.length ? { perfunduar: true } : {}) }, { merge: true })
    try {
      // Kur mbaron kuota ditore, Firestore nuk e refuzon shkrimin por e riprovon pa fund.
      // Pas 60 sekondash pa përgjigje e trajtojmë si kuotë të mbaruar.
      let timer
      await Promise.race([
        batch.commit().finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new QuotaError(`Firebase nuk po pranon më shkrime pas ${i} nga ${ops.length} – me shumë gjasa u arrit kuota ditore.`)), 60000)
        }),
      ])
    } catch (err) {
      if (err instanceof QuotaError) throw err
      if (err?.code === 'resource-exhausted') throw new QuotaError(`Kuota ditore e Firebase u arrit pas ${i} nga ${ops.length} shkrime.`)
      throw err
    }
    onProgress?.(end, ops.length)
  }
}
