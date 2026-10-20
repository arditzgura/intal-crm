import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { roleLabel } from '../../config/roles'
import { TEMPLATES, permissionsOf } from '../../config/permissions'
import { createCompanyUser, listCompanyUsers, updateCompanyUser, setUsername } from '../../services/userService'
import { errorMessage } from '../../services/authService'
import Modal from '../../components/Modal'
import PermissionsEditor from './PermissionsEditor'

const EMPTY = { emri: '', email: '', username: '', password: '', roli: 'shites', roliEmer: null, lejet: [...TEMPLATES.shites.lejet] }

export default function UsersTab() {
  const { user: me, profile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editing, setEditing] = useState(null)

  // Rolet e riemërtuara që përdoren tashmë (emri → lejet), për t'i zgjedhur sërish
  const customRoles = Object.fromEntries(users.filter((u) => u.roliEmer).map((u) => [u.roliEmer, u.lejet ?? []]))

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
    if (form.roliEmer != null && !form.roliEmer.trim()) return setMsg({ type: 'error', text: 'Shkruani emrin e rolit.' })
    setBusy(true)
    try {
      await createCompanyUser(form, profile?.emri)
      setMsg({ type: 'success', text: `Përdoruesi ${form.emri} u krijua. Hyn me ${form.username ? `emrin "${form.username.trim().toLowerCase()}" ose ` : ''}email-in dhe fjalëkalimin.` })
      setForm(EMPTY)
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.code ? errorMessage(err) : err.message })
    } finally {
      setBusy(false)
    }
  }

  async function renameUser(u) {
    const next = window.prompt(`Emri i përdoruesit për ${u.emri} (bosh = hiqe):`, u.username ?? '')
    if (next == null) return
    setMsg(null)
    try {
      await setUsername(u, next, profile?.emri)
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: err.code ? errorMessage(err) : err.message })
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
                  <th>Emri i përdoruesit</th>
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
                        <button type="button" className="btn link small" onClick={() => renameUser(u)} title="Vendos / ndrysho emrin e hyrjes">
                          {u.username || <span className="muted">+ vendos</span>}
                        </button>
                      </td>
                      <td>
                        {self ? (
                          <span>{roleLabel(u)}</span>
                        ) : (
                          <button type="button" className="btn small" onClick={() => setEditing(u)}>
                            {roleLabel(u)} · {count} leje – Ndrysho
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
            <span>Emri i përdoruesit (për hyrje, opsional)</span>
            <input placeholder="p.sh. arditzgura" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="field">
            <span>Fjalëkalimi fillestar</span>
            <input type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
        </div>
        <PermissionsEditor value={form} onChange={(v) => setForm({ ...form, ...v })} customRoles={customRoles} />
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Duke krijuar…' : 'Krijo përdoruesin'}
        </button>
      </form>

      {editing && (
        <EditPermissionsModal
          user={editing}
          onClose={() => setEditing(null)}
          customRoles={customRoles}
          onSave={async (v) => (await change(editing, v)) && setEditing(null)}
        />
      )}
    </>
  )
}

function EditPermissionsModal({ user, onClose, onSave, customRoles }) {
  const [value, setValue] = useState({ roli: user.roli, roliEmer: user.roliEmer ?? null, lejet: [...permissionsOf(user)].filter((p) => p !== 'admin') })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (value.roli !== 'admin' && !value.lejet.length) return setError('Zgjidhni të paktën një leje.')
    if (value.roliEmer != null && !value.roliEmer.trim()) return setError('Shkruani emrin e rolit.')
    setBusy(true)
    await onSave({ roli: value.roli, roliEmer: value.roliEmer?.trim() || null, lejet: value.roli === 'admin' ? [] : value.lejet })
    setBusy(false)
  }

  return (
    <Modal title={`Lejet – ${user.emri}`} onClose={onClose} wide>
      <PermissionsEditor value={value} onChange={setValue} customRoles={customRoles} />
      {error && <div className="alert error">{error}</div>}
      <p className="muted small">Ndryshimet vlejnë menjëherë, edhe nëse përdoruesi është i loguar.</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Anulo</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj lejet'}</button>
      </div>
    </Modal>
  )
}
