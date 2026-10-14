import {
  getDocs, increment, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where, writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'
import { millis } from '../utils/date'

/**
 * Arka dhe banka.
 *
 * Burimi i së vërtetës: `cashMovements` (vetëm shtim), një lëvizje për çdo
 * hyrje/dalje parash, në të njëjtin transaction me veprimin burim:
 *   arketim (+, pagesë klienti) · kthim_klientit (−, anulim fature) ·
 *   pagese_furnitori (−) · shpenzim (−) · anulim (± kthen një shpenzim/pagesë) ·
 *   transferte (− nga njëra llogari, + te tjetra) · gjendje_fillestare / rregullim (±).
 * `cashBalances/main.{arke|banke}.{MONEDHA}` është kopje për shpejtësi (increment);
 * Admini e rindërton me "Rillogarit arkën".
 */

export const ACCOUNTS = { arke: 'Arkë', banke: 'Bankë' }

export const CASH_TYPES = {
  arketim: 'Arkëtim nga klienti',
  kthim_klientit: 'Kthim parash klientit',
  pagese_furnitori: 'Pagesë furnitorit',
  shpenzim: 'Shpenzim',
  anulim: 'Anulim',
  transferte: 'Transfertë',
  gjendje_fillestare: 'Gjendje fillestare',
  rregullim: 'Rregullim',
}

const balancesRef = () => companyDoc('cashBalances', 'main')

/** Shkruan një lëvizje parash + përditëson kopjen e gjendjes (brenda tx/batch). */
export function writeCash(tx, { llogaria, monedha, kursi, shuma, tipi, data, shenim = '', clientId = null, ledgerId = null, invoiceId = null, refId = null, transferId = null }, actorName) {
  if (!shuma) return null
  const ref = newDocRef('cashMovements')
  tx.set(ref, {
    llogaria,
    monedha,
    kursi: kursi ?? null,
    shuma,
    tipi,
    data: data ?? serverTimestamp(),
    shenim: shenim.trim(),
    clientId,
    ledgerId,
    invoiceId,
    refId,
    transferId,
    uid: auth.currentUser.uid,
    emri: actorName ?? '',
    krijuar: serverTimestamp(),
  })
  tx.set(balancesRef(), { [llogaria]: { [monedha]: increment(shuma) } }, { merge: true })
  return ref.id
}

export function watchCashBalances(onData, onError) {
  return onSnapshot(balancesRef(), (s) => onData(s.exists() ? { arke: s.data().arke ?? {}, banke: s.data().banke ?? {} } : { arke: {}, banke: {} }), onError)
}

/** Lëvizjet e parave për një periudhë (më e reja e para). */
export async function queryCash(from, to) {
  const snap = await getDocs(query(companyCol('cashMovements'), where('data', '>=', from), where('data', '<=', to), orderBy('data', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Admini: rindërton gjendjen e arkës/bankës nga të gjitha lëvizjet. */
export async function recalcCash(actorName) {
  const snap = await getDocs(companyCol('cashMovements'))
  const out = { arke: {}, banke: {} }
  for (const d of snap.docs) {
    const { llogaria, monedha, shuma } = d.data()
    if (!out[llogaria]) continue
    out[llogaria][monedha] = (out[llogaria][monedha] ?? 0) + shuma
  }
  const batch = writeBatch(db)
  batch.set(balancesRef(), { ...out, rillogaritur: serverTimestamp() })
  addAudit(batch, { action: 'rillogaritje_arke', entity: 'cashBalances', details: { levizje: snap.size }, actorName })
  await batch.commit()
  return snap.size
}

// ---------- Lëvizje arke (gjendje fillestare, rregullim, transfertë) ----------

export async function cashAdjust({ tipi, llogaria, monedha, kursi, shuma, data, shenim }, actorName) {
  if (!['gjendje_fillestare', 'rregullim'].includes(tipi)) throw new Error('Lloj i panjohur.')
  if (!Number.isInteger(shuma) || shuma === 0) throw new Error('Shuma duhet të jetë e ndryshme nga zero.')
  if (!shenim?.trim()) throw new Error('Shkruani arsyen / shënimin.')
  const batch = writeBatch(db)
  const id = writeCash(batch, { llogaria, monedha, kursi, shuma, tipi, data, shenim }, actorName)
  addAudit(batch, { action: `arka_${tipi}`, entity: 'cashMovements', entityId: id, details: { llogaria, monedha, shuma, shenim: shenim.trim() }, actorName })
  await batch.commit()
}

export async function cashTransfer({ nga, ne, monedha, kursi, shuma, data, shenim }, actorName) {
  if (nga === ne) throw new Error('Zgjidhni dy llogari të ndryshme.')
  if (!Number.isInteger(shuma) || shuma <= 0) throw new Error('Shuma duhet të jetë pozitive.')
  const batch = writeBatch(db)
  const transferId = newDocRef('cashMovements').id
  const text = shenim?.trim() || `Transfertë ${ACCOUNTS[nga]} → ${ACCOUNTS[ne]}`
  // Dy lëvizje (− / +); kopja e gjendjes përditësohet me një shkrim të vetëm.
  for (const [llogaria, sh] of [[nga, -shuma], [ne, shuma]]) {
    batch.set(newDocRef('cashMovements'), {
      llogaria, monedha, kursi: kursi ?? null, shuma: sh, tipi: 'transferte', data, shenim: text,
      clientId: null, ledgerId: null, invoiceId: null, refId: null, transferId,
      uid: auth.currentUser.uid, emri: actorName ?? '', krijuar: serverTimestamp(),
    })
  }
  batch.set(balancesRef(), { [nga]: { [monedha]: increment(-shuma) }, [ne]: { [monedha]: increment(shuma) } }, { merge: true })
  addAudit(batch, { action: 'arka_transferte', entity: 'cashMovements', entityId: transferId, details: { nga, ne, monedha, shuma }, actorName })
  await batch.commit()
}

// ---------- Shpenzimet ----------

export async function createExpense({ kategoria, llogaria, monedha, kursi, shuma, data, shenim }, actorName) {
  if (!kategoria) throw new Error('Zgjidhni kategorinë.')
  if (!Number.isInteger(shuma) || shuma <= 0) throw new Error('Shuma duhet të jetë pozitive.')
  const ref = newDocRef('expenses')
  const batch = writeBatch(db)
  batch.set(ref, {
    kategoria, llogaria, monedha, kursi, shuma, data, shenim: (shenim ?? '').trim(),
    statusi: 'aktiv', anuluar: null,
    krijuar: serverTimestamp(), krijuarNga: { uid: auth.currentUser.uid, emri: actorName ?? '' },
  })
  writeCash(batch, { llogaria, monedha, kursi, shuma: -shuma, tipi: 'shpenzim', data, shenim: `${kategoria}${shenim?.trim() ? ` – ${shenim.trim()}` : ''}`, refId: ref.id }, actorName)
  addAudit(batch, { action: 'regjistrim_shpenzimi', entity: 'expenses', entityId: ref.id, details: { kategoria, llogaria, monedha, shuma }, actorName })
  await batch.commit()
}

export async function cancelExpense(id, arsye, actorName) {
  if (!arsye?.trim()) throw new Error('Arsyeja është e detyrueshme.')
  const ref = companyDoc('expenses', id)
  await runTransaction(db, async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists() || s.data().statusi !== 'aktiv') throw new Error('Shpenzimi nuk ekziston ose është anuluar.')
    const e = s.data()
    tx.update(ref, { statusi: 'anuluar', anuluar: { koha: serverTimestamp(), uid: auth.currentUser.uid, emri: actorName ?? '', arsye: arsye.trim() } })
    writeCash(tx, { llogaria: e.llogaria, monedha: e.monedha, kursi: e.kursi, shuma: e.shuma, tipi: 'anulim', shenim: `Anulim shpenzimi (${e.kategoria}): ${arsye.trim()}`, refId: id }, actorName)
    addAudit(tx, { action: 'anulim_shpenzimi', entity: 'expenses', entityId: id, details: { shuma: e.shuma, arsye: arsye.trim() }, actorName })
  })
}

export async function queryExpenses(from, to) {
  const snap = await getDocs(query(companyCol('expenses'), where('data', '>=', from), where('data', '<=', to), orderBy('data', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// ---------- Pagesat e furnitorëve ----------

/** Pagesë furnitorit: ul detyrimin (supplierLedger) dhe del nga arka/banka. */
export async function paySupplier({ clientId, llogaria, monedha, kursi, shuma, data, shenim }, actorName) {
  if (!Number.isInteger(shuma) || shuma <= 0) throw new Error('Shuma duhet të jetë pozitive.')
  const clientRef = companyDoc('clients', clientId)
  const payRef = newDocRef('supplierPayments')
  await runTransaction(db, async (tx) => {
    const s = await tx.get(clientRef)
    if (!s.exists()) throw new Error('Furnitori nuk ekziston.')
    const c = s.data()
    const para = c.detyrimFurnitori?.[monedha] ?? 0
    const text = shenim?.trim() || 'Pagesë furnitorit'
    tx.set(payRef, {
      clientId, furnitor: c.emri, llogaria, monedha, kursi, shuma, data, shenim: text,
      statusi: 'aktiv', anuluar: null,
      krijuar: serverTimestamp(), krijuarNga: { uid: auth.currentUser.uid, emri: actorName ?? '' },
    })
    const lref = newDocRef('supplierLedger')
    tx.set(lref, {
      clientId, tipi: 'pagese_furnitori', monedha, kursi, shuma: -shuma, data, paymentId: payRef.id, purchaseId: null, numri: null,
      shenim: `${text} (${ACCOUNTS[llogaria]})`, detyrimiPara: para, detyrimiPas: para - shuma,
      uid: auth.currentUser.uid, emri: actorName ?? '', krijuar: serverTimestamp(),
    })
    tx.update(clientRef, { [`detyrimFurnitori.${monedha}`]: para - shuma, lastSupplierLedgerId: lref.id })
    writeCash(tx, { llogaria, monedha, kursi, shuma: -shuma, tipi: 'pagese_furnitori', data, shenim: `${c.emri}: ${text}`, clientId, refId: payRef.id }, actorName)
    addAudit(tx, { action: 'pagese_furnitori', entity: 'supplierPayments', entityId: payRef.id, details: { furnitori: c.emri, monedha, shuma, llogaria }, actorName })
  })
}

export async function cancelSupplierPayment(id, arsye, actorName) {
  if (!arsye?.trim()) throw new Error('Arsyeja është e detyrueshme.')
  const ref = companyDoc('supplierPayments', id)
  await runTransaction(db, async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists() || s.data().statusi !== 'aktiv') throw new Error('Pagesa nuk ekziston ose është anuluar.')
    const p = s.data()
    const clientRef = companyDoc('clients', p.clientId)
    const c = (await tx.get(clientRef)).data()
    const para = c.detyrimFurnitori?.[p.monedha] ?? 0
    tx.update(ref, { statusi: 'anuluar', anuluar: { koha: serverTimestamp(), uid: auth.currentUser.uid, emri: actorName ?? '', arsye: arsye.trim() } })
    const lref = newDocRef('supplierLedger')
    tx.set(lref, {
      clientId: p.clientId, tipi: 'anulim_pagese', monedha: p.monedha, kursi: p.kursi, shuma: p.shuma, data: serverTimestamp(), paymentId: id, purchaseId: null, numri: null,
      shenim: `Anulim pagese: ${arsye.trim()}`, detyrimiPara: para, detyrimiPas: para + p.shuma,
      uid: auth.currentUser.uid, emri: actorName ?? '', krijuar: serverTimestamp(),
    })
    tx.update(clientRef, { [`detyrimFurnitori.${p.monedha}`]: para + p.shuma, lastSupplierLedgerId: lref.id })
    writeCash(tx, { llogaria: p.llogaria, monedha: p.monedha, kursi: p.kursi, shuma: p.shuma, tipi: 'anulim', shenim: `Anulim pagese furnitori (${p.furnitor}): ${arsye.trim()}`, clientId: p.clientId, refId: id }, actorName)
    addAudit(tx, { action: 'anulim_pagese_furnitori', entity: 'supplierPayments', entityId: id, details: { shuma: p.shuma, arsye: arsye.trim() }, actorName })
  })
}

export async function querySupplierPayments(from, to) {
  const snap = await getDocs(query(companyCol('supplierPayments'), where('data', '>=', from), where('data', '<=', to), orderBy('data', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Cash flow: { 'YYYY-MM' ose 'YYYY-MM-DD': { MONEDHA: { hyrje, dalje } } } */
export function cashFlow(rows, by = 'month', { llogaria } = {}) {
  const out = {}
  for (const r of rows) {
    if (llogaria && r.llogaria !== llogaria) continue
    if (r.tipi === 'transferte' && !llogaria) continue // transfertat nuk janë hyrje/dalje reale
    const d = new Date(millis(r.data))
    const key = by === 'day'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const slot = ((out[key] ??= {})[r.monedha] ??= { hyrje: 0, dalje: 0 })
    if (r.shuma > 0) slot.hyrje += r.shuma
    else slot.dalje -= r.shuma
  }
  return out
}
