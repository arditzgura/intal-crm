import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import SearchPicker from '../../components/SearchPicker'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import {
  EMPTY_ITEM, UNITS, createItem, updateItem, setItemArchived, suggestItemCode,
  watchPricesForItem, setPreferentialPrice, removePreferentialPrice,
} from '../../services/itemService'
import { watchClients } from '../../services/clientService'
import { errorMessage } from '../../services/authService'
import { formatMoney, parseMoney } from '../../utils/money'

const moneyText = (v) => (v == null ? '' : formatMoney(v))

export default function ItemFormModal({ item, cost, readOnly, showCost, onClose }) {
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
        await createItem(data, showCost ? cost2 : null, { autoCode }, profile?.emri)
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

  async function toggleArchive() {
    if (!window.confirm(item.arkivuar ? 'Të riaktivizohet artikulli?' : 'Të arkivohet artikulli? Nuk fshihet; thjesht nuk shfaqet më te lista.')) return
    try {
      await setItemArchived(item.id, !item.arkivuar, profile?.emri)
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
    }
  }

  return (
    <Modal title={isNew ? 'Artikull i ri' : `${item.kodi} – ${item.emri}`} onClose={onClose} wide>
      <form onSubmit={onSubmit}>
        <fieldset disabled={readOnly} className="plain">
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
        {!readOnly && (
          <div className="modal-actions">
            {!isNew && (
              <button type="button" className="btn" onClick={toggleArchive}>
                {item.arkivuar ? 'Riaktivizo' : 'Arkivo'}
              </button>
            )}
            <span className="grow" />
            <button type="button" className="btn" onClick={onClose}>Anulo</button>
            <button className="btn primary" disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj'}</button>
          </div>
        )}
      </form>

      {!isNew && <ItemPrices item={item} readOnly={readOnly} />}
    </Modal>
  )
}

/** Çmimet preferenciale të artikullit: klient → çmim. */
function ItemPrices({ item, readOnly }) {
  const { profile } = useAuth()
  const { data: prices, error } = useLive((ok, ko) => watchPricesForItem(item.id, ok, ko), [item.id], { initial: [] })
  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const [clientId, setClientId] = useState('')
  const [cmimi, setCmimi] = useState('')
  const [msg, setMsg] = useState('')

  const byId = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const options = useMemo(
    () => clients.filter((c) => !c.arkivuar && !c.rastesor).map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, sub: c.qyteti, search: [c.kodi, c.emri, c.qyteti] })),
    [clients],
  )

  async function add(e) {
    e.preventDefault()
    setMsg('')
    const v = parseMoney(cmimi)
    if (!clientId) return setMsg('Zgjidhni klientin.')
    if (v == null || v < 0) return setMsg('Çmimi nuk është i vlefshëm.')
    try {
      await setPreferentialPrice(item.id, clientId, v, profile?.emri)
      setClientId('')
      setCmimi('')
    } catch (err) {
      setMsg(err.code ? errorMessage(err) : err.message)
    }
  }

  async function remove(p) {
    if (!window.confirm('Të hiqet ky çmim preferencial?')) return
    try {
      await removePreferentialPrice(item.id, p.clientId, profile?.emri)
    } catch (err) {
      setMsg(err.code ? errorMessage(err) : err.message)
    }
  }

  const rows = prices.map((p) => ({ ...p, client: byId[p.clientId] })).sort((a, b) => (a.client?.emri ?? '').localeCompare(b.client?.emri ?? '', 'sq'))

  return (
    <section className="subsection top-border">
      <h3>Çmime preferenciale</h3>
      <p className="muted small">Te Fatura e Re, çmimi merret automatikisht: 1) çmimi preferencial i klientit, 2) përndryshe çmimi standard ({formatMoney(item.cmimi, 'LEK')}).</p>
      {error && <div className="alert error">{errorMessage(error)}</div>}
      <table className="table">
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.client ? `${p.client.kodi} – ${p.client.emri}` : <span className="muted">Klient i panjohur</span>}</td>
              <td className="num"><b>{formatMoney(p.cmimi, 'LEK')}</b></td>
              {!readOnly && (
                <td className="num" style={{ width: 40 }}>
                  <button type="button" className="icon-btn danger-text" onClick={() => remove(p)} aria-label="Hiq"><Trash2 size={16} /></button>
                </td>
              )}
            </tr>
          ))}
          {!rows.length && <tr><td className="muted">Asnjë çmim preferencial.</td></tr>}
        </tbody>
      </table>
      {!readOnly && (
        <form className="inline-form" onSubmit={add}>
          <div className="grow"><SearchPicker options={options} value={clientId} onChange={setClientId} placeholder="Kërko klientin…" exclude={prices.map((p) => p.clientId)} /></div>
          <input className="price-input" inputMode="decimal" placeholder="Çmimi (LEK)" value={cmimi} onChange={(e) => setCmimi(e.target.value)} />
          <button className="btn primary">Shto</button>
        </form>
      )}
      {msg && <div className="alert error">{msg}</div>}
    </section>
  )
}
