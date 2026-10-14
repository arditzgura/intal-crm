import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { ROLES } from '../../config/roles'
import { TEMPLATES, permissionsOf } from '../../config/permissions'
import { createCompanyUser, listCompanyUsers, updateCompanyUser } from '../../services/userService'
import { errorMessage } from '../../services/authService'
import Modal from '../../components/Modal'
import PermissionsEditor from './PermissionsEditor'

const EMPTY = { emri: '', email: '', password: '', roli: 'shites', lejet: [...TEMPLATES.shites.lejet] }

export default function UsersTab() {
  const { user: me, profile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      setUsers(await listCompanyUsers())
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onCreate(e) {
    e.preventDefault()
    setMsg(null)
    if (form.password.length < 6) return setMsg({ type: 'error', text: 'Fjalëkalimi duhet të ketë të paktën 6 karaktere.' })
    if (form.roli !== 'admin' && !form.lejet.length) return setMsg({ type: 'error', text: 'Zgjidhni të paktën një leje.' })
    setBusy(true)
    try {
      await createCompanyUser(form, profile?.emri)
      setMsg({ type: 'success', text: `Përdoruesi ${form.emri} u krijua. Jepini email-in dhe fjalëkalimin.` })
      setForm(EMPTY)
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function change(u, changes) {
    setMsg(null)
    try {
      await updateCompanyUser(u.uid, changes, profile?.emri)
      setUsers((list) => list.map((x) => (x.uid === u.uid ? { ...x, ...changes } : x)))
      return true
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
      return false
    }
  }

  return (
    <>
      <div className="card">
        <h3>Përdoruesit</h3>
        {loading ? (
          <p className="muted">Duke u ngarkuar…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Emri</th>
                  <th>Email</th>
                  <th>Roli / lejet</th>
                  <th>Statusi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.uid === me.uid
                  const count = u.roli === 'admin' ? 'të gjitha' : permissionsOf(u).size
                  return (
                    <tr key={u.uid}>
                      <td>{u.emri}{self && <span className="muted small"> (ju)</span>}</td>
                      <td>{u.email}</td>
                      <td>
                        {self ? (
                          <span>{ROLES[u.roli]}</span>
                        ) : (
                          <button type="button" className="btn small" onClick={() => setEditing(u)}>
                            {ROLES[u.roli] ?? u.roli} · {count} leje – Ndrysho
                          </button>
                        )}
                      </td>
                      <td>
                        {self ? (
                          <span className="badge success">Aktiv</span>
                        ) : (
                          <button
                            type="button"
                            className={`badge clickable ${u.aktiv ? 'success' : 'muted-badge'}`}
                            title={u.aktiv ? 'Kliko për ta çaktivizuar' : 'Kliko për ta aktivizuar'}
                            onClick={() => change(u, { aktiv: !u.aktiv })}
                          >
                            {u.aktiv ? 'Aktiv' : 'Çaktivizuar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          Përdoruesit nuk fshihen; çaktivizohen. Nuk mund t'i ndryshoni lejet ose statusin tuaj.
        </p>
      </div>

      <form className="card" onSubmit={onCreate}>
        <h3>Shto përdorues</h3>
        <div className="grid-2">
          <label className="field">
            <span>Emri dhe mbiemri</span>
            <input value={form.emri} onChange={(e) => setForm({ ...form, emri: e.target.value })} required />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="field">
            <span>Fjalëkalimi fillestar</span>
            <input type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
        </div>
        <PermissionsEditor value={form} onChange={(v) => setForm({ ...form, ...v })} />
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Duke krijuar…' : 'Krijo përdoruesin'}
        </button>
      </form>

      {editing && (
        <EditPermissionsModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => (await change(editing, v)) && setEditing(null)}
        />
      )}
    </>
  )
}

function EditPermissionsModal({ user, onClose, onSave }) {
  const [value, setValue] = useState({ roli: user.roli, lejet: [...permissionsOf(user)].filter((p) => p !== 'admin') })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (value.roli !== 'admin' && !value.lejet.length) return setError('Zgjidhni të paktën një leje.')
    setBusy(true)
    await onSave({ roli: value.roli, lejet: value.roli === 'admin' ? [] : value.lejet })
    setBusy(false)
  }

  return (
    <Modal title={`Lejet – ${user.emri}`} onClose={onClose} wide>
      <PermissionsEditor value={value} onChange={setValue} />
      {error && <div className="alert error">{error}</div>}
      <p className="muted small">Ndryshimet vlejnë menjëherë, edhe nëse përdoruesi është i loguar.</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Anulo</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj lejet'}</button>
      </div>
    </Modal>
  )
}
