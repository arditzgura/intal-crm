import {
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { clearIndexedDbPersistence, doc, getDoc, terminate } from 'firebase/firestore'
import { resetShared } from './sharedLive'
import { auth, db } from '../firebase'

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email-i / emri i përdoruesit ose fjalëkalimi është i gabuar.',
  'auth/missing-email': 'Shkruani email-in.',
  'auth/wrong-password': 'Fjalëkalimi është i gabuar.',
  'auth/user-not-found': 'Nuk ekziston përdorues me këtë email.',
  'auth/invalid-email': 'Email-i nuk është i vlefshëm.',
  'auth/user-disabled': 'Kjo llogari është çaktivizuar.',
  'auth/too-many-requests': 'Shumë përpjekje të dështuara. Provoni përsëri pas pak.',
  'auth/network-request-failed': 'Nuk ka lidhje me internetin.',
  'auth/email-already-in-use': 'Ky email përdoret tashmë nga një llogari tjetër.',
  'auth/weak-password': 'Fjalëkalimi duhet të ketë të paktën 6 karaktere.',
  'auth/requires-recent-login': 'Për siguri, dilni dhe hyni përsëri, pastaj provoni.',
  'auth/missing-password': 'Shkruani fjalëkalimin.',
  'auth/operation-not-allowed': 'Hyrja me email/fjalëkalim nuk është aktivizuar te Firebase Authentication.',
  'permission-denied': 'Nuk keni leje për këtë veprim.',
  unavailable: 'Serveri nuk është i arritshëm. Kontrolloni lidhjen.',
}

export function errorMessage(err) {
  return AUTH_ERRORS[err?.code] || `Ndodhi një gabim: ${err?.message ?? err}`
}

/** Emri i përdoruesit: shkronja të vogla, shifra dhe . _ - (3–30). */
export const normalizeUsername = (u) => (u ?? '').trim().toLowerCase()
export const validUsername = (u) => /^[a-z0-9._-]{3,30}$/.test(u)

/** Hyrja me email ose me emër përdoruesi (emri përkthehet te email-i përmes usernames/{emri}). */
export async function login(identifier, password) {
  let email = identifier.trim()
  if (!email.includes('@')) {
    const snap = await getDoc(doc(db, 'usernames', normalizeUsername(email)))
    if (!snap.exists()) {
      const err = new Error('user-not-found')
      err.code = 'auth/invalid-credential'
      throw err
    }
    email = snap.data().email
  }
  return signInWithEmailAndPassword(auth, email, password)
}

/** Email për rivendosjen e fjalëkalimit (shërbim falas i Firebase). */
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim())
}

/** Ridërgon email-in e verifikimit për përdoruesin aktual. */
export function resendVerification() {
  return sendEmailVerification(auth.currentUser)
}

/** Pas verifikimit: rifreskon llogarinë dhe token-in (që Rules të shohin email_verified). */
export async function refreshVerification() {
  await auth.currentUser.reload()
  await auth.currentUser.getIdToken(true)
  return auth.currentUser.emailVerified
}

/** Dalja: mbyll lidhjet, pastron memorien e të dhënave në këtë shfletues dhe rifillon faqen. */
export async function logout() {
  resetShared()
  await signOut(auth)
  try {
    await terminate(db)
    await clearIndexedDbPersistence(db)
  } catch (err) {
    console.warn('Memoria lokale nuk u pastrua:', err)
  }
  window.location.reload()
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser
  const cred = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, cred)
  await updatePassword(user, newPassword)
}
