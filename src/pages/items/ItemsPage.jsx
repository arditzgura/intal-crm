import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { watchItems, watchItemCosts } from '../../services/itemService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { canEditItems } from '../../config/ledger'
import { formatMoney } from '../../utils/money'
import { matchesSearch } from '../../utils/text'
import Pagination, { usePaged } from '../../components/Pagination'
import ItemFormModal from './ItemFormModal'

export default function ItemsPage() {
  const { perms } = useAuth()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const showCost = canSeeCost(perms)
  const editable = canEditItems(perms)
  const { data: items, loading, error } = useLive(watchItems, [], { initial: [] })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showCost, initial: {} })
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
        .filter((i) => matchesSearch(q, i.kodi, i.emri, i.kategoria, i.nenkategoria))
        .sort((a, b) => (a.kodi || '').localeCompare(b.kodi || '', 'sq', { numeric: true })),
    [items, q, kat, nen, showArchived],
  )
  const paged = usePaged(filtered, `${q}|${kat}|${nen}|${showArchived}`)

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
                <th>Kodi</th>
                <th>Emri</th>
                <th>Kategoria</th>
                <th>Njësia</th>
                <th className="num">Çmimi i shitjes</th>
                {showCost && <th className="num">Kosto</th>}
                <th className="num">Stoku</th>
                <th className="num">Stok min.</th>
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
                  <td className="num muted" title="Stoku llogaritet nga Inventari (Faza 4)">—</td>
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
