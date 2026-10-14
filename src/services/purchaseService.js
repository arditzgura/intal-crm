import { getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, startAfter, where } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'
import { formatDocNumber } from './settingsService'
import { readSettings } from './invoiceChain'
import { aggregateByItem, writeMovement } from './stockService'
import { toLek } from '../utils/money'
import { millis } from '../utils/date'

/**
 * Hyrjet e mallit (Blerje).
 *
 * Ruajtja bëhet në NJË transaction: numri unik (counters/purchases +
 * purchaseNumbers/{numri}) · lëvizjet "hyrje" + stoku · kosto dhe çmimi i
 * artikujve (opsionale) · detyrimi ndaj furnitorit të jashtëm · auditLog.
 *
 * Detyrimi ndaj furnitorit mbahet veçmas nga kartela e klientit:
 * `clients.detyrimFurnitori.{MONEDHA}` (pozitiv = i detyrohemi furnitorit) +
 * `supplierLedger` (blerje +, anulim / pagesë −). Pagesat bëhen te Financa (Faza 5).
 */

const counterRef = () => companyDoc('counters', 'purchases')
const numberRef = (n) => companyDoc('purchaseNumbers', String(n))

function cleanLines(rreshtat) {
  return rreshtat
    .filter((r) => r.itemId)
    .map((r) => {
      const sasia = Math.trunc(Number(r.sasia))
      const cmimiBlerjes = Math.trunc(Number(r.cmimiBlerjes))
      const cmimiShitjes = Math.trunc(Number(r.cmimiShitjes))
      if (!Number.isInteger(sasia) || sasia <= 0) throw new Error(`Sasia e "${r.emri}" nuk është e vlefshme.`)
      if (!Number.isInteger(cmimiBlerjes) || cmimiBlerjes < 0) throw new Error(`Çmimi i blerjes së "${r.emri}" nuk është i vlefshëm.`)
      if (!Number.isInteger(cmimiShitjes) || cmimiShitjes < 0) throw new Error(`Çmimi i shitjes së "${r.emri}" nuk është i vlefshëm.`)
      return {
        itemId: r.itemId,
        kodi: r.kodi ?? '',
        emri: r.emri ?? '',
        njesia: r.njesia ?? '',
        sasia,
        cmimiBlerjes,
        cmimiShitjes,
        totaliBlerje: sasia * cmimiBlerjes,
        totaliShitje: sasia * cmimiShitjes,
      }
    })
}

/** Kartela e furnitorit: shkruan lëvizjen dhe kthen patch-in për klientin. */
function writeSupplierEntry(tx, { clientId, client, tipi, monedha, kursi, shuma, data, purchaseId, numri, shenim }, actorName) {
  const ref = newDocRef('supplierLedger')
  const para = client.detyrimFurnitori?.[monedha] ?? 0
  tx.set(ref, {
    clientId,
    tipi,
    monedha,
    kursi,
    shuma,
    data,
    purchaseId,
    numri,
    shenim,
    detyrimiPara: para,
    detyrimiPas: para + shuma,
    uid: auth.currentUser.uid,
    emri: actorName ?? '',
    krijuar: serverTimestamp(),
  })
  return { [`detyrimFurnitori.${monedha}`]: para + shuma, lastSupplierLedgerId: ref.id }
}

/**
 * @param data { data (Timestamp), origjina: 'brendshme'|'furnitor', origjinaEmri, furnitorId,
 *   kategoria, monedha, kursi, rreshtat, shenime, perditesoKoston, perditesoCmimin }
 * @param caps { canCost, canPrice } – lejet e përdoruesit për koston / çmimin
 */
export async function createPurchase(data, caps, actorName) {
  const rreshtat = cleanLines(data.rreshtat)
  if (!rreshtat.length) throw new Error('Hyrja nuk ka asnjë artikull.')
  const external = data.origjina === 'furnitor'
  if (external && !data.furnitorId) throw new Error('Zgjidhni furnitorin.')
  if (!external && !data.origjinaEmri?.trim()) throw new Error('Zgjidhni origjinën.')
  const { monedha, kursi } = data
  const totaliBlerje = rreshtat.reduce((s, l) => s + l.totaliBlerje, 0)
  const totaliShitje = rreshtat.reduce((s, l) => s + l.totaliShitje, 0)
  const ref = newDocRef('purchases')
  const uid = auth.currentUser.uid
  const updateCost = data.perditesoKoston && caps.canCost
  const updatePrice = data.perditesoCmimin && caps.canPrice

  return runTransaction(db, async (tx) => {
    // ---------- leximet ----------
    const counter = await tx.get(counterRef())
    let n = counter.exists() ? counter.data().next : 1
    for (let i = 0; i < 100; i++) {
      if (!(await tx.get(numberRef(n))).exists()) break
      n++
    }
    const settings = await readSettings(tx)
    let supplier = null
    if (external) {
      const s = await tx.get(companyDoc('clients', data.furnitorId))
      if (!s.exists()) throw new Error('Furnitori nuk ekziston.')
      supplier = s.data()
    }

    // ---------- shkrimet ----------
    const numriTekst = formatDocNumber(settings.numerimi.purchases, n)
    tx.set(numberRef(n), { purchaseId: ref.id, krijuar: serverTimestamp() })
    tx.set(counterRef(), { next: n + 1 }, { merge: true })
    tx.set(ref, {
      numri: n,
      numriTekst,
      statusi: 'regjistruar',
      data: data.data,
      origjina: data.origjina,
      origjinaEmri: external ? supplier.emri : data.origjinaEmri.trim(),
      furnitorId: external ? data.furnitorId : null,
      furnitor: external ? { kodi: supplier.kodi, emri: supplier.emri, nipt: supplier.nipt ?? '', qyteti: supplier.qyteti ?? '' } : null,
      kategoria: data.kategoria ?? '',
      monedha,
      kursi,
      rreshtat,
      totaliBlerje,
      totaliShitje,
      perditesoiKoston: !!updateCost,
      perditesoiCmimin: !!updatePrice,
      shenime: (data.shenime ?? '').trim(),
      krijuar: serverTimestamp(),
      krijuarNga: { uid, emri: actorName ?? '' },
      anuluar: null,
    })

    for (const m of aggregateByItem(rreshtat)) {
      writeMovement(tx, { itemId: m.itemId, sasia: m.sasia, tipi: 'hyrje', dokument: 'hyrje', purchaseId: ref.id, numri: n, data: data.data }, actorName)
    }

    // Kosto / çmimi: rreshti i fundit për çdo artikull fiton
    const lastByItem = new Map(rreshtat.map((l) => [l.itemId, l]))
    for (const [itemId, l] of lastByItem) {
      if (updateCost) {
        const kosto = toLek(l.cmimiBlerjes, kursi)
        tx.set(companyDoc('itemCosts', itemId), { kosto, burim: ref.id })
        tx.set(newDocRef('costHistory'), { itemId, kosto, nga: data.data, burim: ref.id })
      }
      if (updatePrice) tx.update(companyDoc('items', itemId), { cmimi: l.cmimiShitjes })
    }

    if (external && totaliBlerje > 0) {
      const patch = writeSupplierEntry(tx, {
        clientId: data.furnitorId, client: supplier, tipi: 'blerje', monedha, kursi, shuma: totaliBlerje,
        data: data.data, purchaseId: ref.id, numri: n, shenim: `Hyrja e mallit ${numriTekst}`,
      }, actorName)
      tx.update(companyDoc('clients', data.furnitorId), patch)
    }

    addAudit(tx, {
      action: 'regjistrim_hyrjeje',
      entity: 'purchases',
      entityId: ref.id,
      details: { numri: n, origjina: external ? supplier.emri : data.origjinaEmri, monedha, totaliBlerje, totaliShitje, artikuj: rreshtat.length, perditesoKoston: !!updateCost, perditesoCmimin: !!updatePrice },
      actorName,
    })
    return { id: ref.id, numri: n, numriTekst }
  })
}

/** Anulon një hyrje (me arsye): stoku zbritet, detyrimi ndaj furnitorit hiqet. Kosto nuk kthehet. */
export async function cancelPurchase(id, arsye, actorName) {
  if (!arsye?.trim()) throw new Error('Arsyeja e anulimit është e detyrueshme.')
  const ref = companyDoc('purchases', id)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Hyrja nuk ekziston.')
    const P = snap.data()
    if (P.statusi !== 'regjistruar') throw new Error('Kjo hyrje është anuluar tashmë.')
    let supplier = null
    if (P.furnitorId && P.totaliBlerje > 0) {
      const s = await tx.get(companyDoc('clients', P.furnitorId))
      supplier = s.exists() ? s.data() : null
    }

    tx.update(ref, { statusi: 'anuluar', anuluar: { koha: serverTimestamp(), uid: auth.currentUser.uid, emri: actorName ?? '', arsye: arsye.trim() } })
    for (const m of aggregateByItem(P.rreshtat)) {
      writeMovement(tx, { itemId: m.itemId, sasia: -m.sasia, tipi: 'anulim_hyrje', dokument: 'anulim_hyrje', purchaseId: id, numri: P.numri, arsye: arsye.trim() }, actorName)
    }
    if (supplier) {
      const patch = writeSupplierEntry(tx, {
        clientId: P.furnitorId, client: supplier, tipi: 'anulim_blerje', monedha: P.monedha, kursi: P.kursi, shuma: -P.totaliBlerje,
        data: serverTimestamp(), purchaseId: id, numri: P.numri, shenim: `Anulim i hyrjes ${P.numriTekst}: ${arsye.trim()}`,
      }, actorName)
      tx.update(companyDoc('clients', P.furnitorId), patch)
    }
    addAudit(tx, { action: 'anulim_hyrjeje', entity: 'purchases', entityId: id, details: { numri: P.numri, totaliBlerje: P.totaliBlerje, arsye: arsye.trim() }, actorName })
  })
}

// ---------- Leximet ----------

export function watchPurchase(id, onData, onError) {
  return onSnapshot(companyDoc('purchases', id), (s) => onData(s.exists() ? { id: s.id, ...s.data() } : null), onError)
}

export const PAGE = 50

/** filters: { furnitorId, statusi, from, to } */
export async function queryPurchases(filters = {}, cursor = null) {
  const cons = []
  if (filters.furnitorId) cons.push(where('furnitorId', '==', filters.furnitorId))
  if (filters.statusi) cons.push(where('statusi', '==', filters.statusi))
  if (filters.from) cons.push(where('data', '>=', filters.from))
  if (filters.to) cons.push(where('data', '<=', filters.to))
  cons.push(orderBy('data', 'desc'))
  if (cursor) cons.push(startAfter(cursor))
  cons.push(limit(PAGE + 1))
  const snap = await getDocs(query(companyCol('purchases'), ...cons))
  const docs = snap.docs.slice(0, PAGE)
  return { rows: docs.map((d) => ({ id: d.id, ...d.data() })), cursor: docs[docs.length - 1] ?? null, more: snap.docs.length > PAGE }
}

/** Kartela e furnitorit (më e vjetra e para). */
export function watchSupplierLedger(clientId, onData, onError) {
  return onSnapshot(
    query(companyCol('supplierLedger'), where('clientId', '==', clientId)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(a.data) - millis(b.data) || millis(a.krijuar) - millis(b.krijuar))),
    onError,
  )
}
