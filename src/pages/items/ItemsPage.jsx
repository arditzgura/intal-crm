import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, ArchiveRestore, AlertTriangle, ShoppingCart, Layers } from 'lucide-react'
import PeriodFilter, { defaultPeriod } from '../../components/PeriodFilter'
import { periodLabel, periodRange } from '../../utils/date'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchItems, watchItemCosts, setItemArchived } from '../../services/itemService'
import { itemSalesTotals } from '../../services/invoiceService'
import { cachedItemSales, itemStatsStale, readItemStats, refreshItemStats } from '../../services/dashboardService'
import { toDate } from '../../utils/date'
import { watchStock } from '../../services/stockService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { canEditItems } from '../../config/ledger'
import { formatMoney } from '../../utils/money'
import { matchesSearch } from '../../utils/text'
import Pagination, { usePaged } from '../../components/Pagination'
import { useSort, SortTh } from '../../hooks/useSort'
import ItemFormModal from './ItemFormModal'

export default function ItemsPage() {
  const { perms, profile } = useAuth()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const showCost = canSeeCost(perms)
  const editable = canEditItems(perms)
  const { data: items, loading, error } = useLive(watchItems, [], { initial: [] })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showCost, initial: {} })
  const { data: stock } = useLive(watchStock, [], { initial: {} })
  const [q, setQ] = useState('')
  const [kat, setKat] = useState('')
  const [nen, setNen] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [sales, setSales] = useState(null)
  const [period, setPeriod] = useState(defaultPeriod)
  const range = useMemo(() => periodRange(period), [period])
  const [actionError, setActionError] = useState('')

  // Shitjet e çdo artikulli: "Gjithë kohës" dhe muaji aktual nga statistikat e ruajtura
  // (rillogariten pas 6 orësh ose me "Rifresko"); periudhat e tjera nga serveri kur zgjidhen.
  const itemKey = items.map((i) => i.id).join(',')
  const [stats, setStats] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  async function refresh() {
    if (!items.length) return
    setRefreshing(true)
    try {
      setStats(await refreshItemStats(items.map((i) => i.id)))
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }
  useEffect(() => {
    if (!items.length) return undefined
    let cancelled = false
    readItemStats().then((st) => {
      if (cancelled) return
      if (st) setStats(st)
      if (itemStatsStale(st)) refresh()
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey])
  useEffect(() => {
    if (!items.length) return undefined
    const cached = cachedItemSales(stats, range)
    if (cached) { setSales(cached); return undefined }
    if (!range.from && !range.to) return undefined // pret statistikat
    let cancelled = false
    setSales(null)
    itemSalesTotals(items.map((i) => i.id), range).then((r) => !cancelled && setSales(r)).catch(() => !cancelled && setSales({}))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, range, stats])
  const unitsSold = sales ? Object.values(sales).reduce((a, x) => a + (x.sasia ?? 0), 0) : null
  const activeCount = items.filter((i) => !i.arkivuar).length
  const profitOf = (i) => (sales?.[i.id] && costs[i.id] != null ? sales[i.id].totali - sales[i.id].sasia * costs[i.id] : null)
  const totalProfit = sales ? items.reduce((a, i) => a + (profitOf(i) ?? 0), 0) : null

  async function toggleArchive(i) {
    const msg = i.arkivuar
      ? `Të rikthehet artikulli "${i.emri}"?`
      : `Të fshihet (arkivohet) artikulli "${i.emri}"?\n\nArtikujt me fatura nuk fshihen fizikisht: zhduken nga lista dhe nga fatura e re, dhe mund të rikthehen nga "Të arkivuarit".`
    if (!window.confirm(msg)) return
    setActionError('')
    try {
      await setItemArchived(i.id, !i.arkivuar, profile?.emri)
    } catch (err) {
      setActionError(errorMessage(err))
    }
  }

  const categories = settings.kategorite.artikuj
  const subcats = categories.find((c) => c.emri === kat)?.nen ?? []

  const filtered = useMemo(
    () =>
      items
        .filter((i) => showArchived || !i.arkivuar)
        .filter((i) => !kat || i.kategoria === kat)
        .filter((i) => !nen || i.nenkategoria === nen)
        .filter((i) => matchesSearch(q, i.kodi, i.emri, i.kategoria, i.nenkategoria)),
    [items, q, kat, nen, showArchived],
  )
  const s = useSort(filtered, {
    emri: (i) => i.emri,
    cmimi: (i) => i.cmimi,
    stoku: (i) => stock[i.id] ?? 0,
    sasia: (i) => sales?.[i.id]?.sasia ?? null,
    shitjet: (i) => sales?.[i.id]?.totali ?? null,
    fitimi: (i) => profitOf(i),
  }, { key: 'emri', dir: 'asc' })
  const paged = usePaged(s.sorted, `${q}|${kat}|${nen}|${showArchived}|${s.sort?.key}|${s.sort?.dir}`)

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Artikujt</h1>
        {editable && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Artikull i ri
          </button>
        )}
      </div>

      <div className="kpi-row items-kpis">
        <div className="kpi kpi-dark kpi-pink">
          <ShoppingCart className="kpi-icon" size={50} />
          <span>Njësi të shitura ({periodLabel(period)})</span>
          <div className="kpi-value">{unitsSold == null ? '…' : formatMoney(unitsSold * 100)} <small>njësi</small></div>
        </div>
        <div className="kpi kpi-white">
          <Layers className="kpi-icon" size={50} />
          <span>Numri i artikujve (zëra)</span>
          <div className="kpi-value">{activeCount} <small>artikuj unikë</small></div>
        </div>
      </div>

      <div className="card period-card">
        <PeriodFilter period={period} setPeriod={setPeriod} />
        <div className="stats-refresh muted small">
          {refreshing ? 'Duke rillogaritur shitjet…' : stats ? `Shitjet (gjithë kohës / muaji): ${toDate(stats.perditesuar)?.toLocaleString('sq-AL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
          <button type="button" className="btn small" onClick={refresh} disabled={refreshing}>Rifresko</button>
        </div>
      </div>

      <div className="card filters">
        <input className="grow" placeholder="Kërko me kod ose emër…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kat} onChange={(e) => { setKat(e.target.value); setNen('') }}>
          <option value="">Të gjitha kategoritë</option>
          {categories.map((c) => <option key={c.emri} value={c.emri}>{c.emri}</option>)}
        </select>
        <select value={nen} onChange={(e) => setNen(e.target.value)} disabled={!subcats.length}>
          <option value="">Të gjitha nënkategoritë</option>
          {subcats.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Të arkivuarit
        </label>
      </div>

      {error && <div className="alert error">{errorMessage(error)}</div>}
      {actionError && <div className="alert error">{actionError}</div>}
      {!editable && <p className="muted small">Vetëm lexim.</p>}

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table clickable-rows items-table">
            <thead>
              <tr>
                <SortTh s={s} k="emri">Artikulli</SortTh>
                <SortTh s={s} k="cmimi" className="num">Çmimi</SortTh>
                <SortTh s={s} k="stoku" className="num">Gjendja (stoku)</SortTh>
                <SortTh s={s} k="sasia" className="num">Shitjet (totale)</SortTh>
                <SortTh s={s} k="shitjet" className="num">Vlera e shitjeve</SortTh>
                {showCost && (
                  <SortTh s={s} k="fitimi" className="num" title="Shitjet në LEK − sasia × kosto aktuale">
                    <span className="th-stack">Fitimi{totalProfit != null && <b className={totalProfit < 0 ? 'neg' : 'pos'}>{totalProfit >= 0 ? '+' : ''}{formatMoney(totalProfit, 'LEK')}</b>}</span>
                  </SortTh>
                )}
                <th className="num">Veprime</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !paged.rows.length && <tr><td colSpan={7} className="muted">Asnjë artikull.</td></tr>}
              {paged.rows.map((i) => {
                const q = stock[i.id] ?? 0
                const low = q < 0 || (i.stokMinimal > 0 && q < i.stokMinimal)
                const sale = sales?.[i.id]
                const profit = profitOf(i)
                return (
                  <tr key={i.id} onClick={() => navigate(`/artikujt/${i.id}`)} className={i.arkivuar ? 'archived' : ''}>
                    <td>
                      <b className="item-name">{i.emri}</b>
                      {i.arkivuar && <span className="tag muted-tag">Arkivuar</span>}
                      <div className="small muted">{[i.kodi, i.kategoria, i.nenkategoria].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="num"><b>{formatMoney(i.cmimi)}</b> <span className="muted small">L</span></td>
                    <td className={`num ${low ? 'neg' : ''}`}>
                      <b>{q}</b> <span className="muted small">{i.njesia}</span>
                      {low && <AlertTriangle size={13} className="warn-icon" />}
                    </td>
                    <td className="num">
                      {sales == null ? <span className="muted">…</span> : <><b>{sale?.sasia ?? 0}</b> <span className="muted small">{i.njesia}</span></>}
                    </td>
                    <td className="num">
                      {sales == null ? <span className="muted">…</span> : <><b>{formatMoney(sale?.totali ?? 0)}</b> <span className="muted small">L</span></>}
                    </td>
                    {showCost && (
                      <td className={`num ${profit < 0 ? 'neg' : 'pos'}`}>
                        {sales == null ? <span className="muted">…</span> : profit == null ? <span className="muted" title="Pa kosto">—</span> : <b>{profit >= 0 ? '+' : ''}{formatMoney(profit)}</b>}
                      </td>
                    )}
                    <td className="num actions-cell" onClick={(e) => e.stopPropagation()}>
                      {editable && <button className="icon-btn" title="Ndrysho" onClick={() => setEditing(i)}><Pencil size={17} /></button>}
                      {editable && (
                        <button className={`icon-btn ${i.arkivuar ? '' : 'danger-text'}`} title={i.arkivuar ? 'Rikthe' : 'Fshi (arkivo)'} onClick={() => toggleArchive(i)}>
                          {i.arkivuar ? <ArchiveRestore size={17} /> : <Trash2 size={17} />}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} />
      </div>

      {editing && (
        <ItemFormModal item={editing} cost={costs[editing.id]} showCost={showCost} onClose={() => setEditing(null)} />
      )}
      {creating && (
        <ItemFormModal
          showCost={showCost}
          onClose={() => setCreating(false)}
          onSaved={(id) => navigate(`/artikujt/${id}`)}
        />
      )}
    </div>
  )
}
