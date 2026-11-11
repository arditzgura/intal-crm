import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchItems, watchItemCosts } from '../../services/itemService'
import { monthFilter, sumClient, watchClientStats } from '../../services/aggStats'
import { canSeeCost } from '../../config/roles'
import { formatMoney } from '../../utils/money'
import { downloadCsv } from '../../utils/csv'
import { useSort, SortTh } from '../../hooks/useSort'
import LineStats from '../../components/LineStats'

/**
 * Artikujt e blerë nga klienti: sasia, çmimi mesatar, totali, fitimi.
 * Muaj / vite / gjithë kohës nga statistikat e gatshme; ditët e veçanta nga rreshtat.
 */
export default function ClientPurchases({ client, range }) {
  const { perms } = useAuth()
  const showProfit = canSeeCost(perms)
  const test = monthFilter(range)
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showProfit && !!test, initial: {} })
  const { data: m, loading } = useLive((ok, ko) => watchClientStats(client.id, ok, ko), [client.id], { enabled: !!test, initial: null })
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])

  const rows = useMemo(() => {
    if (!test) return []
    return Object.entries(sumClient(m, test).items)
      .filter(([, r]) => r.q || r.t)
      .map(([id, r]) => ({ id, ...r, mesatar: r.q ? Math.round(r.t / r.q) : 0, fitimi: costs[id] != null ? r.t - r.q * costs[id] : null }))
  }, [test, m, costs])
  const s = useSort(rows, {
    emri: (r) => byId[r.id]?.emri ?? r.id,
    sasia: (r) => r.q,
    mesatar: (r) => r.mesatar,
    totali: (r) => r.t,
    fitimi: (r) => r.fitimi,
    fatura: (r) => r.n,
  }, { key: 'totali', dir: 'desc' })

  if (!test) {
    const names = Object.fromEntries(items.map((i) => [i.id, { label: `${i.kodi} – ${i.emri}`, sub: i.kategoria, link: `/artikujt/${i.id}` }]))
    return <LineStats mode="client" id={client.id} names={names} title={`blerjet_${client.kodi}`} range={range} hideSummary />
  }

  const label = (id) => (byId[id] ? `${byId[id].kodi} – ${byId[id].emri}` : id)
  return (
    <div className="card no-pad">
      <div className="card-toolbar wrap-toolbar">
        <span />
        <button
          className="btn small"
          onClick={() => downloadCsv(`blerjet_${client.kodi}.csv`, ['Artikulli', 'Sasia', 'Çmimi mesatar', 'Totali (LEK)', ...(showProfit ? ['Fitimi (LEK)'] : []), 'Fatura'],
            s.sorted.map((r) => [label(r.id), r.q, formatMoney(r.mesatar), formatMoney(r.t), ...(showProfit ? [r.fitimi == null ? '' : formatMoney(r.fitimi)] : []), r.n]))}
        ><Download size={14} /> CSV</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <SortTh s={s} k="emri">Artikulli</SortTh>
              <SortTh s={s} k="sasia" className="num">Sasia</SortTh>
              <SortTh s={s} k="mesatar" className="num">Çmimi mesatar</SortTh>
              <SortTh s={s} k="totali" className="num">Totali (LEK)</SortTh>
              {showProfit && <SortTh s={s} k="fitimi" className="num">Fitimi (LEK)</SortTh>}
              <SortTh s={s} k="fatura" className="num">Fatura</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="muted">Duke u ngarkuar…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={6} className="muted">Asnjë blerje në këtë periudhë.</td></tr>}
            {s.sorted.map((r) => (
              <tr key={r.id}>
                <td>
                  {byId[r.id] ? <Link to={`/artikujt/${r.id}`}>{label(r.id)}</Link> : <span className="muted">{r.id}</span>}
                  {byId[r.id]?.kategoria && <div className="small muted">{byId[r.id].kategoria}</div>}
                </td>
                <td className="num">{r.q}</td>
                <td className="num">{formatMoney(r.mesatar)}</td>
                <td className="num"><b>{formatMoney(r.t)}</b></td>
                {showProfit && <td className={`num ${r.fitimi < 0 ? 'neg' : ''}`}>{r.fitimi == null ? <span className="muted" title="Mungon kosto e artikullit">—</span> : formatMoney(r.fitimi)}</td>}
                <td className="num">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showProfit && <p className="muted small pad">Fitimi = shitja në LEK − sasia × kosto aktuale e artikullit.</p>}
    </div>
  )
}
