import { useMemo } from 'react'
import { DollarSign, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchLines } from '../../services/invoiceService'
import { watchCostHistory, watchItemCosts } from '../../services/itemService'
import { aggregateLines } from '../../services/statsService'
import { canSeeCost } from '../../config/roles'
import { CURRENCIES, formatMoney } from '../../utils/money'

const sym = (c) => CURRENCIES[c]?.symbol ?? c

/**
 * Të dhënat thelbësore të klientit: faturuar në periudhë, fitimi neto (me koston
 * në datën e faturës) dhe detyrimi global i mbetur (gjendja aktuale).
 */
export default function ClientKpis({ client, range, periodLabel }) {
  const { perms } = useAuth()
  const showProfit = canSeeCost(perms)
  const { data: lines } = useLive((ok, ko) => watchLines('clientId', client.id, ok, ko), [client.id], { initial: [] })
  const { data: history } = useLive(watchCostHistory, [], { enabled: showProfit, initial: {} })
  const { data: current } = useLive(watchItemCosts, [], { enabled: showProfit, initial: {} })

  const st = useMemo(
    () => aggregateLines(lines, { groupBy: 'itemId', from: range.from, to: range.to, costs: showProfit ? { history, current } : null }),
    [lines, range, showProfit, history, current],
  )

  const invoiced = Object.entries(st.totals).filter(([, v]) => v)
  const [mainCur, mainVal] = invoiced.find(([c]) => c === 'LEK') ?? invoiced[0] ?? ['LEK', 0]
  const debts = Object.entries(client.gjendje ?? {}).filter(([, v]) => v)
  const [debtCur, debtVal] = debts.find(([c]) => c === (client.monedhaPreferuar || 'LEK')) ?? debts[0] ?? [client.monedhaPreferuar || 'LEK', 0]

  return (
    <div className="kpi-row">
      <div className="kpi kpi-white">
        <DollarSign className="kpi-icon" size={46} />
        <span>Faturuar në periudhë</span>
        <div className="kpi-value">{formatMoney(mainVal)} <small>{sym(mainCur)}</small></div>
        <div className="kpi-sub">
          {invoiced.filter(([c]) => c !== mainCur).map(([c, v]) => <span key={c}>+ {formatMoney(v, c)} · </span>)}
          {periodLabel} · {st.invoiceCount} fatura
        </div>
      </div>
      {showProfit && (
        <div className="kpi kpi-green" title="Shitja në LEK − sasia × kosto e artikullit në datën e faturës">
          <TrendingUp className="kpi-icon" size={46} />
          <span>Fitimi neto nga ky klient</span>
          <div className="kpi-value">{formatMoney(st.profitLek)} <small>L</small></div>
          <div className="kpi-sub">{st.profitKnown ? periodLabel : `${periodLabel} · disa artikuj pa kosto`}</div>
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
