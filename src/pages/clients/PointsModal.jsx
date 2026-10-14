import { useState } from 'react'
import Modal from '../../components/Modal'
import { useAuth } from '../../hooks/useAuth'
import { adjustPoints } from '../../services/pointsService'
import { errorMessage } from '../../services/authService'

export default function PointsModal({ client, onClose }) {
  const { profile } = useAuth()
  const [pike, setPike] = useState('')
  const [arsye, setArsye] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const n = Number(pike)
    if (!Number.isInteger(n) || n === 0) return setError('Shkruani një numër të plotë (p.sh. 50 ose -20).')
    setBusy(true)
    try {
      await adjustPoints({ clientId: client.id, pike: n, arsye }, profile?.emri)
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Rregullim pikësh – ${client.emri}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p className="muted">Pikët aktuale: <b>{client.piket ?? 0}</b></p>
        <label className="field">
          <span>Pikë për të shtuar (me "-" për të hequr)</span>
          <input type="number" step={1} value={pike} onChange={(e) => setPike(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Arsyeja *</span>
          <textarea rows={2} value={arsye} onChange={(e) => setArsye(e.target.value)} required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Anulo</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj'}</button>
        </div>
      </form>
    </Modal>
  )
}
