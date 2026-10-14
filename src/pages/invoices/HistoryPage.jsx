import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClients } from '../../services/clientService'
import { queryInvoices, queryAuditLog } from '../../services/invoiceService'
import { STATUS_LABELS } from '../../services/invoiceChain'
import { errorMessage } from '../../services/authService'
import { CURRENCIES, formatMoney, parseMoney } from '../../utils/money'
import { endOfDay, formatDate, formatDateTime, startOfDay } from '../../utils/date'
import SearchPicker from '../../components/SearchPicker'
import { StatusBadge, ACTION_LABELS } from './InvoiceViewPage'

const EMPTY = { from: '', to: '', clientId: '', statusi: '', monedha: '', min: '', max: '', numri: '' }

export default function HistoryPage() {
  const { perms } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('skeda') === 'veprimet' && perms.has('sheh_logun') ? 'veprimet' : 'faturat'
  return (
    <div>
      <h1 className="page-title">Historiku</h1>
      {perms.has('sheh_logun') && (
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'faturat' ? 'active' : ''}`} onClick={() => setParams({})}>Faturat</button>
          <button role="tab" className={`tab ${tab === 'veprimet' ? 'active' : ''}`} onClick={() => setParams({ skeda: 'veprimet' })}>Veprimet në sistem</button>
        </div>
      )}
      {tab === 'faturat' ? <InvoiceList /> : <AuditList />}
    </div>
  )
}

/** Lista e faturave me filtra; faqe nga serveri (cursor), 50 për faqe. */
export function InvoiceList({ fixedClientId }) {
  const navigate = useNavigate()
  const { data: clients } = useLive(watchClients, [], { enabled: !fixedClientId, initial: [] })
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [pages, setPages] = useState([null]) // cursor-at e fillimit të çdo faqeje
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const toQuery = useCallback(
    (f) => ({
      clientId: fixedClientId || f.clientId || undefined,
      statusi: f.statusi || undefined,
      monedha: f.monedha || undefined,
      from: f.from ? startOfDay(f.from) : undefined,
      to: f.to ? endOfDay(f.to) : undefined,
      min: f.min.trim() ? parseMoney(f.min) : undefined,
      max: f.max.trim() ? parseMoney(f.max) : undefined,
      numri: f.numri.trim() || undefined,
    }),
    [fixedClientId],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    queryInvoices(toQuery(filters), pages[page])
      .then((res) => {
        if (cancelled) return
        setRows(res.rows)
        setMore(res.more)
        setPages((p) => {
          const next = [...p]
          next[page + 1] = res.cursor
          return next
        })
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, toQuery])

  function apply(e) {
    e?.preventDefault()
    setPages([null])
    setPage(0)
    setFilters(draft)
  }
  function clear() {
    setDraft(EMPTY)
    setPages([null])
    setPage(0)
    setFilters(EMPTY)
  }

  const clientOptions = useMemo(
    () => clients.map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, sub: c.qyteti, search: [c.kodi, c.emri, c.qyteti] })),
    [clients],
  )
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const totals = {}
  for (const r of rows.filter((x) => x.statusi !== 'anuluar' && x.statusi !== 'draft')) totals[r.monedha] = (totals[r.monedha] ?? 0) + r.totali

  return (
    <>
      <form className="card filters" onSubmit={apply}>
        <input className="num-search" placeholder="Nr. fature" value={draft.numri} onChange={(e) => set({ numri: e.target.value })} />
        <label className="inline-field">Nga <input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="inline-field">Deri <input type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} /></label>
        {!fixedClientId && (
          <div className="grow picker-filter">
            <SearchPicker options={clientOptions} value={draft.clientId} onChange={(id) => set({ clientId: id })} placeholder="Të gjithë klientët" />
          </div>
        )}
        <select value={draft.statusi} onChange={(e) => set({ statusi: e.target.value })}>
          <option value="">Të gjitha statuset</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={draft.monedha} onChange={(e) => set({ monedha: e.target.value })}>
          <option value="">Monedha</option>
          {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="amount-input" inputMode="decimal" placeholder="Shuma min" value={draft.min} onChange={(e) => set({ min: e.target.value })} />
        <input className="amount-input" inputMode="decimal" placeholder="Shuma max" value={draft.max} onChange={(e) => set({ max: e.target.value })} />
        <button className="btn primary"><Search size={16} /> Kërko</button>
        <button type="button" className="btn" onClick={clear}><X size={16} /></button>
      </form>
      {(filters.min || filters.max) && <p className="muted small">Me filtër shume, lista renditet sipas shumës.</p>}
      {error && <div className="alert error">{error}</div>}

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table clickable-rows">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Data</th>
                {!fixedClientId && <th>Klienti</th>}
                <th className="num">Totali</th>
                <th className="num">Paguar</th>
                <th className="num">Gjendja e re</th>
                <th>Statusi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={7} className="muted">Asnjë faturë.</td></tr>}
              {!loading && rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(r.statusi === 'draft' ? `/fature-e-re?draft=${r.id}` : `/fatura/${r.id}`)} className={r.statusi === 'anuluar' ? 'archived' : ''}>
                  <td className="mono">
                    {r.numriTekst ?? '—'}
                    {r.numriVjeter && <div className="small muted">vjetër: {r.numriVjeter}</div>}
                  </td>
                  <td>{formatDate(r.data)}</td>
                  {!fixedClientId && <td>{r.klient?.emri}</td>}
                  <td className="num"><b>{formatMoney(r.totali, r.monedha)}</b></td>
                  <td className="num">{r.statusi === 'draft' ? '' : formatMoney(r.paguar)}</td>
                  <td className="num">{r.statusi === 'draft' ? '' : formatMoney(r.gjendjaRe)}</td>
                  <td><StatusBadge statusi={r.statusi} /></td>
                </tr>
              ))}
            </tbody>
            {!loading && Object.keys(totals).length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={fixedClientId ? 2 : 3} className="muted small">Totali i kësaj faqeje (pa anuluarat)</td>
                  <td className="num">{Object.entries(totals).map(([c, v]) => <div key={c}>{formatMoney(v, c)}</div>)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="pager">
          <button className="btn small" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>‹ Para</button>
          <span className="muted small">Faqja {page + 1}</span>
          <button className="btn small" disabled={!more || loading} onClick={() => setPage(page + 1)}>Pas ›</button>
        </div>
      </div>
    </>
  )
}

function AuditList() {
  const [pages, setPages] = useState([null])
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    queryAuditLog(pages[page])
      .then((res) => {
        setRows(res.rows)
        setMore(res.more)
        setPages((p) => {
          const next = [...p]
          next[page + 1] = res.cursor
          return next
        })
      })
      .catch((err) => setError(errorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  return (
    <div className="card no-pad">
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Koha</th><th>Përdoruesi</th><th>Veprimi</th><th>Dokumenti</th><th>Detaje</th></tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="small">{formatDateTime(l.koha)}</td>
                <td>{l.emri}</td>
                <td>{ACTION_LABELS[l.action] ?? l.action.replace(/_/g, ' ')}</td>
                <td className="small muted">{l.entity}{l.details?.numri ? ` #${l.details.numri}` : ''}</td>
                <td className="wrap small muted">{describeDetails(l.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Para</button>
        <span className="muted small">Faqja {page + 1}</span>
        <button className="btn small" disabled={!more} onClick={() => setPage(page + 1)}>Pas ›</button>
      </div>
    </div>
  )
}

function describeDetails(d) {
  if (!d) return ''
  return ['klienti', 'emri', 'kodi', 'arsye', 'shenim', 'seksioni']
    .filter((k) => d[k])
    .map((k) => String(d[k]))
    .join(' · ')
}
