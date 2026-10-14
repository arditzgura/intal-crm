import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ROLES } from '../config/roles'
import { changePassword, errorMessage, logout } from '../services/authService'
import { initials } from '../components/Sidebar'

export default function ProfilePage() {
  const { profile, role } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onChangePassword(e) {
    e.preventDefault()
    setMsg(null)
    if (next.length < 6) return setMsg({ type: 'error', text: 'Fjalëkalimi i ri duhet të ketë të paktën 6 karaktere.' })
    if (next !== confirm) return setMsg({ type: 'error', text: 'Fjalëkalimet e reja nuk përputhen.' })
    setBusy(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setMsg({ type: 'success', text: 'Fjalëkalimi u ndryshua.' })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">Profili</h1>
      <div className="card profile-card">
        <div className="avatar big">{initials(profile?.emri)}</div>
        <div>
          <h2>{profile?.emri}</h2>
          <div className="muted">{profile?.email}</div>
          <span className="badge">{ROLES[role]}</span>
        </div>
      </div>

      <form className="card form-narrow" onSubmit={onChangePassword}>
        <h3>Ndrysho fjalëkalimin</h3>
        <label className="field">
          <span>Fjalëkalimi aktual</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span>Fjalëkalimi i ri</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </label>
        <label className="field">
          <span>Përsërit fjalëkalimin e ri</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Duke ruajtur…' : 'Ndrysho fjalëkalimin'}
        </button>
      </form>

      <button className="btn danger" onClick={logout}>
        Dil nga llogaria
      </button>
    </div>
  )
}
