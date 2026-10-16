import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DollarSign, TrendingUp, Wallet, Receipt, AlertCircle, Landmark, Truck, Warehouse, History, ArrowRight } from 'lucide-react'
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
  const [period, setPeriod] = useState(() => ({ ...defaultPeriod(), kind: 'month' }))
  const range = useMemo(() => periodRange(period), [period])
  const label = periodLabel(period)

  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showProfit, initial: {} })
  const { data: stock } = useLive(watchStock, [], { initial: {} })
  const { data: cash } = useLive(watchCashBalances, [], { enabled: canCash, initial: { arke: {}, banke: {} } })

  const [sum, setSum] = useState(null)
  const [profit, setProfit] = useState(null)
  const [allSum, setAllSum] = useState(null)
  const [allProfit, setAllProfit] = useState(null)
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
    invoiceSummary({}).then(setAllSum).catch((err) => setError(errorMessage(err)))
  }, [])

  // Fitimi akumuluar (gjithë kohës)
  useEffect(() => {
    if (!showProfit || !items.length || !costKey) return undefined
    let cancelled = false
    invoiceProfit({}, items.map((i) => i.id), costs).then((p) => !cancelled && setAllProfit(p)).catch(() => !cancelled && setAllProfit(undefined))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfit, itemKey, costKey])

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
          <div className="muted small">Sistemi i Menaxhimit për INTAL ALBANIA</div>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {/* Pasqyra e akumuluar: gjithmonë gjithë kohës */}
      <div className="acc-hero">
        <History className="acc-hero-bg" size={150} />
        <div className="acc-title">
          <div className="acc-title-icon"><Landmark size={24} /></div>
          <div>
            <b>Pasqyra e akumuluar</b>
            <span>Që nga fillimi i përdorimit të aplikacionit</span>
          </div>
        </div>
        <div className="acc-tiles">
          <div className="acc-tile">
            <span>Xhiro totale (LEK)</span>
            <b>{allSum ? formatMoney(lek(allSum.sales)) : '…'}</b>
            <small className="acc-green"><TrendingUp size={12} /> {allSum ? `${allSum.count.toLocaleString('sq')} fatura totale` : ''}{allSum && extra(allSum.sales) ? ` · + ${extra(allSum.sales)}` : ''}</small>
          </div>
          {showProfit && (
            <div className="acc-tile" title="Shitjet në LEK − sasia × kosto aktuale e artikujve">
              <span className="acc-green">Fitimi akumuluar (LEK)</span>
              <b className="acc-green">{allProfit == null ? '…' : allProfit === undefined ? '—' : formatMoney(allProfit)}</b>
              <small>Pas zbritjes së kostos së blerjes</small>
            </div>
          )}
          <div className="acc-tile">
            <span className="acc-yellow">Arkëtuar gjithsej (LEK)</span>
            <b className="acc-yellow">{allSum ? (allSum.receiptsError ? '—' : formatMoney(lek(allSum.receipts))) : '…'}</b>
            <small>Vlera monetare e futur në arkë</small>
          </div>
          <div className="acc-tile acc-debt">
            <span>Detyrime të mbetura</span>
            <b>{formatMoney(lek(debt))}</b>
            <small>Borxhi aktual jashtë · <Link to="/raporte?raporti=borxhet">Shiko listën <ArrowRight size={11} /></Link></small>
          </div>
        </div>
      </div>

      {/* Sipas periudhës (parazgjedhje: muaji) */}
      <div className="card period-card"><PeriodFilter period={period} setPeriod={setPeriod} /></div>

      <div className="kpi-row dash-main">
        <div className="kpi kpi-white">
          <DollarSign className="kpi-icon" size={50} />
          <span>Shitjet · {label}</span>
          <div className="kpi-value">{sum ? formatMoney(lek(sum.sales)) : '…'} <small>L</small></div>
          <div className="kpi-sub">{sum ? `${sum.count.toLocaleString('sq')} fatura` : ''}{sum && extra(sum.sales) ? ` · + ${extra(sum.sales)}` : ''}</div>
        </div>
        {showProfit && (
          <div className="kpi kpi-green" title="Shitjet në LEK − sasia × kosto aktuale e artikujve">
            <TrendingUp className="kpi-icon" size={50} />
            <span>Fitimi · {label}</span>
            <div className="kpi-value">{profit == null ? '…' : profit === undefined ? '—' : `${profit >= 0 ? '+' : ''}${formatMoney(profit)}`} <small>L</small></div>
            <div className="kpi-sub">{sum && profit != null && lek(sum.sales) ? `Marzhi ${Math.round((profit * 1000) / lek(sum.sales)) / 10}%` : ''}</div>
          </div>
        )}
        <div className="kpi kpi-white">
          <Receipt className="kpi-icon" size={50} />
          <span>Arkëtimet · {label}</span>
          <div className="kpi-value pos">{sum ? (sum.receiptsError ? '—' : formatMoney(lek(sum.receipts))) : '…'} <small>L</small></div>
          <div className="kpi-sub">Pagesat e klientëve në periudhë</div>
        </div>
        <div className="kpi kpi-white">
          <AlertCircle className="kpi-icon" size={50} />
          <span>Pa paguar · {label}</span>
          <div className="kpi-value neg">{sum ? formatMoney(lek(sum.unpaid)) : '…'} <small>L</small></div>
          <div className="kpi-sub">Borxhi i faturave të periudhës</div>
        </div>
      </div>

      <div className="dash-stats">
        {canCash && <Stat icon={Landmark} label="Arka + Banka (sot)" value={formatMoney(lek(cash.arke) + lek(cash.banke), 'LEK')} sub={`Arkë ${formatMoney(lek(cash.arke))} · Bankë ${formatMoney(lek(cash.banke))}`} />}
        <Stat icon={Wallet} label="Klientë me borxh" value={String(debtors)} cls="neg" />
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
