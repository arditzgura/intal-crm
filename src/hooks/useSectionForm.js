import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { useSettings } from './useSettings'
import { saveSettingsSection } from '../services/settingsService'
import { errorMessage } from '../services/authService'

/**
 * Formë për një seksion të cilësimeve: mban një kopje lokale (draft),
 * e rifreskon kur ndryshojnë cilësimet në server (nëse s'ka ndryshime të paruajtura),
 * dhe e ruan me audit log.
 */
export function useSectionForm(section) {
  const { settings } = useSettings()
  const { profile } = useAuth()
  const serverValue = settings[section]
  const [draft, setDraft] = useState(serverValue)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!dirty) setDraft(serverValue)
  }, [serverValue, dirty])

  function update(patch) {
    setDraft((d) => (typeof patch === 'function' ? patch(d) : { ...d, ...patch }))
    setDirty(true)
    setMsg(null)
  }

  async function save(value = draft) {
    setBusy(true)
    setMsg(null)
    try {
      await saveSettingsSection(section, value, profile?.emri)
      setDirty(false)
      setMsg({ type: 'success', text: 'U ruajt.' })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setDraft(serverValue)
    setDirty(false)
    setMsg(null)
  }

  return { draft, update, save, reset, dirty, busy, msg }
}
