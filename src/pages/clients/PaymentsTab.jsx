import { PAYMENT_METHODS } from '../../config/ledger'
import { formatMoney } from '../../utils/money'
import { formatDate, millis } from '../../utils/date'

export default function PaymentsTab({ ledger }) {
  const rows = [...ledger].sort((a, b) => millis(b.data) - millis(a.data) || millis(b.krijuar) - millis(a.krijuar))
  return (
    <div className="card no-pad">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th className="num">Shuma</th>
              <th>Mënyra</th>
              <th>Shënim</th>
              <th>Regjistroi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.data)}</td>
                <td className="num"><b>{formatMoney(-e.shuma, e.monedha)}</b></td>
                <td>{PAYMENT_METHODS[e.metoda] ?? '—'}</td>
                <td className="wrap">{e.shenim}</td>
                <td>{e.emri}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="muted">Asnjë pagesë.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
