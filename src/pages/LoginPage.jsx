import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import PasswordInput from '../components/PasswordInput'
import { login, resetPassword, errorMessage } from '../services/authService'
import { registerCompany } from '../services/companyService'

/** Hyrja: Hyr (email ose emër përdoruesi) · Krijo llogari (kompani e re me kod ftese). */
export default function LoginPage() {
  const [tab, setTab] = useState('hyr')

  return (
    <div className="center-screen login-bg">
      <div className="card narrow">
        <div className="login-head">
          <div className="brand-mark big">IP</div>
          <h1>INTAL PRO</h1>
          <p className="muted">{tab === 'hyr' ? 'Hyni në llogarinë tuaj' : 'Krijoni llogarinë e kompanisë suaj'}</p>
        </div>
        <div className="login-tabs" role="tablist">
          <button type="button" role="tab" className={tab === 'hyr' ? 'active' : ''} onClick={() => setTab('hyr')}><LogIn size={16} /> Hyr</button>
          <button type="button" role="tab" className={tab === 'krijo' ? 'active' : ''} onClick={() => setTab('krijo')}><UserPlus size={16} /> Krijo llogari</button>
        </div>
        {tab === 'hyr' ? <SignIn /> : <SignUp />}
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
      <label className="field">
        <span>Email ose emri i përdoruesit</span>
        <input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
      </label>
      <label className="field">
        <span>Fjalëkalimi</span>
        <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Duke hyrë…' : 'Hyr'}</button>
      <button type="button" className="btn link block login-forgot" onClick={onForgot}>Harrova fjalëkalimin</button>
    </form>
  )
}

function SignUp() {
  const [f, setF] = useState({ code: '', email: '', password: '', password2: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (f.password.length < 6) return setError('Fjalëkalimi duhet të ketë të paktën 6 karaktere.')
    if (f.password !== f.password2) return setError('Fjalëkalimet nuk përputhen.')
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
      <label className="field">
        <span>Kodi i ftesës</span>
        <input placeholder="p.sh. K7Q2-M9XA" value={f.code} onChange={set('code')} required autoFocus />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="email" value={f.email} onChange={set('email')} required />
      </label>
      <label className="field">
        <span>Fjalëkalimi</span>
        <PasswordInput autoComplete="new-password" placeholder="Minimumi 6 karaktere" value={f.password} onChange={set('password')} required />
      </label>
      <label className="field">
        <span>Përsërit fjalëkalimin</span>
        <PasswordInput autoComplete="new-password" value={f.password2} onChange={set('password2')} required />
      </label>
      {error && <div className="alert error">{error}</div>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Duke krijuar…' : 'Krijo llogari'}</button>
      <p className="muted small login-note">Ju bëheni Administratori i kompanisë. Emrin e kompanisë dhe përdoruesit e tjerë i vendosni pastaj te Cilësimet.</p>
    </form>
  )
}
