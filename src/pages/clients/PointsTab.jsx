import { useLive } from '../../hooks/useLive'
import { watchClientPoints } from '../../services/pointsService'
import { errorMessage } from '../../services/authService'
import { POINT_TYPES } from '../../config/ledger'
import { formatDateTime, millis } from '../../utils/date'
import { useSort, SortTh } from '../../hooks/useSort'

export default function PointsTab({ client, onAdjust, range }) {
  const { data: all, error } = useLive((ok, ko) => watchClientPoints(client.id, ok, ko), [client.id], { initial: [] })
  const rows = all.filter((r) => (!range?.from || millis(r.krijuar) >= range.from.getTime()) && (!range?.to || millis(r.krijuar) <= range.to.getTime()))

  const s = useSort(rows, { koha: (r) => r.krijuar, lloji: (r) => POINT_TYPES[r.tipi] ?? r.tipi, pike: (r) => r.pike, pas: (r) => r.piketPas, arsye: (r) => r.arsye, nga: (r) => r.emri })

  if (client.rastesor) return <div className="card muted">Klienti Rastësor nuk mbledh pikë.</div>

  return (
    <div className="card no-pad">
      <div className="card-toolbar">
        <div>Pikët aktuale: <b className="big-number">{client.piket ?? 0}</b></div>
        {onAdjust && <button className="btn" onClick={onAdjust}>Rregullim pikësh</button>}
      </div>
      {error && <div className="alert error">{errorMessage(error)}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <SortTh s={s} k="koha">Koha</SortTh>
              <SortTh s={s} k="lloji">Lloji</SortTh>
              <SortTh s={s} k="pike" className="num">Pikë</SortTh>
              <SortTh s={s} k="pas" className="num">Pas</SortTh>
              <SortTh s={s} k="arsye">Arsyeja</SortTh>
              <SortTh s={s} k="nga">Nga</SortTh>
            </tr>
          </thead>
          <tbody>
            {s.sorted.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.krijuar)}</td>
                <td>{POINT_TYPES[r.tipi] ?? r.tipi}</td>
                <td className={`num ${r.pike > 0 ? 'pos' : 'neg'}`}>{r.pike > 0 ? `+${r.pike}` : r.pike}</td>
                <td className="num">{r.piketPas}</td>
                <td className="wrap">{r.arsye}</td>
                <td>{r.emri}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">Asnjë lëvizje pikësh.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small pad">Nga Faza 3, pikët shtohen automatikisht kur një faturë bëhet "E paguar".</p>
    </div>
  )
}
