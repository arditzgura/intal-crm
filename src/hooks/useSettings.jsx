import { createContext, useContext, useEffect, useState } from 'react'
import { watchSettings, withDefaults } from '../services/settingsService'

const SettingsContext = createContext(null)

/** Cilësimet e kompanisë, të dëgjuara live nga Firestore. Përdoret vetëm pas login-it. */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(withDefaults())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(
    () =>
      watchSettings(
        (s) => {
          setSettings(s)
          setLoading(false)
        },
        (err) => {
          setError(err)
          setLoading(false)
        },
      ),
    [],
  )

  return (
    <SettingsContext.Provider value={{ settings, loading, error }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
