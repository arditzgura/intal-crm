import { useLive } from '../../hooks/useLive'
import { watchClientPoints } from '../../services/pointsService'
import { errorMessage } from '../../services/authService'
import { POINT_TYPES } from '../../config/ledger'
import { formatDateTime, millis } from '../../utils/date'

export default function PointsTab({ client, onAdjust, range }) {
  const { data: all, error } = useLive((ok, ko) => watchClientPoints(client.id, ok, ko), [client.id], { initial: [] })
  const rows = all.filter((r) => (!range?.from || millis(r.krijuar) >= range.from.getTime()) && (!range?.to || millis(r.krijuar) <= range.to.getTime()))

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
              <th>Koha</th>
              <th>Lloji</th>
              <th className="num">Pikë</th>
              <th className="num">Pas</th>
              <th>Arsyeja</th>
              <th>Nga</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
