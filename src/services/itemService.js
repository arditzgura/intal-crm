import { getDoc, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'

/**
 * Artikujt. Çmimi i blerjes (kosto) ruhet në `itemCosts/{id}`, jo te artikulli,
 * që Rules ta fshehin nga roli Shitës. Kodi është unik: çdo kod ka një dokument
 * `itemCodes/{KODI}` që krijohet në të njëjtin transaction me artikullin.
 */

export const UNITS = ['copë', 'pako']

export const EMPTY_ITEM = {
  kodi: '',
  emri: '',
  kategoria: '',
  nenkategoria: '',
  njesia: 'copë',
  cmimi: 0,
  stokMinimal: 0,
}

const ITEM_FIELDS = ['emri', 'kategoria', 'nenkategoria', 'njesia', 'cmimi', 'stokMinimal']

export const formatItemCode = (n) => `A${String(n).padStart(3, '0')}`

/** Çelësi i kodit për unicitet: pa hapësira, shkronja të mëdha. */
export function codeKey(kodi) {
  return String(kodi ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

function validateCode(kodi) {
  const key = codeKey(kodi)
  if (!key) throw new Error('Kodi i artikullit është i detyrueshëm.')
  if (!/^[A-Z0-9._-]{1,30}$/.test(key)) {
    throw new Error('Kodi mund të ketë vetëm shkronja, shifra, "-", "_" ose "." (max 30).')
  }
  return key
}

function cleanItem(data) {
  const out = {}
  for (const k of ITEM_FIELDS) out[k] = typeof data[k] === 'string' ? data[k].trim() : data[k]
  if (!out.emri) throw new Error('Emri i artikullit është i detyrueshëm.')
  if (!Number.isInteger(out.cmimi) || out.cmimi < 0) throw new Error('Çmimi i shitjes nuk është i vlefshëm.')
  if (!Number.isInteger(out.stokMinimal) || out.stokMinimal < 0) out.stokMinimal = 0
  return out
}

export function watchItems(onData, onError) {
  return onSnapshot(
    companyCol('items'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

/** Kostot (vetëm për rolet që i lejon Rules). Kthen { itemId: kosto }. */
export function watchItemCosts(onData, onError) {
  return onSnapshot(
    companyCol('itemCosts'),
    (snap) => onData(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().kosto]))),
    onError,
  )
}

/** Kodi i ardhshëm automatik (vetëm sugjerim; konfirmohet në transaction). */
export async function suggestItemCode() {
  const snap = await getDoc(companyDoc('counters', 'items'))
  return formatItemCode(snap.exists() ? snap.data().next : 1)
}

/**
 * Krijon artikullin. Nëse kodi është ai automatik, numëruesi rritet dhe,
 * nëse kodi është i zënë, merret i ardhshmi i lirë.
 */
export async function createItem(data, kosto, { autoCode }, actorName) {
  const fields = cleanItem(data)
  const ref = newDocRef('items')
  const counterRef = companyDoc('counters', 'items')

  const kodi = await runTransaction(db, async (tx) => {
    let key
    let nextCounter = null
    if (autoCode) {
      const c = await tx.get(counterRef)
      let n = c.exists() ? c.data().next : 1
      // Kapërce kodet e zëna me dorë
      for (let i = 0; i < 50; i++) {
        key = formatItemCode(n)
        if (!(await tx.get(companyDoc('itemCodes', key))).exists()) break
        n++
      }
      nextCounter = n + 1
    } else {
      key = validateCode(data.kodi)
      if ((await tx.get(companyDoc('itemCodes', key))).exists()) {
        throw new Error(`Kodi "${key}" përdoret nga një artikull tjetër.`)
      }
    }
    if (nextCounter) tx.set(counterRef, { next: nextCounter }, { merge: true })
    tx.set(companyDoc('itemCodes', key), { itemId: ref.id })
    tx.set(ref, { ...fields, kodi: key, arkivuar: false, krijuar: serverTimestamp() })
    if (kosto != null) tx.set(companyDoc('itemCosts', ref.id), { kosto })
    addAudit(tx, { action: 'krijim_artikulli', entity: 'items', entityId: ref.id, details: { kodi: key, ...fields, kosto: kosto ?? null }, actorName })
    return key
  })
  return { id: ref.id, kodi }
}

/** Ndryshon artikullin; nëse ndryshon kodi, kontrollon unicitetin. `kosto` = undefined → nuk preket. */
export async function updateItem(id, data, kosto, actorName) {
  const fields = cleanItem(data)
  const ref = companyDoc('items', id)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Artikulli nuk ekziston.')
    const oldKey = snap.data().kodi
    const newKey = validateCode(data.kodi)
    if (newKey !== oldKey) {
      if ((await tx.get(companyDoc('itemCodes', newKey))).exists()) {
        throw new Error(`Kodi "${newKey}" përdoret nga një artikull tjetër.`)
      }
      tx.delete(companyDoc('itemCodes', oldKey))
      tx.set(companyDoc('itemCodes', newKey), { itemId: id })
    }
    tx.update(ref, { ...fields, kodi: newKey })
    if (kosto !== undefined) tx.set(companyDoc('itemCosts', id), { kosto })
    addAudit(tx, {
      action: 'ndryshim_artikulli',
      entity: 'items',
      entityId: id,
      details: {
        ...fields,
        kodi: newKey,
        ...(newKey !== oldKey ? { kodiVjeter: oldKey } : {}),
        ...(kosto !== undefined ? { kosto } : {}),
      },
      actorName,
    })
  })
}

export async function setItemArchived(id, arkivuar, actorName) {
  const batch = writeBatch(db)
  batch.update(companyDoc('items', id), { arkivuar })
  addAudit(batch, { action: arkivuar ? 'arkivim_artikulli' : 'riaktivizim_artikulli', entity: 'items', entityId: id, actorName })
  await batch.commit()
}

// ---------- Çmimet preferenciale ----------

const priceId = (itemId, clientId) => `${itemId}_${clientId}`

export function watchPricesForItem(itemId, onData, onError) {
  return onSnapshot(
    query(companyCol('preferentialPrices'), where('itemId', '==', itemId)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

export function watchPricesForClient(clientId, onData, onError) {
  return onSnapshot(
    query(companyCol('preferentialPrices'), where('clientId', '==', clientId)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

export async function setPreferentialPrice(itemId, clientId, cmimi, actorName) {
  if (!Number.isInteger(cmimi) || cmimi < 0) throw new Error('Çmimi nuk është i vlefshëm.')
  const id = priceId(itemId, clientId)
  const batch = writeBatch(db)
  batch.set(companyDoc('preferentialPrices', id), { itemId, clientId, cmimi, ndryshuar: serverTimestamp() })
  addAudit(batch, { action: 'cmim_preferencial', entity: 'preferentialPrices', entityId: id, details: { itemId, clientId, cmimi }, actorName })
  await batch.commit()
}

export async function removePreferentialPrice(itemId, clientId, actorName) {
  const id = priceId(itemId, clientId)
  const batch = writeBatch(db)
  batch.delete(companyDoc('preferentialPrices', id))
  addAudit(batch, { action: 'heqje_cmimi_preferencial', entity: 'preferentialPrices', entityId: id, details: { itemId, clientId }, actorName })
  await batch.commit()
}
