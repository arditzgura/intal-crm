import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, RefreshCw, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchItems, watchItemCosts } from '../../services/itemService'
import { watchStock, queryMovements, adjustStock, recalcStock, MOVEMENT_TYPES } from '../../services/stockService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { formatMoney } from '../../utils/money'
import { formatDateTime } from '../../utils/date'
import { matchesSearch } from '../../utils/text'
import { downloadCsv } from '../../utils/csv'
import Pagination, { usePaged } from '../../components/Pagination'
import Modal from '../../components/Modal'

export default function InventoryPage() {
  const { perms } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('skeda') ?? 'gjendja'
  const canAdjust = perms.has('inventar_rregullim')
  const tabs = [['gjendja', 'Gjendja e stokut'], ['levizjet', 'Regjistri i lëvizjeve'], ...(canAdjust ? [['inventarizim', 'Inventarizim']] : [])]

  return (
    <div>
      <h1 className="page-title">Inventari</h1>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParams({ skeda: k })}>{label}</button>
        ))}
      </div>
      {tab === 'gjendja' && <StockTab />}
      {tab === 'levizjet' && <MovementsTab />}
      {tab === 'inventarizim' && canAdjust && <CountSheet />}
    </div>
  )
}

function useStockData() {
  const { perms } = useAuth()
  const showCost = canSeeCost(perms)
  const { data: items, loading } = useLive(watchItems, [], { initial: [] })
  const { data: stock } = useLive(watchStock, [], { initial: {} })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showCost, initial: {} })
  return { items, stock, costs, showCost, loading }
}

function StockTab() {
  const { perms, profile } = useAuth()
  const { settings } = useSettings()
  const { items, stock, costs, showCost, loading } = useStockData()
  const [q, setQ] = useState('')
  const [kat, setKat] = useState('')
  const [only, setOnly] = useState('')
  const [adjusting, setAdjusting] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () =>
      items
        .filter((i) => !i.arkivuar)
        .map((i) => {
          const sasia = stock[i.id] ?? 0
          return {
            ...i,
            sasia,
            nenMin: i.stokMinimal > 0 && sasia < i.stokMinimal,
            negativ: sasia < 0,
            vleraKosto: costs[i.id] != null ? Math.max(0, sasia) * costs[i.id] : null,
            vleraShitje: Math.max(0, sasia) * (i.cmimi ?? 0),
          }
        })
        .filter((r) => !kat || r.kategoria === kat)
        .filter((r) => (only === 'min' ? r.nenMin : only === 'neg' ? r.negativ : true))
        .filter((r) => matchesSearch(q, r.kodi, r.emri, r.kategoria))
        .sort((a, b) => (a.kodi || '').localeCompare(b.kodi || '', 'sq', { numeric: true })),
    [items, stock, costs, q, kat, only],
  )
  const paged = usePaged(rows, `${q}|${kat}|${only}`)
  const totalCost = rows.reduce((s, r) => s + (r.vleraKosto ?? 0), 0)
  const totalSale = rows.reduce((s, r) => s + r.vleraShitje, 0)
  const lowCount = rows.filter((r) => r.nenMin).length
  const negCount = rows.filter((r) => r.negativ).length

  function exportCsv() {
    downloadCsv('inventari.csv', ['Kodi', 'Artikulli', 'Kategoria', 'Njësia', 'Stoku', 'Stok minimal', ...(showCost ? ['Vlera me kosto'] : []), 'Vlera me çmim shitje'],
      rows.map((r) => [r.kodi, r.emri, r.kategoria, r.njesia, r.sasia, r.stokMinimal || '', ...(showCost ? [r.vleraKosto != null ? formatMoney(r.vleraKosto) : ''] : []), formatMoney(r.vleraShitje)]))
  }

  async function onRecalc() {
    if (!window.confirm('Të rindërtohet stoku i të gjithë artikujve nga regjistri i lëvizjeve?')) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await recalcStock(items.map((i) => i.id), profile?.emri)
      setMsg({ type: 'success', text: `Stoku u rillogarit: ${r.items} artikuj nga ${r.movements} lëvizje.` })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="balance-cards inv-cards">
        {showCost && <Card label="Vlera e stokut (kosto)" value={formatMoney(totalCost, 'LEK')} />}
        <Card label="Vlera e stokut (çmim shitje)" value={formatMoney(totalSale, 'LEK')} />
        <Card label="Nën stokun minimal" value={String(lowCount)} warn={lowCount > 0} onClick={() => setOnly(only === 'min' ? '' : 'min')} />
        <Card label="Me stok negativ" value={String(negCount)} warn={negCount > 0} onClick={() => setOnly(only === 'neg' ? '' : 'neg')} />
      </div>

      <div className="card filters">
        <input className="grow" placeholder="Kërko me kod ose emër…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kat} onChange={(e) => setKat(e.target.value)}>
          <option value="">Të gjitha kategoritë</option>
          {settings.kategorite.artikuj.map((c) => <option key={c.emri} value={c.emri}>{c.emri}</option>)}
        </select>
        <select value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">Të gjithë artikujt</option>
          <option value="min">Nën stokun minimal</option>
          <option value="neg">Me stok negativ</option>
        </select>
        <button className="btn" onClick={exportCsv}><Download size={16} /> CSV</button>
        {perms.has('admin') && (
          <button className="btn" onClick={onRecalc} disabled={busy} title="Rindërton stokun nga lëvizjet">
            <RefreshCw size={16} /> {busy ? 'Duke rillogaritur…' : 'Rillogarit stokun'}
          </button>
        )}
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Kodi</th>
                <th>Artikulli</th>
                <th>Kategoria</th>
                <th className="num">Stoku</th>
                <th className="num">Stok min.</th>
                {showCost && <th className="num">Vlera (kosto)</th>}
                <th className="num">Vlera (shitje)</th>
                {perms.has('inventar_rregullim') && <th />}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="muted">Duke u ngarkuar…</td></tr>}
              {paged.rows.map((r) => (
                <tr key={r.id} className={r.negativ ? 'row-neg' : r.nenMin ? 'row-low' : ''}>
                  <td className="mono">{r.kodi}</td>
                  <td><Link to={`/artikujt/${r.id}?skeda=stoku`}>{r.emri}</Link></td>
                  <td>{[r.kategoria, r.nenkategoria].filter(Boolean).join(' / ')}</td>
                  <td className="num">
                    <b>{r.sasia}</b> <span className="muted small">{r.njesia}</span>
                    {(r.nenMin || r.negativ) && <AlertTriangle size={14} className="warn-icon" />}
                  </td>
                  <td className="num">{r.stokMinimal || ''}</td>
                  {showCost && <td className="num">{r.vleraKosto != null ? formatMoney(r.vleraKosto) : <span className="muted">—</span>}</td>}
                  <td className="num">{formatMoney(r.vleraShitje)}</td>
                  {perms.has('inventar_rregullim') && (
                    <td className="num">
                      <button className="btn small" onClick={() => setAdjusting(r)}><SlidersHorizontal size={14} /> Rregullo</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} />
      </div>
      <p className="muted small">Vlera llogaritet vetëm mbi stokun pozitiv. Stoku = hyrje − dalje ± rregullime.</p>

      {adjusting && <AdjustModal item={adjusting} actorName={profile?.emri} onClose={() => setAdjusting(null)} />}
    </>
  )
}

function Card({ label, value, warn, onClick }) {
  return (
    <div className={`balance-card ${warn ? 'debt' : ''} ${onClick ? 'clickable-card' : ''}`} onClick={onClick}>
      <div className="balance-card-label">{label}</div>
      <div className="balance-card-value">{value}</div>
    </div>
  )
}

function AdjustModal({ item, actorName, onClose }) {
  const [numeruar, setNumeruar] = useState(String(item.sasia))
  const [arsye, setArsye] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const n = Number(numeruar)
  const diff = Number.isInteger(n) ? n - item.sasia : null

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!Number.isInteger(n)) return setError('Shkruani një numër të plotë.')
    setBusy(true)
    try {
      await adjustStock([{ itemId: item.id, aktuale: item.sasia, numeruar: n }], arsye, actorName)
      onClose()
    } catch (err) {
      setError(err.code ? errorMessage(err) : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Rregullim stoku – ${item.kodi} ${item.emri}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <p>Stoku aktual në sistem: <b>{item.sasia} {item.njesia}</b></p>
        <label className="field">
          <span>Sasia e numëruar (reale)</span>
          <input type="number" step={1} value={numeruar} onChange={(e) => setNumeruar(e.target.value)} autoFocus required />
        </label>
        {diff != null && diff !== 0 && (
          <div className="info-row">Diferenca: <b className={diff < 0 ? 'neg' : 'pos'}>{diff > 0 ? `+${diff}` : diff}</b> {item.njesia}</div>
        )}
        <label className="field">
          <span>Arsyeja *</span>
          <textarea rows={2} value={arsye} onChange={(e) => setArsye(e.target.value)} placeholder="p.sh. inventarizim mujor, mall i dëmtuar" required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Anulo</button>
          <button className="btn primary" disabled={busy || !diff}>{busy ? 'Duke ruajtur…' : 'Ruaj rregullimin'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Fletë inventarizimi: sasia e numëruar për shumë artikuj njëherësh. */
function CountSheet() {
  const { profile } = useAuth()
  const { items, stock } = useStockData()
  const [counts, setCounts] = useState({})
  const [q, setQ] = useState('')
  const [arsye, setArsye] = useState('Inventarizim')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const list = useMemo(
    () => items.filter((i) => !i.arkivuar && matchesSearch(q, i.kodi, i.emri, i.kategoria)).sort((a, b) => (a.kodi || '').localeCompare(b.kodi || '', 'sq', { numeric: true })),
    [items, q],
  )
  const changes = Object.entries(counts)
    .filter(([, v]) => v !== '' && Number.isInteger(Number(v)))
    .map(([itemId, v]) => ({ itemId, aktuale: stock[itemId] ?? 0, numeruar: Number(v) }))
    .filter((c) => c.numeruar !== c.aktuale)

  async function save() {
    setMsg(null)
    if (!changes.length) return setMsg({ type: 'error', text: 'Nuk ka asnjë diferencë.' })
    if (!window.confirm(`Të ruhen ${changes.length} rregullime stoku?`)) return
    setBusy(true)
    try {
      const n = await adjustStock(changes, arsye, profile?.emri)
      setCounts({})
      setMsg({ type: 'success', text: `U ruajtën ${n} rregullime.` })
    } catch (err) {
      setMsg({ type: 'error', text: err.code ? errorMessage(err) : err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card">
        <p className="muted">
          Shkruani sasinë e numëruar vetëm për artikujt që kontrolloni. Për çdo diferencë ruhet një lëvizje
          "rregullim" me arsyen më poshtë; stoku i sistemit nuk mbishkruhet.
        </p>
        <div className="filters plain-filters">
          <input className="grow" placeholder="Kërko artikullin…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="grow" placeholder="Arsyeja *" value={arsye} onChange={(e) => setArsye(e.target.value)} />
          <button className="btn primary" onClick={save} disabled={busy || !changes.length}>
            {busy ? 'Duke ruajtur…' : `Ruaj ${changes.length || ''} rregullime`}
          </button>
        </div>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      </div>
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Kodi</th><th>Artikulli</th><th className="num">Në sistem</th><th className="num">E numëruar</th><th className="num">Diferenca</th></tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const aktuale = stock[i.id] ?? 0
                const v = counts[i.id] ?? ''
                const d = v !== '' && Number.isInteger(Number(v)) ? Number(v) - aktuale : null
                return (
                  <tr key={i.id} className={aktuale < 0 ? 'row-neg' : ''}>
                    <td className="mono">{i.kodi}</td>
                    <td>{i.emri}</td>
                    <td className="num">{aktuale}</td>
                    <td className="num">
                      <input className="qty-input" type="number" step={1} value={v} onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))} />
                    </td>
                    <td className={`num ${d < 0 ? 'neg' : d > 0 ? 'pos' : ''}`}>{d ? (d > 0 ? `+${d}` : d) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/** Regjistri i lëvizjeve të stokut (të gjithë artikujt), me faqe. */
function MovementsTab() {
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])
  const [tipi, setTipi] = useState('')
  const [pages, setPages] = useState([null])
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    queryMovements({ tipi: tipi || undefined }, pages[page])
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
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipi, page])

  return (
    <>
      <div className="card filters">
        <select value={tipi} onChange={(e) => { setTipi(e.target.value); setPages([null]); setPage(0) }}>
          <option value="">Të gjitha llojet</option>
          {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="card no-pad">
        <MovementTable rows={rows} itemsById={byId} />
        <div className="pager">
          <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Para</button>
          <span className="muted small">Faqja {page + 1}</span>
          <button className="btn small" disabled={!more} onClick={() => setPage(page + 1)}>Pas ›</button>
        </div>
      </div>
    </>
  )
}

export function MovementTable({ rows, itemsById, hideItem }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Koha</th>
            {!hideItem && <th>Artikulli</th>}
            <th>Lloji</th>
            <th className="num">Sasia</th>
            <th>Dokumenti</th>
            <th>Përdoruesi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const it = itemsById?.[m.itemId]
            return (
              <tr key={m.id}>
                <td className="small">{formatDateTime(m.krijuar)}</td>
                {!hideItem && <td>{it ? <Link to={`/artikujt/${m.itemId}?skeda=stoku`}>{it.kodi} – {it.emri}</Link> : <span className="muted">{m.itemId}</span>}</td>}
                <td>{MOVEMENT_TYPES[m.tipi] ?? m.tipi}</td>
                <td className={`num ${m.sasia < 0 ? 'neg' : 'pos'}`}><b>{m.sasia > 0 ? `+${m.sasia}` : m.sasia}</b></td>
                <td className="wrap small">
                  {m.invoiceId && <Link to={`/fatura/${m.invoiceId}`}>Fatura #{m.numri}</Link>}
                  {m.purchaseId && <Link to={`/blerje/${m.purchaseId}`}>Hyrja #{m.numri}</Link>}
                  {m.arsye && <span className="muted"> {m.arsye}</span>}
                </td>
                <td className="small">{m.emri}</td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={6} className="muted">Asnjë lëvizje.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
