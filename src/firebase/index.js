import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const configMissing = !firebaseConfig.apiKey || !firebaseConfig.projectId

// Kompania e parë (INTAL ALBANIA); konfigurimi fillestar i vjetër (meta/bootstrap) i referohet asaj.
export const LEGACY_COMPANY_ID = import.meta.env.VITE_COMPANY_ID || 'intal'
// Kompania aktive merret nga profili i përdoruesit pas hyrjes (users/{uid}.companyId).
let activeCompanyId = LEGACY_COMPANY_ID
export const getCompanyId = () => activeCompanyId
export const setCompanyId = (id) => { activeCompanyId = id || LEGACY_COMPANY_ID }
// Pronari i aplikacionit: sheh faqen Super-Admin (kompanitë, kodet e ftesës). Njësoj te firestore.rules.
export const SUPER_ADMIN_EMAIL = 'arditzgura@gmail.com'

export const app = configMissing ? null : initializeApp(firebaseConfig)
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
