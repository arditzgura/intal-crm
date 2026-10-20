import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { auth, db, firebaseConfig, getCompanyId, LEGACY_COMPANY_ID } from '../firebase'
import { addAudit } from './auditService'
import { ensureCompanyInitialized } from './settingsService'
import { normalizeUsername, validUsername } from './authService'

const bootstrapRef = () => doc(db, 'meta', 'bootstrap')

export function watchUserProfile(uid, onData, onError) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => onData(snap.exists() ? { uid, ...snap.data() } : null),
    onError,
  )
}

/** A është krijuar tashmë Admini i parë? */
export async function isBootstrapped() {
  const snap = await getDoc(bootstrapRef())
  return snap.exists()
}

/**
 * Konfigurimi fillestar: përdoruesi aktual bëhet Admini i parë.
 * Shënuesi meta/bootstrap dhe dokumenti i përdoruesit krijohen në një batch;
 * rules lejojnë këtë vetëm kur shënuesi nuk ekziston ende, pra vetëm një herë.
 */
export async function bootstrapFirstAdmin(emri) {
  const user = auth.currentUser
  const batch = writeBatch(db)
  batch.set(bootstrapRef(), {
    adminUid: user.uid,
    companyId: LEGACY_COMPANY_ID,
    krijuar: serverTimestamp(),
  })
  batch.set(doc(db, 'users', user.uid), {
    companyId: LEGACY_COMPANY_ID,
    roli: 'admin',
    emri: emri.trim(),
    email: user.email,
    aktiv: true,
    krijuar: serverTimestamp(),
  })
  await batch.commit()
  // Tani që është Admin, krijon cilësimet dhe numëruesit parazgjedhur.
  // Nëse dështon, provohet përsëri kur hapen Cilësimet.
  try {
    await ensureCompanyInitialized(emri.trim())
  } catch (err) {
    console.warn('Cilësimet fillestare nuk u krijuan:', err)
  }
}

export async function listCompanyUsers() {
  const snap = await getDocs(query(collection(db, 'users'), where('companyId', '==', getCompanyId())))
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (a.emri || '').localeCompare(b.emri || '', 'sq'))
}

/**
 * Admini krijon një përdorues të ri. Llogaria e Auth krijohet me një instancë
 * të dytë të Firebase, që Admini të mos dalë nga llogaria e vet.
 */
export async function createCompanyUser({ emri, email, password, roli, lejet, username }, actorName) {
  const user = normalizeUsername(username)
  if (user && !validUsername(user)) throw new Error('Emri i përdoruesit: 3–30 shkronja të vogla, shifra ose . _ -')
  if (user && (await getDoc(doc(db, 'usernames', user))).exists()) throw new Error('Ky emër përdoruesi është i zënë.')
  const secondary = initializeApp(firebaseConfig, `krijim-${Date.now()}`)
  try {
    const secondaryAuth = getAuth(secondary)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password)
    await signOut(secondaryAuth)

    const batch = writeBatch(db)
    batch.set(doc(db, 'users', cred.user.uid), {
      companyId: getCompanyId(),
      roli,
      lejet: roli === 'admin' ? [] : lejet,
      emri: emri.trim(),
      email: email.trim(),
      ...(user ? { username: user } : {}),
      aktiv: true,
      krijuar: serverTimestamp(),
    })
    if (user) batch.set(doc(db, 'usernames', user), { email: email.trim(), uid: cred.user.uid, companyId: getCompanyId() })
    addAudit(batch, {
      action: 'krijim_perdoruesi',
      entity: 'users',
      entityId: cred.user.uid,
      details: { emri: emri.trim(), email: email.trim(), username: user || null, roli, lejet },
      actorName,
    })
    await batch.commit()
    return cred.user.uid
  } finally {
    await deleteApp(secondary)
  }
}

export async function updateCompanyUser(uid, changes, actorName) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'users', uid), changes)
  addAudit(batch, {
    action: 'ndryshim_perdoruesi',
    entity: 'users',
    entityId: uid,
    details: changes,
    actorName,
  })
  await batch.commit()
}

/** Vendos / ndryshon emrin e përdoruesit (unik) për një përdorues të kompanisë. */
export async function setUsername(u, username, actorName) {
  const next = normalizeUsername(username)
  if (next && !validUsername(next)) throw new Error('Emri i përdoruesit: 3–30 shkronja të vogla, shifra ose . _ -')
  if (next === (u.username ?? '')) return
  if (next && (await getDoc(doc(db, 'usernames', next))).exists()) throw new Error('Ky emër përdoruesi është i zënë.')
  const batch = writeBatch(db)
  if (u.username) batch.delete(doc(db, 'usernames', u.username))
  if (next) batch.set(doc(db, 'usernames', next), { email: u.email, uid: u.uid, companyId: getCompanyId() })
  batch.update(doc(db, 'users', u.uid), { username: next || null })
  addAudit(batch, { action: 'emer_perdoruesi', entity: 'users', entityId: u.uid, details: { para: u.username ?? null, pas: next || null }, actorName })
  await batch.commit()
}
