import { documentId, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { shared } from './sharedLive'
import { addAudit } from './auditService'

export const WALK_IN_ID = 'klient-rastesor'

// Fushat që plotësohen nga forma e klientit. Gjendja dhe pikët nuk janë këtu:
// ndryshojnë vetëm përmes kartelës (ledgerService) dhe pikëve (pointsService).
export const CLIENT_FIELDS = ['emri', 'nipt', 'qyteti', 'adresa', 'telefoni', 'email', 'monedhaPreferuar', 'shenime', 'tipi']

export const EMPTY_CLIENT = {
  emri: '',
  nipt: '',
  qyteti: '',
  adresa: '',
  telefoni: '',
  email: '',
  monedhaPreferuar: 'LEK',
  shenime: '',
  tipi: 'klient',
}

const formatClientCode = (n) => `KL${String(n).padStart(3, '0')}`

function cleanFields(data) {
  const out = {}
  for (const k of CLIENT_FIELDS) out[k] = typeof data[k] === 'string' ? data[k].trim() : data[k]
  return out
}

/** Të gjithë klientët (≈ qindra), live. Kërkimi dhe faqosja bëhen në shfletues. */
export const watchClients = shared('clients', (onData, onError) => {
  return onSnapshot(
    companyCol('clients'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  )
})

export function watchClient(id, onData, onError) {
  return onSnapshot(
    companyDoc('clients', id),
    (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError,
  )
}

/** Krijon klientin me kod të ri KL### (numërues me transaction, pa përsëritje). */
export async function createClient(data, actorName) {
  const fields = cleanFields(data)
  if (!fields.emri) throw new Error('Emri i klientit është i detyrueshëm.')
  const ref = newDocRef('clients')
  const counterRef = companyDoc('counters', 'clients')
  const kodi = await runTransaction(db, async (tx) => {
    const counter = await tx.get(counterRef)
    const n = counter.exists() ? counter.data().next : 1
    const code = formatClientCode(n)
    tx.set(counterRef, { next: n + 1 }, { merge: true })
    tx.set(ref, {
      ...fields,
      kodi: code,
      gjendje: {},
      fillestare: {},
      piket: 0,
      rastesor: false,
      arkivuar: false,
      krijuar: serverTimestamp(),
    })
    addAudit(tx, { action: 'krijim_klienti', entity: 'clients', entityId: ref.id, details: { kodi: code, emri: fields.emri }, actorName })
    return code
  })
  return { id: ref.id, kodi }
}

export async function updateClient(id, data, actorName) {
  const fields = cleanFields(data)
  if (!fields.emri) throw new Error('Emri i klientit është i detyrueshëm.')
  const batch = writeBatch(db)
  batch.update(companyDoc('clients', id), fields)
  addAudit(batch, { action: 'ndryshim_klienti', entity: 'clients', entityId: id, details: fields, actorName })
  await batch.commit()
}

export async function setClientArchived(id, arkivuar, actorName) {
  if (id === WALK_IN_ID) throw new Error('Klienti Rastësor nuk mund të arkivohet.')
  const batch = writeBatch(db)
  batch.update(companyDoc('clients', id), { arkivuar })
  addAudit(batch, { action: arkivuar ? 'arkivim_klienti' : 'riaktivizim_klienti', entity: 'clients', entityId: id, actorName })
  await batch.commit()
}

/** Krijon "Klient Rastësor" (pakicë) nëse nuk ekziston. */
export async function ensureWalkInClient(actorName) {
  const ref = companyDoc('clients', WALK_IN_ID)
  if ((await getDoc(ref)).exists()) return
  const batch = writeBatch(db)
  batch.set(ref, {
    ...EMPTY_CLIENT,
    emri: 'Klient Rastësor',
    shenime: 'Klient pa emër.',
    kodi: 'KL000',
    gjendje: {},
    fillestare: {},
    piket: 0,
    rastesor: true,
    arkivuar: false,
    krijuar: serverTimestamp(),
  })
  addAudit(batch, { action: 'krijim_klienti', entity: 'clients', entityId: WALK_IN_ID, details: { emri: 'Klient Rastësor' }, actorName })
  await batch.commit()
}

/** Lexon vetëm klientët e dhënë (me grupe nga 30): { id: { emri, qyteti, kodi } }. */
export async function clientsByIds(ids) {
  const out = {}
  const list = [...new Set(ids)].filter(Boolean)
  for (let i = 0; i < list.length; i += 30) {
    const snap = await getDocs(query(companyCol('clients'), where(documentId(), 'in', list.slice(i, i + 30))))
    for (const d of snap.docs) out[d.id] = { emri: d.data().emri, qyteti: d.data().qyteti ?? '', kodi: d.data().kodi ?? '' }
  }
  return out
}
