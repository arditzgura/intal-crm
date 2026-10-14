import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { bootstrapFirstAdmin } from '../services/userService'
import { errorMessage, logout } from '../services/authService'

/**
 * Konfigurimi fillestar. Shfaqet vetëm kur në databazë nuk ekziston ende
 * asnjë Admin (shënuesi meta/bootstrap mungon). Firestore Rules e lejojnë
 * krijimin e Adminit të parë vetëm një herë.
 */
export default function SetupPage() {
  const { user, reload } = useAuth()
  const [emri, setEmri] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await bootstrapFirstAdmin(emri)
    } catch (err) {
      setError(
        err?.code === 'permission-denied'
          ? 'Konfigurimi fillestar është bërë tashmë nga dikush tjetër.'
          : errorMessage(err),
      )
      setBusy(false)
      reload()
    }
  }

  return (
    <div className="center-screen login-bg">
      <form className="card narrow" onSubmit={onSubmit}>
        <h1>Konfigurimi fillestar</h1>
        <p className="muted">
          Në sistem nuk ka ende asnjë Administrator. Llogaria <b>{user?.email}</b> do të bëhet
          Admini i parë. Ky hap bëhet vetëm një herë; përdoruesit e tjerë i krijon Admini te
          Cilësimet.
        </p>
        <label className="field">
          <span>Emri dhe mbiemri</span>
          <input value={emri} onChange={(e) => setEmri(e.target.value)} required autoFocus />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={busy || !emri.trim()}>
          {busy ? 'Duke ruajtur…' : 'Bëhu Administrator'}
        </button>
        <button type="button" className="btn link block" onClick={logout}>
          Dil
        </button>
      </form>
    </div>
  )
}
