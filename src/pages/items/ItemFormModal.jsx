import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import { EMPTY_ITEM, UNITS, createItem, updateItem, suggestItemCode } from '../../services/itemService'
import { errorMessage } from '../../services/authService'
import { formatMoney, parseMoney } from '../../utils/money'

const moneyText = (v) => (v == null ? '' : formatMoney(v))

/** Krijim / ndryshim artikulli. Çmimet preferenciale janë te profili i artikullit. */
export default function ItemFormModal({ item, cost, showCost, onClose, onSaved }) {
  const { profile } = useAuth()
  const { settings } = useSettings()
  const isNew = !item
  const [form, setForm] = useState(() => ({ ...EMPTY_ITEM, ...(item ?? {}) }))
  const [cmimi, setCmimi] = useState(moneyText(item?.cmimi))
  const [kosto, setKosto] = useState(moneyText(cost))
  const [autoCode, setAutoCode] = useState(isNew)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (isNew) suggestItemCode().then((kodi) => setForm((f) => (f.kodi ? f : { ...f, kodi }))).catch(() => {})
  }, [isNew])

  const categories = settings.kategorite.artikuj
  const subcats = categories.find((c) => c.emri === form.kategoria)?.nen ?? []

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const price = parseMoney(cmimi)
    if (price == null || price < 0) return setError('Çmimi i shitjes nuk është i vlefshëm.')
    let cost2
    if (showCost) {
      cost2 = kosto.trim() ? parseMoney(kosto) : null
      if (kosto.trim() && (cost2 == null || cost2 < 0)) return setError('Kosto nuk është e vlefshme.')
    }
    const data = { ...form, cmimi: price, stokMinimal: Math.max(0, Math.trunc(Number(form.stokMinimal) || 0)) }
    setBusy(true)
    try {
      if (isNew) {
        const { id } = await createItem(data, showCost ? cost2 : null, { autoCode }, profile?.emri)
        onSaved?.(id)
      } else {
        // Kosto preket vetëm nëse ndryshoi
        const costChanged = showCost && (cost2 ?? null) !== (cost ?? null)
        await updateItem(item.id, data, costChanged ? cost2 : undefined, profile?.emri)
      }
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? 'Artikull i ri' : `${item.kodi} – ${item.emri}`} onClose={onClose} wide>
      <form onSubmit={onSubmit}>
        <fieldset className="plain">
          <div className="grid-2">
            <label className="field">
              <span>Kodi</span>
              <input
                value={form.kodi}
                onChange={(e) => {
                  set({ kodi: e.target.value })
                  setAutoCode(false)
                }}
                required
              />
              {isNew && <small className="muted">{autoCode ? 'Kod automatik – mund ta ndryshoni.' : 'Kod manual – kontrollohet që të jetë unik.'}</small>}
            </label>
            <label className="field">
              <span>Emri *</span>
              <input value={form.emri} onChange={(e) => set({ emri: e.target.value })} required autoFocus={isNew} />
            </label>
            <label className="field">
              <span>Kategoria</span>
              <select value={form.kategoria} onChange={(e) => set({ kategoria: e.target.value, nenkategoria: '' })}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.emri} value={c.emri}>{c.emri}</option>)}
                {form.kategoria && !categories.some((c) => c.emri === form.kategoria) && <option value={form.kategoria}>{form.kategoria}</option>}
              </select>
            </label>
            <label className="field">
              <span>Nënkategoria</span>
              <select value={form.nenkategoria} onChange={(e) => set({ nenkategoria: e.target.value })} disabled={!subcats.length && !form.nenkategoria}>
                <option value="">—</option>
                {subcats.map((n) => <option key={n} value={n}>{n}</option>)}
                {form.nenkategoria && !subcats.includes(form.nenkategoria) && <option value={form.nenkategoria}>{form.nenkategoria}</option>}
              </select>
            </label>
            <label className="field">
              <span>Njësia</span>
              <select value={form.njesia} onChange={(e) => set({ njesia: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Stoku minimal</span>
              <input type="number" min={0} step={1} value={form.stokMinimal} onChange={(e) => set({ stokMinimal: e.target.value })} />
            </label>
            <label className="field">
              <span>Çmimi i shitjes (LEK) *</span>
              <input inputMode="decimal" placeholder="0,00" value={cmimi} onChange={(e) => setCmimi(e.target.value)} required />
            </label>
            {showCost && (
              <label className="field">
                <span>Çmimi i blerjes / kosto (LEK)</span>
                <input inputMode="decimal" placeholder="0,00" value={kosto} onChange={(e) => setKosto(e.target.value)} />
              </label>
            )}
          </div>
          <p className="muted small">Stoku nuk shkruhet me dorë: llogaritet nga lëvizjet e Inventarit (Faza 4).</p>
        </fieldset>

        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Anulo</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj'}</button>
        </div>
      </form>

    </Modal>
  )
}
