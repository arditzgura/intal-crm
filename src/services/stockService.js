import {
  getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp,
  startAfter, where, writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'
import { millis } from '../utils/date'

/**
 * Stoku.
 *
 * Burimi i së vërtetës janë lëvizjet (`stockMovements`, vetëm shtim):
 *   stoku = Σ sasia (hyrje +, dalje −, rregullime ±).
 * `stock/{itemId}.sasia` është vetëm kopje për shpejtësi, e përditësuar me
 * increment() në të njëjtin transaction me lëvizjen. Admini mund ta rindërtojë
 * kurdo nga lëvizjet ("Rillogarit stokun").
 */

export const MOVEMENT_TYPES = {
  hyrje: 'Hyrje malli',
  dalje: 'Dalje (faturë)',
  kthim_anulim: 'Kthim nga anulimi i faturës',
  anulim_hyrje: 'Anulim hyrjeje',
  rregullim: 'Rregullim / inventarizim',
  ndryshim_fature: 'Ndryshim fature (diferenca)',
}

/** Bashkon rreshtat sipas artikullit: [{ itemId, sasia }] (një lëvizje për artikull për dokument). */
export function aggregateByItem(lines) {
  const m = new Map()
  for (const l of lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.sasia)
  return [...m.entries()].map(([itemId, sasia]) => ({ itemId, sasia }))
}

/**
 * Shkruan një lëvizje stoku + përditëson kopjen e stokut (brenda tx/batch).
 * `sasia` me shenjë.
 */
export function writeMovement(tx, { itemId, sasia, tipi, dokument, data, numri = null, invoiceId = null, purchaseId = null, arsye = '' }, actorName) {
  if (!sasia) return null
  const ref = newDocRef('stockMovements')
  tx.set(ref, {
    itemId,
    tipi,
    sasia,
    dokument,
    invoiceId,
    purchaseId,
    numri,
    data: data ?? serverTimestamp(),
    arsye,
    uid: auth.currentUser.uid,
    emri: actorName ?? '',
    krijuar: serverTimestamp(),
  })
  tx.set(companyDoc('stock', itemId), { sasia: increment(sasia) }, { merge: true })
  return ref.id
}

/** Stoku i të gjithë artikujve: { itemId: sasia }. */
export function watchStock(onData, onError) {
  return onSnapshot(
    companyCol('stock'),
    (snap) => onData(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().sasia ?? 0]))),
    onError,
  )
}

/** Lëvizjet e një artikulli, më e reja e para. */
export function watchMovementsForItem(itemId, onData, onError) {
  return onSnapshot(
    query(companyCol('stockMovements'), where('itemId', '==', itemId)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.krijuar) - millis(a.krijuar))),
    onError,
  )
}

/**
 * Σ sasia e lëvizjeve me datë ≥ `from`, për artikull: { itemId: sasia }.
 * Stoku në fund të ditës para `from` = stoku aktual − kjo shumë.
 */
export async function movementsSince(from) {
  const snap = await getDocs(query(companyCol('stockMovements'), where('data', '>=', from)))
  const out = {}
  for (const d of snap.docs) {
    const { itemId, sasia } = d.data()
    out[itemId] = (out[itemId] ?? 0) + (sasia ?? 0)
  }
  return out
}

export const PAGE = 50

/** Regjistri i lëvizjeve (të gjitha artikujt), me faqe. */
export async function queryMovements({ tipi } = {}, cursor = null) {
  const cons = []
  if (tipi) cons.push(where('tipi', '==', tipi))
  cons.push(orderBy('krijuar', 'desc'))
  if (cursor) cons.push(startAfter(cursor))
  cons.push(limit(PAGE + 1))
  const snap = await getDocs(query(companyCol('stockMovements'), ...cons))
  const docs = snap.docs.slice(0, PAGE)
  return { rows: docs.map((d) => ({ id: d.id, ...d.data() })), cursor: docs[docs.length - 1] ?? null, more: snap.docs.length > PAGE }
}

/**
 * Inventarizim: për çdo artikull jepet sasia e numëruar; ruhet diferenca si
 * lëvizje "rregullim" (me arsye). rows: [{ itemId, aktuale, numeruar }]
 */
export async function adjustStock(rows, arsye, actorName) {
  if (!arsye?.trim()) throw new Error('Arsyeja e rregullimit është e detyrueshme.')
  const changes = rows
    .map((r) => ({ ...r, diff: r.numeruar - r.aktuale }))
    .filter((r) => Number.isInteger(r.numeruar) && r.diff !== 0)
  if (!changes.length) throw new Error('Asnjë diferencë për të ruajtur.')
  // Max ~200 artikuj për transaction (2 shkrime për artikull + log)
  for (let i = 0; i < changes.length; i += 200) {
    const chunk = changes.slice(i, i + 200)
    await runTransaction(db, async (tx) => {
      for (const c of chunk) {
        writeMovement(tx, { itemId: c.itemId, sasia: c.diff, tipi: 'rregullim', dokument: 'rregullim', arsye: arsye.trim() }, actorName)
      }
      addAudit(tx, {
        action: 'rregullim_stoku',
        entity: 'stock',
        entityId: chunk.length === 1 ? chunk[0].itemId : null,
        details: { arsye: arsye.trim(), artikuj: chunk.map((c) => ({ itemId: c.itemId, nga: c.aktuale, ne: c.numeruar })) },
        actorName,
      })
    })
  }
  return changes.length
}

/** Admini: rindërton `stock/{itemId}` nga të gjitha lëvizjet. Kthen numrin e artikujve. */
export async function recalcStock(itemIds, actorName) {
  const snap = await getDocs(companyCol('stockMovements'))
  const sums = Object.fromEntries(itemIds.map((id) => [id, 0]))
  for (const d of snap.docs) {
    const { itemId, sasia } = d.data()
    sums[itemId] = (sums[itemId] ?? 0) + (sasia ?? 0)
  }
  const entries = Object.entries(sums)
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db)
    for (const [itemId, sasia] of entries.slice(i, i + 400)) {
      batch.set(companyDoc('stock', itemId), { sasia, rillogaritur: serverTimestamp() })
    }
    if (i === 0) addAudit(batch, { action: 'rillogaritje_stoku', entity: 'stock', details: { artikuj: entries.length, levizje: snap.size }, actorName })
    await batch.commit()
  }
  return { items: entries.length, movements: snap.size }
}
