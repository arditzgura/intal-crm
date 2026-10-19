import { useState } from 'react'
import PasswordInput from '../components/PasswordInput'
import { login, errorMessage } from '../services/authService'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="center-screen login-bg">
      <form className="card narrow" onSubmit={onSubmit}>
        <div className="login-head">
          <div className="brand-mark big">IP</div>
          <h1>INTAL PRO</h1>
          <p className="muted">Hyni në llogarinë tuaj</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Fjalëkalimi</span>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Duke hyrë…' : 'Hyr'}
        </button>
      </form>
    </div>
  )
}
