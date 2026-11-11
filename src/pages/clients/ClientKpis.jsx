import { useMemo } from 'react'
import { DollarSign, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchLines } from '../../services/invoiceService'
import { watchCostHistory, watchItemCosts } from '../../services/itemService'
import { aggregateLines } from '../../services/statsService'
import { monthFilter, sumClient, watchClientStats } from '../../services/aggStats'
import { canSeeCost } from '../../config/roles'
import { CURRENCIES, formatMoney } from '../../utils/money'

const sym = (c) => CURRENCIES[c]?.symbol ?? c

/**
 * Të dhënat thelbësore të klientit: faturuar në periudhë, fitimi neto dhe detyrimi global.
 * Për muaj / vite / gjithë kohës: nga statistikat e gatshme (1 lexim). Për ditë të veçanta:
 * nga rreshtat e faturave.
 */
export default function ClientKpis({ client, range, periodLabel }) {
  const { perms } = useAuth()
  const showProfit = canSeeCost(perms)
  const test = monthFilter(range)
  const { data: m } = useLive((ok, ko) => watchClientStats(client.id, ok, ko), [client.id], { enabled: !!test, initial: null })
  const { data: lines } = useLive((ok, ko) => watchLines('clientId', client.id, ok, ko), [client.id], { enabled: !test, initial: [] })
  const { data: history } = useLive(watchCostHistory, [], { enabled: showProfit && !test, initial: {} })
  const { data: current } = useLive(watchItemCosts, [], { enabled: showProfit, initial: {} })

  const st = useMemo(() => {
    if (test) {
      const s = sumClient(m, test)
      let profit = 0
      let known = true
      for (const [id, r] of Object.entries(s.items)) {
        if (current[id] == null) { known = false; continue }
        profit += r.t - r.q * current[id]
      }
      return { lek: s.t, count: s.n, profit, known, ready: m != null }
    }
    const a = aggregateLines(lines, { groupBy: 'itemId', from: range.from, to: range.to, costs: showProfit ? { history, current } : null })
    return { lek: a.totalLek, count: a.invoiceCount, profit: a.profitLek, known: a.profitKnown, ready: true }
  }, [test, m, lines, range, showProfit, history, current])

  const debts = Object.entries(client.gjendje ?? {}).filter(([, v]) => v)
  const [debtCur, debtVal] = debts.find(([c]) => c === (client.monedhaPreferuar || 'LEK')) ?? debts[0] ?? [client.monedhaPreferuar || 'LEK', 0]

  return (
    <div className="kpi-row">
      <div className="kpi kpi-white">
        <DollarSign className="kpi-icon" size={46} />
        <span>Faturuar në periudhë</span>
        <div className="kpi-value">{st.ready ? formatMoney(st.lek) : '…'} <small>L</small></div>
        <div className="kpi-sub">{periodLabel} · {st.count} fatura</div>
      </div>
      {showProfit && (
        <div className="kpi kpi-green" title="Shitja në LEK − sasia × kosto e artikullit">
          <TrendingUp className="kpi-icon" size={46} />
          <span>Fitimi neto nga ky klient</span>
          <div className="kpi-value">{st.ready ? formatMoney(st.profit) : '…'} <small>L</small></div>
          <div className="kpi-sub">{st.known ? periodLabel : `${periodLabel} · disa artikuj pa kosto`}</div>
        </div>
      )}
      <div className={`kpi kpi-dark ${debtVal < 0 ? 'credit' : ''}`}>
        <Wallet className="kpi-icon" size={46} />
        <span>{debtVal < 0 ? 'Teprica globale' : 'Detyrimi global mbetur'}</span>
        <div className="kpi-value">{formatMoney(Math.abs(debtVal))} <small>{sym(debtCur)}</small></div>
        <div className="kpi-sub">
          {debts.filter(([c]) => c !== debtCur).map(([c, v]) => <span key={c}>{v < 0 ? 'Tepricë' : '+'} {formatMoney(Math.abs(v), c)} · </span>)}
          {debtVal > 0 ? 'Klienti na detyrohet' : debtVal < 0 ? 'I detyrohemi klientit' : 'Pa detyrim'}
        </div>
      </div>
    </div>
  )
}
