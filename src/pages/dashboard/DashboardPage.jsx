import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchCashBalances } from '../../services/cashService'
import { invoiceSummary, itemSalesTotals } from '../../services/invoiceService'
import {
  cashTotals, liveTotals, monthKey, profitFrom, readCosts, readItems, readStats, refreshStats, statsStale, topItemsFrom,
} from '../../services/dashboardService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { formatMoney } from '../../utils/money'
import { periodLabel, periodRange, toDate } from '../../utils/date'
import PeriodFilter, { defaultPeriod } from '../../components/PeriodFilter'

const MONTHS = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj']

/**
 * Paneli: pasqyra përmbledhëse e biznesit, me pak lexime (shih dashboardService):
 * përmbledhjet dhe borxhi nga serveri (sum/count), statistikat e rënda nga `stats/paneli`.
 */
export default function DashboardPage() {
  const { perms } = useAuth()
  const showProfit = canSeeCost(perms)
  const canCash = perms.has('mod_financa') || perms.has('mod_raporte') || perms.has('mod_paneli')
  const [period, setPeriod] = useState(() => ({ ...defaultPeriod(), kind: 'month' }))
  const range = useMemo(() => periodRange(period), [period])
  const label = periodLabel(period)
  const isCurrentMonth = period.kind === 'month' && period.month === monthKey(new Date())

  const { data: cash } = useLive(watchCashBalances, [], { enabled: canCash, initial: { arke: {}, banke: {} } })

  const [sum, setSum] = useState(null)
  const [allSum, setAllSum] = useState(null)
  const [totals, setTotals] = useState(null)
  const [stats, setStats] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [custom, setCustom] = useState(null)
  const [cashT, setCashT] = useState(null)
  const [error, setError] = useState('')
  const catalog = useRef(null)

  useEffect(() => {
    let cancelled = false
    setSum(null)
    invoiceSummary(range).then((s) => !cancelled && setSum(s)).catch((err) => !cancelled && setError(errorMessage(err)))
    return () => { cancelled = true }
  }, [range])

  const refresh = useCallback(() => {
    setRefreshing(true)
    refreshStats(showProfit)
      .then(setStats)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setRefreshing(false))
  }, [showProfit])

  useEffect(() => {
    invoiceSummary({}).then(setAllSum).catch((err) => setError(errorMessage(err)))
    liveTotals().then(setTotals).catch((err) => setError(errorMessage(err)))
    if (canCash) cashTotals().then(setCashT).catch((err) => setError(errorMessage(err)))
    readStats(showProfit)
      .then((s) => {
        if (s.base) setStats(s)
        if (statsStale(s, showProfit)) refresh()
      })
      .catch((err) => setError(errorMessage(err)))
  }, [showProfit, refresh, canCash])

  // Periudhë tjetër nga muaji aktual: shitjet për artikull llogariten vetëm kur zgjidhet.
  useEffect(() => {
    if (isCurrentMonth) return undefined
    let cancelled = false
    setCustom(null)
    ;(async () => {
      catalog.current ??= await Promise.all([readItems(), showProfit ? readCosts() : {}])
      const [items, costs] = catalog.current
      const sales = await itemSalesTotals(items.map((i) => i.id), range)
      if (!cancelled) setCustom({ topItems: topItemsFrom(sales, items), profit: showProfit ? profitFrom(sales, costs) : null })
    })().catch((err) => !cancelled && setError(errorMessage(err)))
    return () => { cancelled = true }
  }, [isCurrentMonth, range, showProfit])

  const base = stats?.base
  const cost = stats?.cost
  const months = base?.months ?? null
  const topItems = isCurrentMonth ? base?.topItems ?? null : custom?.topItems ?? null
  const profit = isCurrentMonth ? cost?.profitMonth : custom?.profit
  const allProfit = cost?.profitAll

  const debt = totals?.debt ?? {}
  const debtors = totals?.debtors?.LEK ?? 0
  const payables = totals?.payables ?? {}
  const stockSale = base?.stockSale ?? 0
  const prevSale = base?.prevStockSale ?? 0
  const stockCost = cost?.stockCost ?? 0
  const prevCost = cost?.prevStockCost ?? 0
  const prevDebt = base?.prevDebt ?? 0

  const lek = (m) => m?.LEK ?? 0
  const extra = (m) => Object.entries(m ?? {}).filter(([c, v]) => c !== 'LEK' && v).map(([c, v]) => formatMoney(v, c)).join(' · ')
  const maxMonth = months ? Math.max(1, ...months.map((m) => m.totali)) : 1

  const pct = (a, b) => (b ? `${Math.round((a * 1000) / b) / 10}%` : '—')
  const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatMoney(Math.abs(v))}`
  const now = new Date()
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const prevLabel = prevMonthEnd.toLocaleDateString('sq-AL', { day: 'numeric', month: 'long', year: 'numeric' })
  const stockChange = stockSale - prevSale
  const debtChange = lek(debt) - prevDebt
  const itemsTotal = topItems ? topItems.reduce((a, x) => a + x.totali, 0) : 0
  const updatedAt = toDate(base?.perditesuar)

  return (
    <div className="dashboard dash2">
      <div className="page-head">
        <div>
          <h1 className="page-title">Paneli</h1>
          <div className="muted small">Pasqyra e biznesit për INTAL ALBANIA · {now.toLocaleDateString('sq-AL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="d2-refresh">
          <span className="muted small">
            {refreshing ? 'Duke rillogaritur statistikat…' : updatedAt ? `Statistikat: ${updatedAt.toLocaleString('sq-AL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          <button type="button" className="btn small" onClick={refresh} disabled={refreshing} title="Rillogarit grafikun, artikujt, stokun dhe fitimin">
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Rifresko
          </button>
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
            <b className="d2-kpi-value c-green">{allProfit == null ? '…' : formatMoney(allProfit)}</b>
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
          <b className="d2-kpi-value c-red">{totals ? formatMoney(lek(debt)) : '…'}</b>
          <div className="d2-kpi-foot">
            <span className="pill pill-red">{totals ? `${debtors} klientë` : '…'}</span>
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
              <b className="c-green">{profit == null ? '…' : `${profit >= 0 ? '+' : ''}${formatMoney(profit)}`} <small>L</small></b>
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

      <div className="d2-mini-row">
        {canCash && (
          <>
            <Mini label="Arka · të gjitha hyrjet" value={cashT ? formatMoney(cashT.hyrje) : '…'} cls="c-green" />
            <Mini label="Pagesat e kryera" value={cashT ? formatMoney(cashT.pagesa) : '…'} cls="c-red" />
            <Mini label="Neto (hyrjet − pagesat)" value={cashT ? formatMoney(cashT.neto) : '…'} sub={`Arkë ${formatMoney(lek(cash.arke))} · Bankë ${formatMoney(lek(cash.banke))}`} />
          </>
        )}
        <Mini label="Detyrime ndaj furnitorëve" value={totals ? formatMoney(lek(payables)) : '…'} />
        <Mini label="Vlera e stokut (çmim shitje)" value={base ? formatMoney(stockSale) : '…'} sub={showProfit && cost ? `Me kosto ${formatMoney(stockCost)}` : ''} />
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
              <h3>Inventari dhe borxhi</h3>
              <p>Krahasuar me {prevLabel} (fundi i muajit paraardhës)</p>
            </div>
          </div>
          <div className="d2-changes">
            <div className="d2-change">
              <span className="d2-change-label">Gjendja e inventarit</span>
              <b className="d2-change-value">{base ? formatMoney(stockSale) : '…'} <small>L</small></b>
              <small className="muted">Vlera e mallit në gjendje (çmim shitje){showProfit && cost ? ` · me kosto ${formatMoney(stockCost)} L` : ''}</small>
            </div>
            <div className="d2-change">
              <span className="d2-change-label">Ndryshimi i inventarit</span>
              {!base ? <b className="d2-change-value">…</b> : (
                <>
                  <div className="d2-change-row">
                    <b className={`d2-change-value ${stockChange >= 0 ? 'c-green' : 'c-red'}`}>{signed(stockChange)} <small>L</small></b>
                    <span className={`pill ${stockChange >= 0 ? 'pill-green' : 'pill-red'}`}>{stockChange >= 0 ? '▲' : '▼'} {pct(Math.abs(stockChange), prevSale)}</span>
                  </div>
                  <small className="muted">{formatMoney(prevSale)} → {formatMoney(stockSale)} L{showProfit && cost ? ` · me kosto ${signed(stockCost - prevCost)} L` : ''}</small>
                </>
              )}
            </div>
            <div className="d2-change">
              <span className="d2-change-label">Ndryshimi i borxhit</span>
              {!base || !totals ? <b className="d2-change-value">…</b> : (
                <>
                  <div className="d2-change-row">
                    <b className={`d2-change-value ${debtChange > 0 ? 'c-red' : 'c-green'}`}>{signed(debtChange)} <small>L</small></b>
                    <span className={`pill ${debtChange > 0 ? 'pill-red' : 'pill-green'}`}>{debtChange > 0 ? '▲' : '▼'} {pct(Math.abs(debtChange), prevDebt)}</span>
                  </div>
                  <small className="muted">{formatMoney(prevDebt)} → {formatMoney(lek(debt))} L · {debtChange > 0 ? 'borxhi u rrit' : 'borxhi u ul'}</small>
                </>
              )}
            </div>
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
            {topItems?.map(({ id, emri, njesia, totali, sasia }) => (
              <tr key={id}>
                <td><Link to={`/artikujt/${id}`}><b>{emri}</b></Link></td>
                <td className="num">{sasia} <span className="muted">{njesia}</span></td>
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

function Mini({ label, value, sub, cls = '' }) {
  return (
    <div className="d2-mini">
      <span>{label}</span>
      <b className={cls}>{value} <small>L</small></b>
      {sub && <em>{sub}</em>}
    </div>
  )
}
