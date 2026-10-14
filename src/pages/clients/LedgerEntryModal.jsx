import { useState } from 'react'
import Modal from '../../components/Modal'
import Balance from '../../components/Balance'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import { addLedgerEntry, adjustBalanceTo, rateFor } from '../../services/ledgerService'
import { errorMessage } from '../../services/authService'
import { LEDGER_TYPES, OTHER_MOVEMENTS, PAYMENT_METHODS, canLedger } from '../../config/ledger'
import { CURRENCIES, formatMoney, formatRate, parseMoney, parseRate } from '../../utils/money'
import { fromInputDate, toInputDate } from '../../utils/date'

const TITLES = {
  pagese: 'Regjistro pagesë',
  tjeter: 'Lëvizje tjetër',
  rregullim: 'Rregullim gjendjeje',
  gjendje_fillestare: 'Gjendja fillestare',
}

/**
 * mode: 'pagese' | 'tjeter' (kthim/zbritje/postë) | 'rregullim' | 'gjendje_fillestare'
 */
export default function LedgerEntryModal({ mode, client, onClose }) {
  const { perms, profile } = useAuth()
  const { settings } = useSettings()
  const otherTypes = OTHER_MOVEMENTS.filter((t) => canLedger(perms, t))
  const availableCurrencies =
    mode === 'gjendje_fillestare'
      ? Object.keys(CURRENCIES).filter((c) => !client.fillestare?.[c])
      : Object.keys(CURRENCIES)
  const defaultCurrency = availableCurrencies.includes(client.monedhaPreferuar)
    ? client.monedhaPreferuar
    : availableCurrencies[0]

  const [tipi, setTipi] = useState(mode === 'tjeter' ? otherTypes[0] : mode)
  const [monedha, setMonedha] = useState(defaultCurrency)
  const [kursi, setKursi] = useState(formatRate(rateFor(defaultCurrency, settings)))
  const [shuma, setShuma] = useState('')
  const [metoda, setMetoda] = useState('arke')
  const [data, setData] = useState(toInputDate())
  const [shenim, setShenim] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const current = client.gjendje?.[monedha] ?? 0
  const needsReason = mode === 'rregullim' || mode === 'tjeter'

  function changeCurrency(c) {
    setMonedha(c)
    setKursi(formatRate(rateFor(c, settings)))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const amount = parseMoney(shuma)
    if (amount == null) return setError('Shuma nuk është numër i vlefshëm.')
    const rate = monedha === 'LEK' ? rateFor('LEK', settings) : parseRate(kursi)
    if (!rate || rate <= 0) return setError('Kursi nuk është i vlefshëm.')
    if (needsReason && !shenim.trim()) return setError('Arsyeja / shënimi është i detyrueshëm.')
    setBusy(true)
    try {
      const common = { clientId: client.id, monedha, kursi: rate, data: fromInputDate(data) }
      if (mode === 'rregullim') {
        await adjustBalanceTo({ ...common, gjendjaAktuale: current, gjendjaRe: amount, arsye: shenim }, profile?.emri)
      } else {
        await addLedgerEntry(
          {
            ...common,
            tipi,
            shuma: amount,
            metoda: tipi === 'pagese' ? metoda : null,
            shenim,
            arsye: needsReason ? shenim : '',
          },
          profile?.emri,
        )
      }
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  if (!availableCurrencies.length) {
    return (
      <Modal title={TITLES[mode]} onClose={onClose}>
        <p>Gjendja fillestare është vendosur tashmë për të gjitha monedhat. Për ndryshime përdorni "Rregullim gjendjeje".</p>
      </Modal>
    )
  }

  const parsed = parseMoney(shuma)
  let preview = null
  if (parsed != null) {
    if (mode === 'rregullim') preview = parsed
    else {
      const sign = LEDGER_TYPES[tipi].sign
      preview = current + (sign === 0 ? parsed : sign * Math.abs(parsed))
    }
  }

  return (
    <Modal title={`${TITLES[mode]} – ${client.emri}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        {mode === 'tjeter' && (
          <label className="field">
            <span>Lloji</span>
            <select value={tipi} onChange={(e) => setTipi(e.target.value)}>
              {otherTypes.map((t) => (
                <option key={t} value={t}>{LEDGER_TYPES[t].label}</option>
              ))}
            </select>
          </label>
        )}

        <div className="grid-2">
          <label className="field">
            <span>Monedha</span>
            <select value={monedha} onChange={(e) => changeCurrency(e.target.value)}>
              {availableCurrencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          {monedha !== 'LEK' ? (
            <label className="field">
              <span>Kursi 1 {monedha} = ? LEK</span>
              <input inputMode="decimal" value={kursi} onChange={(e) => setKursi(e.target.value)} />
            </label>
          ) : (
            <div />
          )}
        </div>

        <div className="info-row">
          Gjendja aktuale në {monedha}: <Balance value={current} currency={monedha} showLabel />
        </div>

        <div className="grid-2">
          <label className="field">
            <span>
              {mode === 'rregullim'
                ? 'Gjendja e re (pozitive = detyrim, me "-" = tepricë)'
                : mode === 'gjendje_fillestare'
                  ? 'Shuma (pozitive = detyrim, me "-" = tepricë)'
                  : 'Shuma'}
            </span>
            <input inputMode="decimal" placeholder="0,00" value={shuma} onChange={(e) => setShuma(e.target.value)} autoFocus required />
          </label>
          <label className="field">
            <span>Data</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </label>
        </div>

        {mode === 'pagese' && (
          <label className="field">
            <span>Mënyra e pagesës</span>
            <select value={metoda} onChange={(e) => setMetoda(e.target.value)}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>{needsReason ? 'Arsyeja / shënimi *' : 'Shënim'}</span>
          <textarea rows={2} value={shenim} onChange={(e) => setShenim(e.target.value)} required={needsReason} />
        </label>

        {preview != null && (
          <div className="info-row">
            Gjendja pas veprimit: <Balance value={preview} currency={monedha} showLabel />
            {mode === 'rregullim' && preview !== current && (
              <span className="muted small"> (diferenca {formatMoney(preview - current)} {monedha})</span>
            )}
          </div>
        )}

        {mode === 'pagese' && (
          <p className="muted small">
            Nga Faza 3, pagesa zbritet automatikisht nga fatura më e fundit e klientit (ajo që mban borxhin).
          </p>
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
