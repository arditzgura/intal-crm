import { Link } from 'react-router-dom'
import { useLive } from '../../hooks/useLive'
import { watchMovementsForItem } from '../../services/stockService'
import { errorMessage } from '../../services/authService'
import { formatDate } from '../../utils/date'
import { useSort, SortTh } from '../../hooks/useSort'
import { MovementTable } from '../inventory/InventoryPage'

/** Lëvizjet e stokut të një artikulli; me `onlyIn` vetëm hyrjet e mallit (blerjet). */
export default function ItemMovements({ item, onlyIn }) {
  const { data: all, loading, error } = useLive((ok, ko) => watchMovementsForItem(item.id, ok, ko), [item.id], { initial: [] })
  const rows = onlyIn ? all.filter((m) => m.tipi === 'hyrje' || m.tipi === 'anulim_hyrje') : all
  const s = useSort(rows, { data: (m) => m.data, numri: (m) => m.numri, sasia: (m) => m.sasia }, { key: 'data', dir: 'desc' })

  if (!onlyIn) {
    return (
      <div className="card no-pad">
        {error && <div className="alert error">{errorMessage(error)}</div>}
        <MovementTable rows={rows} hideItem />
      </div>
    )
  }
  const total = rows.reduce((a, m) => a + m.sasia, 0)
  return (
    <div className="ip-panel no-pad">
      <div className="ip-panel-head pad">
        <div className="ip-section-title inline">
          <b>Hyrjet e mallit</b>
          <small className="muted">{loading ? '' : `${rows.filter((m) => m.tipi === 'hyrje').length} hyrje · gjithsej ${total} ${item.njesia}`}</small>
        </div>
      </div>
      {error && <div className="alert error">{errorMessage(error)}</div>}
      <div className="table-wrap">
        <table className="table ip-table">
          <thead>
            <tr>
              <SortTh s={s} k="data">Data</SortTh>
              <SortTh s={s} k="numri">Hyrja</SortTh>
              <th>Lloji</th>
              <SortTh s={s} k="sasia" className="num">Sasia</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="muted">Duke u ngarkuar…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={4} className="muted">Asnjë hyrje për këtë artikull.</td></tr>}
            {s.sorted.map((m) => (
              <tr key={m.id}>
                <td>{formatDate(m.data)}</td>
                <td>{m.purchaseId ? <Link to={`/blerje/${m.purchaseId}`}>#{m.numri}</Link> : m.numri ?? '—'}</td>
                <td>{m.tipi === 'hyrje' ? 'Hyrje' : <span className="neg">Anulim hyrjeje</span>}</td>
                <td className={`num ${m.sasia < 0 ? 'neg' : 'pos'}`}><b>{m.sasia > 0 ? `+${m.sasia}` : m.sasia}</b> <span className="muted small">{item.njesia}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
