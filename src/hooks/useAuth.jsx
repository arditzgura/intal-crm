import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, COMPANY_ID } from '../firebase'
import { watchUserProfile, isBootstrapped } from '../services/userService'

const AuthContext = createContext(null)

/**
 * status:
 *  'loading'    – duke kontrolluar
 *  'signedOut'  – pa login
 *  'needsSetup' – i loguar, pa profil dhe ende pa asnjë Admin → Konfigurimi fillestar
 *  'noAccess'   – i loguar, pa profil (ose profil i kompanisë tjetër)
 *  'inactive'   – profili është çaktivizuar
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
          try {
            const done = await isBootstrapped()
            if (!cancelled) setStatus(done ? 'noAccess' : 'needsSetup')
          } catch (err) {
            if (!cancelled) {
              setError(err)
              setStatus('error')
            }
          }
        } else if (p.companyId !== COMPANY_ID) {
          setStatus('noAccess')
        } else if (!p.aktiv) {
          setStatus('inactive')
        } else {
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

  return (
    <AuthContext.Provider value={{ user, profile, status, error, reload, role: profile?.roli }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
