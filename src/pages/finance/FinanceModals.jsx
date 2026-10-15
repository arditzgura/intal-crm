import { useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import SearchPicker from '../../components/SearchPicker'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchClients } from '../../services/clientService'
import { rateFor } from '../../services/ledgerService'
import { ACCOUNTS, cashAdjust, cashTransfer, createExpense, paySupplier } from '../../services/cashService'
import { errorMessage } from '../../services/authService'
import { CURRENCIES, formatMoney, formatRate, parseMoney, parseRate } from '../../utils/money'
import { fromInputDate, toInputDate } from '../../utils/date'

/** Fushat e përbashkëta: llogaria, monedha, kursi, shuma, data. */
function useMoneyForm(initialCurrency = 'LEK') {
  const { settings } = useSettings()
  const [llogaria, setLlogaria] = useState('arke')
  const [monedha, setMonedhaRaw] = useState(initialCurrency)
  const [kursiText, setKursiText] = useState(initialCurrency === 'LEK' ? '' : formatRate(rateFor(initialCurrency, settings)))
  const [shumaText, setShumaText] = useState('')
  const [dataText, setDataText] = useState(toInputDate())
  const setMonedha = (c) => {
    setMonedhaRaw(c)
    setKursiText(c === 'LEK' ? '' : formatRate(rateFor(c, settings)))
  }
  const kursi = monedha === 'LEK' ? rateFor('LEK', settings) : parseRate(kursiText)
  return { llogaria, setLlogaria, monedha, setMonedha, kursiText, setKursiText, kursi, shumaText, setShumaText, shuma: parseMoney(shumaText), dataText, setDataText, data: () => fromInputDate(dataText) }
}

function MoneyFields({ f, signed, hideAccount, amountLabel = 'Shuma' }) {
  return (
    <div className="grid-2">
      {!hideAccount && (
        <label className="field">
          <span>Llogaria</span>
          <select value={f.llogaria} onChange={(e) => f.setLlogaria(e.target.value)}>
            {Object.entries(ACCOUNTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>Monedha</span>
        <select value={f.monedha} onChange={(e) => f.setMonedha(e.target.value)}>
          {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {f.monedha !== 'LEK' && (
        <label className="field">
          <span>Kursi 1 {f.monedha} = ? LEK</span>
          <input inputMode="decimal" value={f.kursiText} onChange={(e) => f.setKursiText(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>{amountLabel}{signed ? ' (me "-" për zbritje)' : ''}</span>
        <input inputMode="decimal" placeholder="0" value={f.shumaText} onChange={(e) => f.setShumaText(e.target.value)} autoFocus required />
      </label>
      <label className="field">
        <span>Data</span>
        <input type="date" value={f.dataText} onChange={(e) => f.setDataText(e.target.value)} required />
      </label>
    </div>
  )
}

function useSubmit(onClose) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn) => {
    setError('')
    setBusy(true)
    try {
      await fn()
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

function Actions({ onClose, busy, label = 'Ruaj' }) {
  return (
    <div className="modal-actions">
      <button type="button" className="btn" onClick={onClose}>Anulo</button>
      <button className="btn primary" disabled={busy}>{busy ? 'Duke ruajtur…' : label}</button>
    </div>
  )
}

export function ExpenseModal({ onClose }) {
  const { profile } = useAuth()
  const { settings } = useSettings()
  const f = useMoneyForm()
  const cats = settings.kategorite.shpenzime ?? []
  const [kategoria, setKategoria] = useState(cats[0] ?? '')
  const [shenim, setShenim] = useState('')
  const s = useSubmit(onClose)
  return (
    <Modal title="Shpenzim i ri" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (f.shuma == null || f.shuma <= 0) return s.setError('Shuma nuk është e vlefshme.')
        s.run(() => createExpense({ kategoria, llogaria: f.llogaria, monedha: f.monedha, kursi: f.kursi, shuma: f.shuma, data: f.data(), shenim }, profile?.emri))
      }}>
        <label className="field">
          <span>Kategoria</span>
          <select value={kategoria} onChange={(e) => setKategoria(e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <MoneyFields f={f} />
        <label className="field"><span>Shënim</span><textarea rows={2} value={shenim} onChange={(e) => setShenim(e.target.value)} /></label>
        {s.error && <div className="alert error">{s.error}</div>}
        <Actions onClose={onClose} busy={s.busy} />
      </form>
    </Modal>
  )
}

/** Pagesë furnitorit; `supplier` opsional (kur hapet nga profili i furnitorit). */
export function SupplierPaymentModal({ supplier, onClose }) {
  const { profile } = useAuth()
  const { data: clients } = useLive(watchClients, [], { enabled: !supplier, initial: [] })
  const [clientId, setClientId] = useState(supplier?.id ?? '')
  const current = supplier ?? clients.find((c) => c.id === clientId)
  const owed = Object.entries(current?.detyrimFurnitori ?? {}).filter(([, v]) => v > 0)
  const f = useMoneyForm(owed[0]?.[0] ?? 'LEK')
  const [shenim, setShenim] = useState('')
  const s = useSubmit(onClose)
  const options = useMemo(
    () => clients.filter((c) => c.tipi !== 'klient').map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, sub: Object.entries(c.detyrimFurnitori ?? {}).filter(([, v]) => v > 0).map(([m, v]) => formatMoney(v, m)).join(' · '), search: [c.kodi, c.emri] })),
    [clients],
  )
  return (
    <Modal title={`Pagesë furnitorit${supplier ? ` – ${supplier.emri}` : ''}`} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!clientId) return s.setError('Zgjidhni furnitorin.')
        if (f.shuma == null || f.shuma <= 0) return s.setError('Shuma nuk është e vlefshme.')
        s.run(() => paySupplier({ clientId, llogaria: f.llogaria, monedha: f.monedha, kursi: f.kursi, shuma: f.shuma, data: f.data(), shenim }, profile?.emri))
      }}>
        {!supplier && (
          <div className="field"><span>Furnitori *</span><SearchPicker options={options} value={clientId} onChange={setClientId} placeholder="Kërko furnitorin…" /></div>
        )}
        {current && (
          <div className="info-row">
            Detyrimi aktual: {owed.length ? owed.map(([m, v]) => <b key={m}>{formatMoney(v, m)}</b>) : <span className="muted">asnjë</span>}
          </div>
        )}
        <MoneyFields f={f} />
        <label className="field"><span>Shënim</span><input value={shenim} onChange={(e) => setShenim(e.target.value)} placeholder="p.sh. pagesë për hyrjen H-0003" /></label>
        {s.error && <div className="alert error">{s.error}</div>}
        <Actions onClose={onClose} busy={s.busy} label="Paguaj" />
      </form>
    </Modal>
  )
}

export function CashAdjustModal({ onClose }) {
  const { profile } = useAuth()
  const f = useMoneyForm()
  const [tipi, setTipi] = useState('gjendje_fillestare')
  const [shenim, setShenim] = useState('Gjendja fillestare')
  const s = useSubmit(onClose)
  return (
    <Modal title="Gjendje fillestare / rregullim arke" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (f.shuma == null || f.shuma === 0) return s.setError('Shuma nuk është e vlefshme.')
        s.run(() => cashAdjust({ tipi, llogaria: f.llogaria, monedha: f.monedha, kursi: f.kursi, shuma: f.shuma, data: f.data(), shenim }, profile?.emri))
      }}>
        <label className="field">
          <span>Lloji</span>
          <select value={tipi} onChange={(e) => { setTipi(e.target.value); setShenim(e.target.value === 'gjendje_fillestare' ? 'Gjendja fillestare' : '') }}>
            <option value="gjendje_fillestare">Gjendje fillestare</option>
            <option value="rregullim">Rregullim (diferencë numërimi etj.)</option>
          </select>
        </label>
        <MoneyFields f={f} signed />
        <label className="field"><span>Arsyeja / shënimi *</span><input value={shenim} onChange={(e) => setShenim(e.target.value)} required /></label>
        {s.error && <div className="alert error">{s.error}</div>}
        <Actions onClose={onClose} busy={s.busy} />
      </form>
    </Modal>
  )
}

export function TransferModal({ onClose }) {
  const { profile } = useAuth()
  const f = useMoneyForm()
  const [nga, setNga] = useState('arke')
  const [shenim, setShenim] = useState('')
  const s = useSubmit(onClose)
  const ne = nga === 'arke' ? 'banke' : 'arke'
  return (
    <Modal title="Transfertë arkë ↔ bankë" onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (f.shuma == null || f.shuma <= 0) return s.setError('Shuma nuk është e vlefshme.')
        s.run(() => cashTransfer({ nga, ne, monedha: f.monedha, kursi: f.kursi, shuma: f.shuma, data: f.data(), shenim }, profile?.emri))
      }}>
        <label className="field">
          <span>Drejtimi</span>
          <select value={nga} onChange={(e) => setNga(e.target.value)}>
            <option value="arke">Arkë → Bankë (depozitim)</option>
            <option value="banke">Bankë → Arkë (tërheqje)</option>
          </select>
        </label>
        <MoneyFields f={f} hideAccount />
        <label className="field"><span>Shënim</span><input value={shenim} onChange={(e) => setShenim(e.target.value)} /></label>
        {s.error && <div className="alert error">{s.error}</div>}
        <Actions onClose={onClose} busy={s.busy} />
      </form>
    </Modal>
  )
}

/** Anulim me arsye (shpenzim / pagesë furnitori). */
export function CancelReasonModal({ title, text, onConfirm, onClose }) {
  const [arsye, setArsye] = useState('')
  const s = useSubmit(onClose)
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); s.run(() => onConfirm(arsye)) }}>
        <p>{text}</p>
        <label className="field"><span>Arsyeja *</span><textarea rows={2} value={arsye} onChange={(e) => setArsye(e.target.value)} required autoFocus /></label>
        {s.error && <div className="alert error">{s.error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Mbyll</button>
          <button className="btn danger" disabled={s.busy || !arsye.trim()}>{s.busy ? 'Duke anuluar…' : 'Anulo'}</button>
        </div>
      </form>
    </Modal>
  )
}
