import {
  signInWithEmailAndPassword,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { auth } from '../firebase'

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email-i ose fjalëkalimi është i gabuar.',
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

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password)
}

export function logout() {
  return signOut(auth)
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser
  const cred = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, cred)
  await updatePassword(user, newPassword)
}
