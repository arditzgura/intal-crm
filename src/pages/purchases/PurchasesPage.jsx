import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClients } from '../../services/clientService'
import { queryPurchases } from '../../services/purchaseService'
import { errorMessage } from '../../services/authService'
import { formatMoney } from '../../utils/money'
import { endOfDay, formatDate, startOfDay } from '../../utils/date'
import SearchPicker from '../../components/SearchPicker'

const EMPTY = { from: '', to: '', furnitorId: '', statusi: '' }

export default function PurchasesPage() {
  const { perms } = useAuth()
  const navigate = useNavigate()
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Blerje (Hyrje malli)</h1>
        {perms.has('blerje_regjistro') && (
          <button className="btn primary" onClick={() => navigate('/blerje/e-re')}><Plus size={16} /> Hyrje e re</button>
        )}
      </div>
      <PurchaseList />
    </div>
  )
}

export function PurchaseList({ fixedSupplierId }) {
  const navigate = useNavigate()
  const { data: clients } = useLive(watchClients, [], { enabled: !fixedSupplierId, initial: [] })
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState(EMPTY)
  const [pages, setPages] = useState([null])
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    queryPurchases(
      {
        furnitorId: fixedSupplierId || filters.furnitorId || undefined,
        statusi: filters.statusi || undefined,
        from: filters.from ? startOfDay(filters.from) : undefined,
        to: filters.to ? endOfDay(filters.to) : undefined,
      },
      pages[page],
    )
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
  }, [filters, page, fixedSupplierId])

  const apply = (e) => {
    e?.preventDefault()
    setPages([null])
    setPage(0)
    setFilters(draft)
  }
  const options = useMemo(
    () => clients.filter((c) => c.tipi !== 'klient').map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}`, search: [c.kodi, c.emri] })),
    [clients],
  )

  return (
    <>
      <form className="card filters" onSubmit={apply}>
        <label className="inline-field">Nga <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="inline-field">Deri <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
        {!fixedSupplierId && (
          <div className="grow picker-filter">
            <SearchPicker options={options} value={draft.furnitorId} onChange={(id) => setDraft({ ...draft, furnitorId: id })} placeholder="Të gjithë furnitorët" />
          </div>
        )}
        <select value={draft.statusi} onChange={(e) => setDraft({ ...draft, statusi: e.target.value })}>
          <option value="">Të gjitha</option>
          <option value="regjistruar">Të regjistruara</option>
          <option value="anuluar">Të anuluara</option>
        </select>
        <button className="btn primary"><Search size={16} /> Kërko</button>
        <button type="button" className="btn" onClick={() => { setDraft(EMPTY); setPages([null]); setPage(0); setFilters(EMPTY) }}><X size={16} /></button>
      </form>
      {error && <div className="alert error">{error}</div>}
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table clickable-rows">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Data</th>
                <th>Origjina / furnitori</th>
                <th>Kategoria</th>
                <th className="num">Totali (blerje)</th>
                <th className="num">Totali (shitje)</th>
                <th>Statusi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={7} className="muted">Asnjë hyrje malli.</td></tr>}
              {!loading && rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/blerje/${r.id}`)} className={r.statusi === 'anuluar' ? 'archived' : ''}>
                  <td className="mono">{r.numriTekst}</td>
                  <td>{formatDate(r.data)}</td>
                  <td>{r.origjinaEmri}{r.furnitorId && <span className="tag">Furnitor</span>}</td>
                  <td>{r.kategoria}</td>
                  <td className="num"><b>{formatMoney(r.totaliBlerje, r.monedha)}</b></td>
                  <td className="num">{formatMoney(r.totaliShitje, 'LEK')}</td>
                  <td>{r.statusi === 'anuluar' ? <span className="status st-anuluar">Anuluar</span> : <span className="status st-e_paguar">Regjistruar</span>}</td>
                </tr>
              ))}
            </tbody>
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
