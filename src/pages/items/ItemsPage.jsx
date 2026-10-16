import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchItems, watchItemCosts } from '../../services/itemService'
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
  const { perms } = useAuth()
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
    kodi: (i) => i.kodi,
    emri: (i) => i.emri,
    kategoria: (i) => [i.kategoria, i.nenkategoria].filter(Boolean).join(' / '),
    njesia: (i) => i.njesia,
    cmimi: (i) => i.cmimi,
    kosto: (i) => costs[i.id],
    stoku: (i) => stock[i.id] ?? 0,
    min: (i) => i.stokMinimal || null,
  }, { key: 'kodi', dir: 'asc' })
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
      {!editable && <p className="muted small">Vetëm lexim.</p>}

      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table clickable-rows">
            <thead>
              <tr>
                <SortTh s={s} k="kodi">Kodi</SortTh>
                <SortTh s={s} k="emri">Emri</SortTh>
                <SortTh s={s} k="kategoria">Kategoria</SortTh>
                <SortTh s={s} k="njesia">Njësia</SortTh>
                <SortTh s={s} k="cmimi" className="num">Çmimi i shitjes</SortTh>
                {showCost && <SortTh s={s} k="kosto" className="num">Kosto</SortTh>}
                <SortTh s={s} k="stoku" className="num">Stoku</SortTh>
                <SortTh s={s} k="min" className="num">Stok min.</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="muted">Duke u ngarkuar…</td></tr>}
              {!loading && !paged.rows.length && <tr><td colSpan={8} className="muted">Asnjë artikull.</td></tr>}
              {paged.rows.map((i) => (
                <tr key={i.id} onClick={() => navigate(`/artikujt/${i.id}`)} className={i.arkivuar ? 'archived' : ''}>
                  <td className="mono">{i.kodi}</td>
                  <td>
                    <b>{i.emri}</b>
                    {i.arkivuar && <span className="tag muted-tag">Arkivuar</span>}
                  </td>
                  <td>{[i.kategoria, i.nenkategoria].filter(Boolean).join(' / ')}</td>
                  <td>{i.njesia}</td>
                  <td className="num">{formatMoney(i.cmimi, 'LEK')}</td>
                  {showCost && <td className="num">{costs[i.id] != null ? formatMoney(costs[i.id], 'LEK') : <span className="muted">—</span>}</td>}
                  <td className={`num ${(stock[i.id] ?? 0) < 0 || (i.stokMinimal > 0 && (stock[i.id] ?? 0) < i.stokMinimal) ? 'neg' : ''}`}>{stock[i.id] ?? 0}</td>
                  <td className="num">{i.stokMinimal || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} />
      </div>

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
