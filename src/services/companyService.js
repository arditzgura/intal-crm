import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { auth, db, setCompanyId } from '../firebase'
import { normalizeUsername, validUsername } from './authService'

/**
 * Shumë kompani: çdo kompani ka dokumentin `companies/{id}` dhe të dhënat nën të.
 * Një kompani e re krijohet me një kod ftese (`inviteCodes/{KODI}`, një përdorim),
 * nga personi që bëhet Admini i saj. Super-Admini (pronari i aplikacionit) krijon kodet.
 */
const inviteRef = (code) => doc(db, 'inviteCodes', code)
export const normalizeCode = (c) => (c ?? '').trim().toUpperCase()

/** Kontrollon kodin para krijimit të llogarisë (që të mos mbetet llogari pa kompani). */
export async function checkInvite(code) {
  const snap = await getDoc(inviteRef(normalizeCode(code)))
  if (!snap.exists() || !snap.data().aktiv) throw new Error('Kodi i ftesës nuk është i vlefshëm.')
  if (snap.data().usedBy) throw new Error('Ky kod ftese është përdorur tashmë.')
}

/**
 * Regjistron një kompani të re: llogaria (email + fjalëkalim), kompania, Admini i saj
 * dhe shënimi i kodit të ftesës si i përdorur – në një batch. Dërgon email-in e verifikimit.
 */
export async function registerCompany({ code, kompania = '', emri = '', email, password, username = '' }) {
  const kodi = normalizeCode(code)
  const user = normalizeUsername(username)
  // Emri i kompanisë dhe i Adminit mund të plotësohen më vonë te Cilësimet.
  kompania = kompania.trim() || 'Kompania ime'
  emri = emri.trim() || email.trim().split('@')[0]
  if (user && !validUsername(user)) throw new Error('Emri i përdoruesit: 3–30 shkronja të vogla, shifra ose . _ -')
  await checkInvite(kodi)
  if (user && (await getDoc(doc(db, 'usernames', user))).exists()) throw new Error('Ky emër përdoruesi është i zënë.')

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
  const uid = cred.user.uid
  const companyRef = doc(collection(db, 'companies'))
  const batch = writeBatch(db)
  batch.set(companyRef, {
    emri: kompania.trim(),
    ownerUid: uid,
    ownerEmail: email.trim(),
    ownerEmri: emri.trim(),
    kodiFtese: kodi,
    aktiv: true,
    krijuar: serverTimestamp(),
  })
  batch.set(doc(db, 'users', uid), {
    companyId: companyRef.id,
    roli: 'admin',
    emri: emri.trim(),
    email: email.trim(),
    ...(user ? { username: user } : {}),
    aktiv: true,
    duhetVerifikim: true,
    krijuar: serverTimestamp(),
  })
  if (user) batch.set(doc(db, 'usernames', user), { email: email.trim(), uid, companyId: companyRef.id })
  batch.update(inviteRef(kodi), { usedBy: uid, companyId: companyRef.id, perdorur: serverTimestamp() })
  await batch.commit()
  setCompanyId(companyRef.id)
  await sendEmailVerification(cred.user)
  return companyRef.id
}

// ---------- Super-Admin ----------

export async function listCompanies() {
  const snap = await getDocs(collection(db, 'companies'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.krijuar?.toMillis?.() ?? 0) - (a.krijuar?.toMillis?.() ?? 0))
}

export async function listInvites() {
  const snap = await getDocs(collection(db, 'inviteCodes'))
  return snap.docs.map((d) => ({ code: d.id, ...d.data() })).sort((a, b) => (b.krijuar?.toMillis?.() ?? 0) - (a.krijuar?.toMillis?.() ?? 0))
}

/** Kod i ri ftese, p.sh. "K7Q2-M9XA" (pa shkronja që ngatërrohen: 0/O, 1/I). */
export async function createInvite(shenim = '') {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const rnd = crypto.getRandomValues(new Uint32Array(8))
  const raw = [...rnd].map((n) => abc[n % abc.length]).join('')
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`
  await setDoc(inviteRef(code), { aktiv: true, shenim: shenim.trim(), usedBy: null, companyId: null, krijuar: serverTimestamp() })
  return code
}

export function setInviteActive(code, aktiv) {
  return updateDoc(inviteRef(code), { aktiv })
}
