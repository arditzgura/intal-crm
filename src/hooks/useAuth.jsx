import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, setCompanyId, SUPER_ADMIN_EMAIL } from '../firebase'
import { watchUserProfile, isBootstrapped } from '../services/userService'
import { permissionsOf } from '../config/permissions'

const AuthContext = createContext(null)

/**
 * status:
 *  'loading'    – duke kontrolluar
 *  'signedOut'  – pa login
 *  'needsSetup' – i loguar, pa profil dhe ende pa asnjë Admin → Konfigurimi fillestar
 *  'noAccess'   – i loguar, pa profil (ose profil i kompanisë tjetër)
 *  'inactive'   – profili është çaktivizuar
 *  'verifyEmail'– Admini i një kompanie të re ende nuk ka verifikuar email-in
 *  'ready'      – gjithçka në rregull
 *  'error'
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u)
    if (!u) {
      setProfile(null)
      setStatus('signedOut')
    } else {
      setStatus('loading')
    }
  }), [])

  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    const unsub = watchUserProfile(
      user.uid,
      async (p) => {
        if (cancelled) return
        setProfile(p)
        if (!p) {
          // Llogari e sapokrijuar ("Krijo llogari"): profili po shkruhet – prit pa shfaqur "Pa akses".
          const created = Date.parse(auth.currentUser?.metadata?.creationTime ?? '')
          if (created && Date.now() - created < 60000) {
            setStatus('loading')
            return
          }
          try {
            const done = await isBootstrapped()
            if (!cancelled) setStatus(done ? 'noAccess' : 'needsSetup')
          } catch (err) {
            if (!cancelled) {
              setError(err)
              setStatus('error')
            }
          }
        } else if (!p.companyId) {
          setStatus('noAccess')
        } else if (!p.aktiv) {
          setStatus('inactive')
        } else if (p.duhetVerifikim && !auth.currentUser?.emailVerified) {
          setCompanyId(p.companyId)
          setStatus('verifyEmail')
        } else {
          // Të gjitha leximet/shkrimet shkojnë te kompania e përdoruesit.
          setCompanyId(p.companyId)
          setStatus('ready')
        }
      },
      (err) => {
        if (cancelled) return
        setError(err)
        setStatus('error')
      },
    )
    return () => {
      cancelled = true
      unsub()
    }
  }, [user, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const perms = useMemo(() => permissionsOf(profile), [profile])
  const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL

  return (
    <AuthContext.Provider value={{ user, profile, status, error, reload, role: profile?.roli, perms, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
