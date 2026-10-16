import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DollarSign, TrendingUp, Wallet, Receipt, FileText, AlertCircle, Landmark, Truck, Warehouse } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchClients } from '../../services/clientService'
import { watchItems, watchItemCosts } from '../../services/itemService'
import { watchStock } from '../../services/stockService'
import { watchCashBalances } from '../../services/cashService'
import { invoiceSummary, invoiceProfit, itemSalesTotals, monthlySales } from '../../services/invoiceService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { formatMoney } from '../../utils/money'
import { periodLabel, periodRange } from '../../utils/date'
import PeriodFilter, { defaultPeriod } from '../../components/PeriodFilter'

const MONTHS = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj']

/** Paneli: pasqyra përmbledhëse e biznesit. */
export default function DashboardPage() {
  const { perms } = useAuth()
  const showProfit = canSeeCost(perms)
  const canCash = perms.has('mod_financa') || perms.has('mod_raporte') || perms.has('mod_paneli')
  const [period, setPeriod] = useState(defaultPeriod)
  const range = useMemo(() => periodRange(period), [period])
  const label = periodLabel(period)

  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showProfit, initial: {} })
  const { data: stock } = useLive(watchStock, [], { initial: {} })
  const { data: cash } = useLive(watchCashBalances, [], { enabled: canCash, initial: { arke: {}, banke: {} } })

  const [sum, setSum] = useState(null)
  const [profit, setProfit] = useState(null)
  const [itemSales, setItemSales] = useState(null)
  const [months, setMonths] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setSum(null)
    setItemSales(null)
    invoiceSummary(range).then((s) => !cancelled && setSum(s)).catch((err) => !cancelled && setError(errorMessage(err)))
    return () => { cancelled = true }
  }, [range])

  const itemKey = items.map((i) => i.id).join(',')
  useEffect(() => {
    if (!items.length) return undefined
    let cancelled = false
    setItemSales(null)
    itemSalesTotals(items.map((i) => i.id), range).then((r) => !cancelled && setItemSales(r)).catch(() => !cancelled && setItemSales({}))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, range])

  const costKey = Object.keys(costs).length
  useEffect(() => {
    if (!showProfit || !items.length || !costKey) return undefined
    let cancelled = false
    setProfit(null)
    invoiceProfit(range, items.map((i) => i.id), costs).then((p) => !cancelled && setProfit(p)).catch(() => !cancelled && setProfit(undefined))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, showProfit, itemKey, costKey])

  useEffect(() => {
    monthlySales(12).then(setMonths).catch(() => setMonths([]))
  }, [])

  // Detyrimet aktuale
  const debt = {}
  const payables = {}
  let debtors = 0
  for (const c of clients) {
    let has = false
    for (const [m, v] of Object.entries(c.gjendje ?? {})) if (v > 0) { debt[m] = (debt[m] ?? 0) + v; has = true }
    if (has) debtors += 1
    for (const [m, v] of Object.entries(c.detyrimFurnitori ?? {})) if (v > 0) payables[m] = (payables[m] ?? 0) + v
  }
  const topDebtors = clients.filter((c) => (c.gjendje?.LEK ?? 0) > 0).sort((a, b) => b.gjendje.LEK - a.gjendje.LEK).slice(0, 5)

  // Vlera e stokut
  let stockSale = 0
  let stockCost = 0
  for (const i of items.filter((x) => !x.arkivuar)) {
    const q = Math.max(0, stock[i.id] ?? 0)
    stockSale += q * (i.cmimi ?? 0)
    if (costs[i.id] != null) stockCost += q * costs[i.id]
  }
  const topItems = itemSales
    ? items.map((i) => ({ i, ...itemSales[i.id] })).filter((x) => x.totali > 0).sort((a, b) => b.totali - a.totali).slice(0, 5)
    : null

  const lek = (m) => m?.LEK ?? 0
  const extra = (m) => Object.entries(m ?? {}).filter(([c, v]) => c !== 'LEK' && v).map(([c, v]) => formatMoney(v, c)).join(' · ')
  const maxMonth = months ? Math.max(1, ...months.map((m) => m.totali)) : 1

  return (
    <div className="dashboard">
      <div className="page-head">
        <div>
          <h1 className="page-title">Paneli</h1>
          <div className="muted small">Pasqyra përmbledhëse e biznesit · {label}</div>
        </div>
      </div>

      <div className="card period-card"><PeriodFilter period={period} setPeriod={setPeriod} /></div>
      {error && <div className="alert error">{error}</div>}

      <div className="kpi-row dash-main">
        <div className="kpi kpi-white">
          <DollarSign className="kpi-icon" size={50} />
          <span>Shitjet totale</span>
          <div className="kpi-value">{sum ? formatMoney(lek(sum.sales)) : '…'} <small>L</small></div>
          <div className="kpi-sub">{sum ? `${sum.count.toLocaleString('sq')} fatura · ${label}` : label}{sum && extra(sum.sales) ? ` · + ${extra(sum.sales)}` : ''}</div>
        </div>
        {showProfit && (
          <div className="kpi kpi-green" title="Shitjet në LEK − sasia × kosto aktuale e artikujve">
            <TrendingUp className="kpi-icon" size={50} />
            <span>Fitimi total</span>
            <div className="kpi-value">{profit == null ? '…' : profit === undefined ? '—' : `${profit >= 0 ? '+' : ''}${formatMoney(profit)}`} <small>L</small></div>
            <div className="kpi-sub">{sum && profit != null && lek(sum.sales) ? `Marzhi ${Math.round((profit * 1000) / lek(sum.sales)) / 10}% · ${label}` : label}</div>
          </div>
        )}
        <div className="kpi kpi-dark kpi-pink">
          <Wallet className="kpi-icon" size={50} />
          <span>Detyrimi total</span>
          <div className="kpi-value">{formatMoney(lek(debt))} <small>L</small></div>
          <div className="kpi-sub">{debtors} klientë me borxh{extra(debt) ? ` · + ${extra(debt)}` : ''} · gjendja aktuale</div>
        </div>
      </div>

      <div className="dash-stats">
        <Stat icon={Receipt} label="Arkëtimet e periudhës" value={sum ? (sum.receiptsError ? '—' : formatMoney(lek(sum.receipts), 'LEK')) : '…'} cls="pos" />
        <Stat icon={FileText} label="Fatura të lëshuara" value={sum ? sum.count.toLocaleString('sq') : '…'} />
        <Stat icon={AlertCircle} label="Pa paguar (faturat e periudhës)" value={sum ? formatMoney(lek(sum.unpaid), 'LEK') : '…'} cls="neg" />
        {canCash && <Stat icon={Landmark} label="Arka + Banka" value={formatMoney(lek(cash.arke) + lek(cash.banke), 'LEK')} sub={`Arkë ${formatMoney(lek(cash.arke))} · Bankë ${formatMoney(lek(cash.banke))}`} />}
        <Stat icon={Truck} label="Detyrime ndaj furnitorëve" value={formatMoney(lek(payables), 'LEK')} />
        <Stat icon={Warehouse} label="Vlera e stokut (çmim shitje)" value={formatMoney(stockSale, 'LEK')} sub={showProfit ? `Me kosto: ${formatMoney(stockCost, 'LEK')}` : ''} />
      </div>

      <div className="card">
        <h3>Shitjet e 12 muajve të fundit (LEK)</h3>
        {!months ? <p className="muted">Duke u ngarkuar…</p> : (
          <div className="bar-chart">
            {months.map((m) => {
              const [y, mm] = m.key.split('-').map(Number)
              return (
                <div key={m.key} className="bar-col" title={`${MONTHS[mm - 1]} ${y}: ${formatMoney(m.totali, 'LEK')} · ${m.fatura} fatura`}>
                  <div className="bar-value">{m.totali ? `${formatMoney(Math.round(m.totali / 100000) * 100)}k` : ''}</div>
                  <div className="bar" style={{ height: `${Math.max(2, (m.totali / maxMonth) * 100)}%` }} />
                  <div className="bar-label">{MONTHS[mm - 1]}<br /><small>{String(y).slice(2)}</small></div>
                </div>
              )
            })}
          </div>
        )}
        <p className="muted small">Vlerat mbi shtylla janë në mijë Lek (k). Kaloni miun mbi shtyllë për shumën e plotë.</p>
      </div>

      <div className="dash-lists">
        <div className="card no-pad">
          <h3 className="pad">Klientët me borxhin më të madh</h3>
          <table className="table">
            <tbody>
              {topDebtors.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/kliente/${c.id}`} className="client-link">{c.emri}</Link><div className="small muted">{c.qyteti}</div></td>
                  <td className="num neg"><b>{formatMoney(c.gjendje.LEK, 'LEK')}</b></td>
                </tr>
              ))}
              {!topDebtors.length && <tr><td className="muted">Asnjë klient me borxh.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card no-pad">
          <h3 className="pad">Artikujt më të shitur · {label}</h3>
          <table className="table">
            <tbody>
              {!topItems && <tr><td className="muted">Duke u ngarkuar…</td></tr>}
              {topItems?.map(({ i, totali, sasia }) => (
                <tr key={i.id}>
                  <td><Link to={`/artikujt/${i.id}`}><b>{i.emri}</b></Link><div className="small muted">{sasia} {i.njesia}</div></td>
                  <td className="num"><b>{formatMoney(totali, 'LEK')}</b></td>
                </tr>
              ))}
              {topItems && !topItems.length && <tr><td className="muted">Asnjë shitje në këtë periudhë.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub, cls = '' }) {
  return (
    <div className="dash-stat">
      <Icon size={20} className="dash-stat-icon" />
      <div>
        <div className="dash-stat-label">{label}</div>
        <div className={`dash-stat-value ${cls}`}>{value}</div>
        {sub && <div className="small muted">{sub}</div>}
      </div>
    </div>
  )
}
