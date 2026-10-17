import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Landmark, Truck, Warehouse, ArrowRight } from 'lucide-react'
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

  const pct = (a, b) => (b ? `${Math.round((a * 1000) / b) / 10}%` : '—')
  const maxDebt = topDebtors[0]?.gjendje.LEK ?? 1
  const itemsTotal = topItems ? topItems.reduce((a, x) => a + x.totali, 0) : 0

  return (
    <div className="dashboard dash2">
      <div className="page-head">
        <div>
          <h1 className="page-title">Paneli</h1>
          <div className="muted small">Pasqyra e biznesit për INTAL ALBANIA · {new Date().toLocaleDateString('sq-AL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {/* Pasqyra e akumuluar: gjithmonë gjithë kohës */}
      <div className="d2-section-label">Pasqyra e akumuluar · që nga fillimi i përdorimit</div>
      <div className="d2-kpis">
        <div className="d2-kpi top-indigo">
          <span className="d2-kpi-label">Xhiro totale (LEK)</span>
          <b className="d2-kpi-value">{allSum ? formatMoney(lek(allSum.sales)) : '…'}</b>
          <div className="d2-kpi-foot">
            <span className="pill pill-indigo">{allSum ? `${allSum.count.toLocaleString('sq')} fatura` : '…'}</span>
            {allSum && extra(allSum.sales) && <span className="muted">+ {extra(allSum.sales)}</span>}
          </div>
        </div>
        {showProfit && (
          <div className="d2-kpi top-green" title="Shitjet në LEK − sasia × kosto aktuale e artikujve">
            <span className="d2-kpi-label">Fitimi akumuluar (LEK)</span>
            <b className="d2-kpi-value c-green">{allProfit == null ? '…' : allProfit === undefined ? '—' : formatMoney(allProfit)}</b>
            <div className="d2-kpi-foot">
              <span className="pill pill-green">Marzhi {allSum && allProfit != null ? pct(allProfit, lek(allSum.sales)) : '…'}</span>
              <span className="muted">pas kostos së blerjes</span>
            </div>
          </div>
        )}
        <div className="d2-kpi top-teal">
          <span className="d2-kpi-label">Arkëtuar gjithsej (LEK)</span>
          <b className="d2-kpi-value c-teal">{allSum ? (allSum.receiptsError ? '—' : formatMoney(lek(allSum.receipts))) : '…'}</b>
          <div className="d2-kpi-foot">
            <span className="pill pill-teal">{allSum && !allSum.receiptsError ? `${pct(lek(allSum.receipts), lek(allSum.sales))} e xhiros` : '…'}</span>
            <span className="muted">futur në arkë</span>
          </div>
        </div>
        <div className="d2-kpi top-red">
          <span className="d2-kpi-label">Detyrime të mbetura (LEK)</span>
          <b className="d2-kpi-value c-red">{formatMoney(lek(debt))}</b>
          <div className="d2-kpi-foot">
            <span className="pill pill-red">{debtors} klientë</span>
            <Link to="/raporte?raporti=borxhet" className="d2-link">Shiko listën <ArrowRight size={11} /></Link>
          </div>
        </div>
      </div>

      {/* Sipas periudhës (parazgjedhje: muaji) */}
      <div className="d2-panel">
        <div className="d2-panel-head">
          <div>
            <h3>Pasqyra e periudhës · {label}</h3>
            <p>Faturat e lëshuara dhe pagesat e klientëve në periudhën e zgjedhur</p>
          </div>
        </div>
        <PeriodFilter period={period} setPeriod={setPeriod} />
        <div className="d2-strip">
          <div>
            <span>Shitjet</span>
            <b>{sum ? formatMoney(lek(sum.sales)) : '…'} <small>L</small></b>
            <em>{sum ? `${sum.count.toLocaleString('sq')} fatura` : ''}{sum && extra(sum.sales) ? ` · + ${extra(sum.sales)}` : ''}</em>
          </div>
          {showProfit && (
            <div title="Shitjet në LEK − sasia × kosto aktuale e artikujve">
              <span>Fitimi</span>
              <b className="c-green">{profit == null ? '…' : profit === undefined ? '—' : `${profit >= 0 ? '+' : ''}${formatMoney(profit)}`} <small>L</small></b>
              <em>{sum && profit != null && lek(sum.sales) ? `Marzhi ${pct(profit, lek(sum.sales))}` : ''}</em>
            </div>
          )}
          <div>
            <span>Arkëtimet</span>
            <b className="c-green">{sum ? (sum.receiptsError ? '—' : formatMoney(lek(sum.receipts))) : '…'} <small>L</small></b>
            <em>Pagesat e klientëve</em>
          </div>
          <div>
            <span>Pa paguar</span>
            <b className="c-red">{sum ? formatMoney(lek(sum.unpaid)) : '…'} <small>L</small></b>
            <em>Borxhi i faturave të periudhës</em>
          </div>
        </div>
      </div>

      <div className="dash-stats">
        {canCash && <Stat icon={Landmark} label="Arka + Banka (sot)" value={formatMoney(lek(cash.arke) + lek(cash.banke), 'LEK')} sub={`Arkë ${formatMoney(lek(cash.arke))} · Bankë ${formatMoney(lek(cash.banke))}`} />}
        <Stat icon={Wallet} label="Klientë me borxh" value={String(debtors)} cls="neg" />
        <Stat icon={Truck} label="Detyrime ndaj furnitorëve" value={formatMoney(lek(payables), 'LEK')} />
        <Stat icon={Warehouse} label="Vlera e stokut (çmim shitje)" value={formatMoney(stockSale, 'LEK')} sub={showProfit ? `Me kosto: ${formatMoney(stockCost, 'LEK')}` : ''} />
      </div>

      <div className="d2-grid">
        <div className="d2-panel">
          <div className="d2-panel-head">
            <div>
              <h3>Shitjet e 12 muajve të fundit (LEK)</h3>
              <p>Vlera e faturave të lëshuara për çdo muaj, pa të anuluarat</p>
            </div>
            <div className="d2-legend">
              <span><i className="dot dot-indigo" /> Muajt e kaluar</span>
              <span><i className="dot dot-red" /> Muaji aktual</span>
            </div>
          </div>
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
          <p className="d2-note">Vlerat mbi shtylla janë në mijë Lek (k). Kaloni miun mbi shtyllë për shumën e plotë.</p>
        </div>

        <div className="d2-panel">
          <div className="d2-panel-head">
            <div>
              <h3>Klientët me borxhin më të madh</h3>
              <p>Detyrimi aktual në LEK</p>
            </div>
          </div>
          <div className="d2-meters">
            {topDebtors.map((c) => (
              <div key={c.id} className="d2-meter">
                <div className="d2-meter-top">
                  <Link to={`/kliente/${c.id}`} className="client-link">{c.emri}</Link>
                  <b className="c-red">{formatMoney(c.gjendje.LEK)}</b>
                </div>
                <div className="d2-meter-track"><div style={{ width: `${Math.max(3, (c.gjendje.LEK / maxDebt) * 100)}%` }} /></div>
                <small className="muted">{c.qyteti || '—'} · {pct(c.gjendje.LEK, lek(debt))} e borxhit total</small>
              </div>
            ))}
            {!topDebtors.length && <p className="muted">Asnjë klient me borxh.</p>}
          </div>
          <Link to="/raporte?raporti=borxhet" className="d2-link d2-foot-link">Shiko të gjitha borxhet <ArrowRight size={12} /></Link>
        </div>
      </div>

      <div className="d2-panel no-pad">
        <div className="d2-panel-head pad">
          <div>
            <h3>Artikujt më të shitur · {label}</h3>
            <p>Renditur sipas vlerës së shitjeve në LEK</p>
          </div>
        </div>
        <table className="table d2-table">
          <thead>
            <tr><th>Artikulli</th><th className="num">Sasia</th><th className="num">Shitjet (LEK)</th><th className="d2-share-col">Pjesa në top 5</th></tr>
          </thead>
          <tbody>
            {!topItems && <tr><td colSpan={4} className="muted">Duke u ngarkuar…</td></tr>}
            {topItems?.map(({ i, totali, sasia }) => (
              <tr key={i.id}>
                <td><Link to={`/artikujt/${i.id}`}><b>{i.emri}</b></Link></td>
                <td className="num">{sasia} <span className="muted">{i.njesia}</span></td>
                <td className="num"><b>{formatMoney(totali)}</b></td>
                <td className="d2-share-col">
                  <div className="d2-share"><div className="d2-meter-track indigo"><div style={{ width: `${(totali / (itemsTotal || 1)) * 100}%` }} /></div><span>{pct(totali, itemsTotal)}</span></div>
                </td>
              </tr>
            ))}
            {topItems && !topItems.length && <tr><td colSpan={4} className="muted">Asnjë shitje në këtë periudhë.</td></tr>}
          </tbody>
        </table>
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
