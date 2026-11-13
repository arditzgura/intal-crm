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
import { useSort, SortTh } from '../../hooks/useSort'

const EMPTY = { from: '', to: '', furnitorId: '', statusi: '' }

export default function PurchasesPage() {
  const { perms } = useAuth()
  const navigate = useNavigate()
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Fletëhyrje</h1>
        {perms.has('blerje_regjistro') && (
          <button className="btn primary" onClick={() => navigate('/blerje/e-re')}><Plus size={16} /> Fletëhyrje e re</button>
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
  // Origjinat e hyrjeve (p.sh. MAGAZINA QENDRORE, TURKE) që janë parë në listë – zgjedhje te filtri
  const [origins, setOrigins] = useState([])
  useEffect(() => {
    const names = rows.map((r) => r.origjinaEmri).filter(Boolean)
    setOrigins((o) => (names.some((n) => !o.includes(n)) ? [...new Set([...o, ...names])].sort((a, b) => a.localeCompare(b, 'sq')) : o))
  }, [rows])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // Filtri: "f:<id>" = furnitor (klient), "o:<emri>" = origjina e hyrjes
    const sel = filters.furnitorId || ''
    queryPurchases(
      {
        furnitorId: fixedSupplierId || (sel.startsWith('f:') ? sel.slice(2) : undefined),
        origjinaEmri: sel.startsWith('o:') ? sel.slice(2) : undefined,
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

  const s = useSort(rows, {
    nr: (r) => r.numri,
    data: (r) => r.data,
    origjina: (r) => r.origjinaEmri,
    kategoria: (r) => r.kategoria,
    blerje: (r) => r.totaliBlerje,
    shitje: (r) => r.totaliShitje,
    statusi: (r) => r.statusi,
  })

  // Zgjedhjet (furnitori, statusi) aplikohen menjëherë, pa shtypur "Kërko"
  const applyNow = (next) => {
    setDraft(next)
    setPages([null])
    setPage(0)
    setFilters(next)
  }

  const apply = (e) => {
    e?.preventDefault()
    setPages([null])
    setPage(0)
    setFilters(draft)
  }
  const options = useMemo(
    () => clients.filter((c) => c.tipi && c.tipi !== 'klient').sort((a, b) => a.emri.localeCompare(b.emri, 'sq')).map((c) => ({ id: c.id, label: `${c.kodi} – ${c.emri}` })),
    [clients],
  )

  return (
    <>
      <form className="card filters" onSubmit={apply}>
        <label className="inline-field">Nga <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="inline-field">Deri <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
        {!fixedSupplierId && (
          <select value={draft.furnitorId} onChange={(e) => applyNow({ ...draft, furnitorId: e.target.value })}>
            <option value="">Të gjithë furnitorët</option>
            {options.length > 0 && (
              <optgroup label="Furnitorët">
                {options.map((o) => <option key={o.id} value={`f:${o.id}`}>{o.label}</option>)}
              </optgroup>
            )}
            {origins.length > 0 && (
              <optgroup label="Origjina e hyrjes">
                {origins.map((n) => <option key={n} value={`o:${n}`}>{n}</option>)}
              </optgroup>
            )}
          </select>
        )}
        <select value={draft.statusi} onChange={(e) => applyNow({ ...draft, statusi: e.target.value })}>
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
                <SortTh s={s} k="nr">Nr.</SortTh>
                <SortTh s={s} k="data">Data</SortTh>
                <SortTh s={s} k="origjina">Origjina / furnitori</SortTh>
                <SortTh s={s} k="kategoria">Kategoria</SortTh>
                <SortTh s={s} k="blerje" className="num">Totali (blerje)</SortTh>
                <SortTh s={s} k="shitje" className="num">Totali (shitje)</SortTh>
                <SortTh s={s} k="statusi">Statusi</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={7} className="muted">Asnjë hyrje malli.</td></tr>}
              {!loading && s.sorted.map((r) => (
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
