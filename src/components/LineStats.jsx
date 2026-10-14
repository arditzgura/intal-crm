import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { watchLines } from '../services/invoiceService'
import { watchCostHistory, watchItemCosts } from '../services/itemService'
import { aggregateLines } from '../services/statsService'
import { errorMessage } from '../services/authService'
import { canSeeCost } from '../config/roles'
import { formatMoney } from '../utils/money'
import { endOfDay, formatDate, startOfDay } from '../utils/date'
import { downloadCsv } from '../utils/csv'

/**
 * Statistikat e shitjeve nga rreshtat e faturave.
 *  mode 'client': artikujt që ka blerë klienti (field = clientId, group = itemId)
 *  mode 'item':   klientët që e kanë blerë artikullin (field = itemId, group = clientId)
 * `names`: { id: { label, sub, link } } për kolonën e parë.
 */
export default function LineStats({ mode, id, names, title }) {
  const { perms } = useAuth()
  const showProfit = canSeeCost(perms)
  const field = mode === 'client' ? 'clientId' : 'itemId'
  const groupBy = mode === 'client' ? 'itemId' : 'clientId'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: lines, loading, error } = useLive((ok, ko) => watchLines(field, id, ok, ko), [field, id], { initial: [] })
  const { data: history } = useLive(watchCostHistory, [], { enabled: showProfit, initial: {} })
  const { data: current } = useLive(watchItemCosts, [], { enabled: showProfit, initial: {} })

  const st = useMemo(
    () =>
      aggregateLines(lines, {
        groupBy,
        from: from ? startOfDay(from) : null,
        to: to ? endOfDay(to) : null,
        costs: showProfit ? { history, current } : null,
      }),
    [lines, groupBy, from, to, showProfit, history, current],
  )

  function exportCsv() {
    downloadCsv(
      `${title.replace(/\s+/g, '_')}.csv`,
      [mode === 'client' ? 'Artikulli' : 'Klienti', 'Monedha', 'Sasia', 'Çmimi mesatar', 'Totali', 'Totali (LEK)', ...(showProfit ? ['Fitimi (LEK)'] : []), 'Fatura', 'E fundit'],
      st.rows.map((r) => [
        names[r.key]?.label ?? r.key,
        r.monedha,
        r.sasia,
        formatMoney(r.cmimiMesatar),
        formatMoney(r.totali),
        formatMoney(r.totalLek),
        ...(showProfit ? [r.fitimiIPlote ? formatMoney(r.fitimi) : ''] : []),
        r.fatura,
        formatDate(r.eFundit),
      ]),
    )
  }

  return (
    <div className="card no-pad">
      <div className="card-toolbar wrap-toolbar">
        <div className="stat-chips">
          <div className="stat-chip">
            <span>Blerjet totale</span>
            <b>{Object.keys(st.totals).length ? Object.entries(st.totals).map(([c, v]) => formatMoney(v, c)).join(' · ') : '—'}</b>
          </div>
          {Object.keys(st.totals).some((c) => c !== 'LEK') && (
            <div className="stat-chip"><span>Në LEK</span><b>{formatMoney(st.totalLek, 'LEK')}</b></div>
          )}
          {showProfit && (
            <div className="stat-chip">
              <span>Fitimi bruto</span>
              <b className={st.profitLek < 0 ? 'neg' : 'pos'}>{formatMoney(st.profitLek, 'LEK')}{!st.profitKnown && ' *'}</b>
            </div>
          )}
          <div className="stat-chip"><span>Fatura</span><b>{st.invoiceCount}</b></div>
        </div>
        <div className="filters-inline">
          <label className="inline-field">Nga <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline-field">Deri <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn small" onClick={exportCsv}><Download size={14} /> CSV</button>
        </div>
      </div>
      {error && <div className="alert error">{errorMessage(error)}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{mode === 'client' ? 'Artikulli' : 'Klienti'}</th>
              <th className="num">Sasia</th>
              <th className="num">Çmimi mesatar</th>
              <th className="num">Totali</th>
              {showProfit && <th className="num">Fitimi (LEK)</th>}
              <th className="num">Fatura</th>
              <th>E fundit</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="muted">Duke u ngarkuar…</td></tr>}
            {!loading && !st.rows.length && <tr><td colSpan={7} className="muted">Asnjë shitje{from || to ? ' në këtë periudhë' : ''}.</td></tr>}
            {st.rows.map((r) => {
              const n = names[r.key]
              return (
                <tr key={`${r.key}|${r.monedha}`}>
                  <td>
                    {n?.link ? <Link to={n.link}>{n.label}</Link> : (n?.label ?? <span className="muted">{r.key}</span>)}
                    {n?.sub && <div className="small muted">{n.sub}</div>}
                  </td>
                  <td className="num">{r.sasia}</td>
                  <td className="num">{formatMoney(r.cmimiMesatar, r.monedha)}</td>
                  <td className="num"><b>{formatMoney(r.totali, r.monedha)}</b></td>
                  {showProfit && (
                    <td className={`num ${r.fitimi < 0 ? 'neg' : ''}`}>{r.fitimiIPlote ? formatMoney(r.fitimi) : <span className="muted" title="Mungon kosto e artikullit">—</span>}</td>
                  )}
                  <td className="num">{r.fatura}</td>
                  <td>{formatDate(r.eFundit)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {showProfit && !st.profitKnown && (
        <p className="muted small pad">* Disa artikuj nuk kanë kosto; fitimi i tyre nuk përfshihet.</p>
      )}
      {showProfit && <p className="muted small pad">Fitimi = shitja në LEK − sasia × kosto e artikullit në datën e faturës.</p>}
    </div>
  )
}
