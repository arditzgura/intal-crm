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
import { auth, db, firebaseConfig, COMPANY_ID } from '../firebase'
import { addAudit } from './auditService'
import { ensureCompanyInitialized } from './settingsService'

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
    companyId: COMPANY_ID,
    krijuar: serverTimestamp(),
  })
  batch.set(doc(db, 'users', user.uid), {
    companyId: COMPANY_ID,
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
  const snap = await getDocs(query(collection(db, 'users'), where('companyId', '==', COMPANY_ID)))
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (a.emri || '').localeCompare(b.emri || '', 'sq'))
}

/**
 * Admini krijon një përdorues të ri. Llogaria e Auth krijohet me një instancë
 * të dytë të Firebase, që Admini të mos dalë nga llogaria e vet.
 */
export async function createCompanyUser({ emri, email, password, roli, lejet }, actorName) {
  const secondary = initializeApp(firebaseConfig, `krijim-${Date.now()}`)
  try {
    const secondaryAuth = getAuth(secondary)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password)
    await signOut(secondaryAuth)

    const batch = writeBatch(db)
    batch.set(doc(db, 'users', cred.user.uid), {
      companyId: COMPANY_ID,
      roli,
      lejet: roli === 'admin' ? [] : lejet,
      emri: emri.trim(),
      email: email.trim(),
      aktiv: true,
      krijuar: serverTimestamp(),
    })
    addAudit(batch, {
      action: 'krijim_perdoruesi',
      entity: 'users',
      entityId: cred.user.uid,
      details: { emri: emri.trim(), email: email.trim(), roli, lejet },
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
