import { useState } from 'react'
import Modal from '../../components/Modal'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import { createClient, updateClient, EMPTY_CLIENT } from '../../services/clientService'
import { addLedgerEntry, rateFor } from '../../services/ledgerService'
import { errorMessage } from '../../services/authService'
import { CLIENT_TYPES, canLedger } from '../../config/ledger'
import { CURRENCIES, parseMoney } from '../../utils/money'
import { fromInputDate, toInputDate } from '../../utils/date'

const TEXT_FIELDS = [
  ['emri', 'Emri / Biznesi *'],
  ['nipt', 'NIPT'],
  ['qyteti', 'Qyteti'],
  ['adresa', 'Adresa'],
  ['telefoni', 'Telefoni'],
  ['email', 'Email'],
]

/** Krijim / ndryshim klienti. Te krijimi, Admin/Financë mund të vendosin edhe gjendjen fillestare. */
export default function ClientFormModal({ client, onClose, onSaved }) {
  const { role, profile } = useAuth()
  const { settings } = useSettings()
  const [form, setForm] = useState(() => ({ ...EMPTY_CLIENT, ...(client ?? {}) }))
  const [initial, setInitial] = useState({ shuma: '', monedha: 'LEK', data: toInputDate() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isNew = !client
  const canInitial = isNew && canLedger(role, 'gjendje_fillestare')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    let initialAmount = null
    if (canInitial && initial.shuma.trim()) {
      initialAmount = parseMoney(initial.shuma)
      if (initialAmount == null) return setError('Gjendja fillestare nuk është numër i vlefshëm.')
    }
    setBusy(true)
    try {
      if (isNew) {
        const { id } = await createClient(form, profile?.emri)
        if (initialAmount) {
          try {
            await addLedgerEntry(
              {
                clientId: id,
                tipi: 'gjendje_fillestare',
                monedha: initial.monedha,
                kursi: rateFor(initial.monedha, settings),
                shuma: initialAmount,
                data: fromInputDate(initial.data),
                shenim: 'Gjendja fillestare',
              },
              profile?.emri,
            )
          } catch (err) {
            window.alert(`Klienti u krijua, por gjendja fillestare nuk u ruajt: ${errorMessage(err)}\nVendoseni nga profili i klientit.`)
          }
        }
        onSaved?.(id)
      } else {
        await updateClient(client.id, form, profile?.emri)
        onSaved?.(client.id)
      }
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? 'Klient i ri' : `Ndrysho: ${client.emri}`} onClose={onClose} wide>
      <form onSubmit={onSubmit}>
        <div className="grid-2">
          {TEXT_FIELDS.map(([k, label]) => (
            <label key={k} className="field">
              <span>{label}</span>
              <input value={form[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} required={k === 'emri'} autoFocus={k === 'emri'} />
            </label>
          ))}
          <label className="field">
            <span>Tipi</span>
            <select value={form.tipi} onChange={(e) => set({ tipi: e.target.value })}>
              {Object.entries(CLIENT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Monedha e preferuar</span>
            <select value={form.monedhaPreferuar} onChange={(e) => set({ monedhaPreferuar: e.target.value })}>
              {Object.keys(CURRENCIES).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Shënime</span>
          <textarea rows={2} value={form.shenime ?? ''} onChange={(e) => set({ shenime: e.target.value })} />
        </label>

        {canInitial && (
          <fieldset className="fieldset">
            <legend>Gjendja fillestare (opsionale)</legend>
            <p className="muted small">
              Borxhi që klienti kishte para sistemit. Pozitive = klienti na detyrohet; negative (me "-") = tepricë.
            </p>
            <div className="grid-3">
              <label className="field">
                <span>Shuma</span>
                <input inputMode="decimal" placeholder="0,00" value={initial.shuma} onChange={(e) => setInitial({ ...initial, shuma: e.target.value })} />
              </label>
              <label className="field">
                <span>Monedha</span>
                <select value={initial.monedha} onChange={(e) => setInitial({ ...initial, monedha: e.target.value })}>
                  {Object.keys(CURRENCIES).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Data</span>
                <input type="date" value={initial.data} onChange={(e) => setInitial({ ...initial, data: e.target.value })} />
              </label>
            </div>
          </fieldset>
        )}

        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Anulo</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj'}</button>
        </div>
      </form>
    </Modal>
  )
}
