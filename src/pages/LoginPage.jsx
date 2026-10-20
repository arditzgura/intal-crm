import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import PasswordInput from '../components/PasswordInput'
import { login, resetPassword, errorMessage } from '../services/authService'
import { registerCompany } from '../services/companyService'

/** Hyrja: Hyr (email ose emër përdoruesi) · Krijo llogari (kompani e re me kod ftese). */
export default function LoginPage() {
  const [tab, setTab] = useState('hyr')

  return (
    <div className="center-screen auth-bg">
      <div className="auth-wrap">
        <div className="auth-brand">
          <div className="brand-mark big">IP</div>
          <h1>INTAL PRO</h1>
          <p>CRM & Faturim</p>
        </div>
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" className={tab === 'hyr' ? 'active' : ''} onClick={() => setTab('hyr')}><LogIn size={18} /> Hyr</button>
            <button type="button" role="tab" className={tab === 'krijo' ? 'active' : ''} onClick={() => setTab('krijo')}><UserPlus size={18} /> Krijo llogari</button>
          </div>
          {tab === 'hyr' ? <SignIn /> : <SignUp />}
        </div>
      </div>
    </div>
  )
}

function SignIn() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await login(identifier, password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  async function onForgot() {
    setError('')
    setInfo('')
    if (!identifier.includes('@')) return setError('Shkruani email-in tuaj në fushën e parë, pastaj klikoni "Harrova fjalëkalimin".')
    try {
      await resetPassword(identifier)
      setInfo(`U dërgua një email te ${identifier.trim()} për të vendosur fjalëkalim të ri.`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="auth-field">
        <span>Email ose emri i përdoruesit</span>
        <input autoComplete="username" placeholder="p.sh. arditzgura" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
      </label>
      <label className="auth-field">
        <span>Fjalëkalimi</span>
        <PasswordInput autoComplete="current-password" placeholder="Minimumi 6 karaktere" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}
      <button className="auth-submit" disabled={busy}><LogIn size={20} /> {busy ? 'Duke hyrë…' : 'Hyr'}</button>
      <button type="button" className="auth-link" onClick={onForgot}>Harrova fjalëkalimin</button>
    </form>
  )
}

function SignUp() {
  const [f, setF] = useState({ code: '', kompania: '', emri: '', email: '', username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (f.password.length < 6) return setError('Fjalëkalimi duhet të ketë të paktën 6 karaktere.')
    setBusy(true)
    try {
      await registerCompany(f)
      // Pas regjistrimit hapet ekrani "Verifikoni email-in".
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="auth-note">Për një kompani të re. Ju bëheni Administratori i saj dhe krijoni më pas përdoruesit e tjerë.</p>
      <label className="auth-field">
        <span>Kodi i ftesës</span>
        <input placeholder="p.sh. K7Q2-M9XA" value={f.code} onChange={set('code')} required autoFocus />
      </label>
      <label className="auth-field">
        <span>Emri i kompanisë</span>
        <input value={f.kompania} onChange={set('kompania')} required />
      </label>
      <label className="auth-field">
        <span>Emri dhe mbiemri juaj</span>
        <input value={f.emri} onChange={set('emri')} required />
      </label>
      <label className="auth-field">
        <span>Email</span>
        <input type="email" autoComplete="email" value={f.email} onChange={set('email')} required />
      </label>
      <label className="auth-field">
        <span>Emri i përdoruesit (opsional)</span>
        <input autoComplete="username" placeholder="p.sh. arditzgura" value={f.username} onChange={set('username')} />
      </label>
      <label className="auth-field">
        <span>Fjalëkalimi</span>
        <PasswordInput autoComplete="new-password" placeholder="Minimumi 6 karaktere" value={f.password} onChange={set('password')} required />
      </label>
      {error && <div className="alert error">{error}</div>}
      <button className="auth-submit" disabled={busy}><UserPlus size={20} /> {busy ? 'Duke krijuar…' : 'Krijo llogari'}</button>
    </form>
  )
}
