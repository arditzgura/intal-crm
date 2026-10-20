import { useState } from 'react'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../hooks/useAuth'
import { ROLES } from '../config/roles'
import { changePassword, errorMessage, logout } from '../services/authService'
import { updateOwnProfile } from '../services/userService'
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

      <PersonalForm profile={profile} />

      <form className="card form-narrow" onSubmit={onChangePassword}>
        <h3>Ndrysho fjalëkalimin</h3>
        <label className="field">
          <span>Fjalëkalimi aktual</span>
          <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span>Fjalëkalimi i ri</span>
          <PasswordInput autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </label>
        <label className="field">
          <span>Përsërit fjalëkalimin e ri</span>
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
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

/** Të dhënat e mia: emri, mbiemri dhe emri i përdoruesit (titulli që shohin të tjerët, edhe për hyrje). */
function PersonalForm({ profile }) {
  const [f, setF] = useState(() => {
    const parts = (profile?.emri ?? '').trim().split(/\s+/)
    return {
      emriPare: profile?.emriPare ?? parts[0] ?? '',
      mbiemri: profile?.mbiemri ?? parts.slice(1).join(' '),
      username: profile?.username ?? '',
    }
  })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function onSave(e) {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      await updateOwnProfile(profile, f)
      setMsg({ type: 'success', text: 'Të dhënat u ruajtën.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.code ? errorMessage(err) : err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form-narrow" onSubmit={onSave}>
      <h3>Të dhënat e mia</h3>
      <div className="grid-2">
        <label className="field">
          <span>Emri</span>
          <input value={f.emriPare} onChange={set('emriPare')} required />
        </label>
        <label className="field">
          <span>Mbiemri</span>
          <input value={f.mbiemri} onChange={set('mbiemri')} />
        </label>
      </div>
      <label className="field">
        <span>Emri i përdoruesit</span>
        <input placeholder="p.sh. arditzgura" value={f.username} onChange={set('username')} />
      </label>
      <p className="muted small">Emri i përdoruesit shfaqet te përdoruesit e tjerë dhe mund të përdoret për hyrje në vend të email-it.</p>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <button className="btn primary" disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj të dhënat'}</button>
    </form>
  )
}
