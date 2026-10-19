import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Archive, ArchiveRestore, Package, Tag, BarChart3, TrendingUp, History, X, MapPin } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { watchItem, watchItemCost, watchItemCostHistory, setItemArchived } from '../../services/itemService'
import { watchLines } from '../../services/invoiceService'
import { clientsByIds } from '../../services/clientService'
import { aggregateLines } from '../../services/statsService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { canEditItems } from '../../config/ledger'
import { formatMoney } from '../../utils/money'
import { millis, periodLabel, periodRange } from '../../utils/date'
import { useSort, SortTh } from '../../hooks/useSort'
import PeriodFilter, { defaultPeriod } from '../../components/PeriodFilter'
import ItemFormModal from './ItemFormModal'
import ItemPricesSection from './ItemPricesSection'
import ItemMovements from './ItemMovements'
import { companyDoc } from '../../services/paths'
import { onSnapshot } from 'firebase/firestore'

const MONTHS = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj']

const TABS = [
  ['shitjet', 'Shitjet'],
  ['hyrjet', 'Hyrjet'],
  ['cmimet', 'Çmimet preferenciale'],
  ['stoku', 'Lëvizjet e stokut'],
]

/** Profili analitik i artikullit: shitjet sipas periudhës, grafiku dhe renditja e klientëve. */
export default function ItemProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perms, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('skeda') ?? 'shitjet'
  const [editing, setEditing] = useState(false)
  const [period, setPeriod] = useState(() => ({ ...defaultPeriod(), kind: 'year' }))
  const range = useMemo(() => periodRange(period), [period])
  const showCost = canSeeCost(perms)
  const editable = canEditItems(perms)

  const { data: item, loading, error } = useLive((ok, ko) => watchItem(id, ok, ko), [id])
  const { data: cost } = useLive((ok, ko) => watchItemCost(id, ok, ko), [id], { enabled: showCost })
  const { data: history } = useLive((ok, ko) => watchItemCostHistory(id, ok, ko), [id], { enabled: showCost, initial: {} })
  const { data: stockQty } = useLive(
    (ok, ko) => onSnapshot(companyDoc('stock', id), (s) => ok(s.exists() ? s.data().sasia ?? 0 : 0), ko),
    [id], { initial: 0 },
  )
  const { data: lines, loading: linesLoading, error: linesError } = useLive((ok, ko) => watchLines('itemId', id, ok, ko), [id], { initial: [] })

  const st = useMemo(
    () => aggregateLines(lines, { groupBy: 'clientId', from: range.from, to: range.to, costs: showCost ? { history, current: { [id]: cost } } : null }),
    [lines, range, showCost, history, cost, id],
  )
  const qty = st.rows.reduce((a, r) => a + r.sasia, 0)

  // Emrat vetëm për klientët që e kanë blerë artikullin
  const [names, setNames] = useState({})
  const clientKey = [...new Set(lines.map((l) => l.clientId))].sort().join(',')
  useEffect(() => {
    if (!clientKey) return
    clientsByIds(clientKey.split(',')).then(setNames).catch(() => {})
  }, [clientKey])

  const s = useSort(st.rows, {
    emri: (r) => names[r.key]?.emri ?? r.key,
    sasia: (r) => r.sasia,
    fatura: (r) => r.fatura,
    mesatar: (r) => r.cmimiMesatar,
    xhiro: (r) => r.totalLek,
    fitimi: (r) => (r.fitimiIPlote ? r.fitimi : null),
  }, { key: 'sasia', dir: 'desc' })

  if (loading) return <div className="card muted">Duke u ngarkuar…</div>
  if (error) return <div className="alert error">{errorMessage(error)}</div>
  if (!item) return <div className="card">Artikulli nuk u gjet. <Link to="/artikujt">Kthehu te lista</Link></div>

  async function toggleArchive() {
    const msg = item.arkivuar ? 'Të riaktivizohet artikulli?' : 'Të arkivohet artikulli? Nuk fshihet; thjesht nuk shfaqet më te lista.'
    if (!window.confirm(msg)) return
    try {
      await setItemArchived(item.id, !item.arkivuar, profile?.emri)
    } catch (err) {
      window.alert(err.code ? errorMessage(err) : err.message)
    }
  }

  const label = periodLabel(period)
  const low = stockQty < 0 || (item.stokMinimal > 0 && stockQty < item.stokMinimal)

  return (
    <div className="ip">
      <div className="ip-head">
        <button type="button" className="ip-back" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Mbrapa</button>
        <div className="ip-icon"><Package size={22} /></div>
        <div className="ip-title">
          <h1>{item.emri} {item.arkivuar && <span className="tag muted-tag">Arkivuar</span>}</h1>
          <div className="ip-meta">
            <span><Tag size={12} /> {item.njesia}</span>
            <span>Standard: {formatMoney(item.cmimi)} L</span>
            <span className="mono">{item.kodi}</span>
            <span className={low ? 'neg' : ''}>Stoku: {stockQty} {item.njesia}</span>
            {showCost && <span>Kosto: {cost != null ? `${formatMoney(cost)} L` : '—'}</span>}
          </div>
        </div>
        <div className="ip-tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" className={tab === k ? 'active' : ''} onClick={() => setParams({ skeda: k })}>{l}</button>
          ))}
        </div>
        <div className="ip-actions">
          {editable && <button type="button" className="icon-btn" title="Ndrysho" onClick={() => setEditing(true)}><Pencil size={17} /></button>}
          {editable && (
            <button type="button" className="icon-btn" title={item.arkivuar ? 'Riaktivizo' : 'Arkivo'} onClick={toggleArchive}>
              {item.arkivuar ? <ArchiveRestore size={17} /> : <Archive size={17} />}
            </button>
          )}
          <button type="button" className="icon-btn" title="Mbyll" onClick={() => navigate('/artikujt')}><X size={20} /></button>
        </div>
      </div>

      {tab === 'shitjet' && (
        <>
          <div className="ip-period card"><PeriodFilter period={period} setPeriod={setPeriod} /></div>

          <div className="ip-section-title">
            <div className="ip-badge"><BarChart3 size={16} /></div>
            <b>Analiza e performancës: {label}</b>
          </div>
          {linesError && <div className="alert error">{errorMessage(linesError)}</div>}

          <div className="ip-kpis">
            <div className="ip-kpi">
              <span>Vëllimi i shitjeve (periudha)</span>
              <b>{linesLoading ? '…' : qty.toLocaleString('sq')} <small>{item.njesia}</small></b>
            </div>
            <div className="ip-kpi">
              <span>Numri i shitjeve (transaksione)</span>
              <b>{linesLoading ? '…' : st.invoiceCount.toLocaleString('sq')} <small>fatura</small></b>
            </div>
            <div className="ip-kpi ip-dark">
              <span>Qarkullimi monetar (LEK)</span>
              <b>{linesLoading ? '…' : formatMoney(st.totalLek)}</b>
            </div>
            {showCost && (
              <div className="ip-kpi ip-green" title="Shitja në LEK − sasia × kosto në datën e faturës">
                <span>Fitimi neto i gjeneruar</span>
                <b>{linesLoading ? '…' : formatMoney(st.profitLek)} <small>L</small></b>
                {!linesLoading && !st.profitKnown && <em>* disa shitje pa kosto</em>}
              </div>
            )}
          </div>

          <div className="ip-panel">
            <div className="ip-panel-head">
              <div className="ip-section-title inline">
                <div className="ip-badge"><TrendingUp size={16} /></div>
                <div>
                  <b>Shitjet sipas periudhës</b>
                  <small>Sasia e shitur · {label}</small>
                </div>
              </div>
              <div className="ip-legend">
                <span><i className="sq" /> {item.njesia} (sasia)</span>
                <span><i className="ln" /> Trendi</span>
              </div>
            </div>
            <QtyChart lines={lines} period={period} range={range} />
          </div>

          <div className="ip-panel no-pad">
            <div className="ip-panel-head pad">
              <div className="ip-section-title inline">
                <History size={16} className="muted" />
                <b>Renditja e klientëve për këtë artikull</b>
              </div>
              <span className="muted small">Kliko kolonën për të renditur</span>
            </div>
            <div className="table-wrap">
              <table className="table ip-table">
                <thead>
                  <tr>
                    <SortTh s={s} k="emri">Klienti</SortTh>
                    <SortTh s={s} k="sasia" className="num">Sasia</SortTh>
                    <SortTh s={s} k="fatura" className="num">Nr. fat.</SortTh>
                    <SortTh s={s} k="mesatar" className="num">Çmimi mes.</SortTh>
                    <SortTh s={s} k="xhiro" className="num">Xhiro (LEK)</SortTh>
                    {showCost && <SortTh s={s} k="fitimi" className="num">Fitimi neto</SortTh>}
                  </tr>
                </thead>
                <tbody>
                  {linesLoading && <tr><td colSpan={6} className="muted">Duke u ngarkuar…</td></tr>}
                  {!linesLoading && !st.rows.length && <tr><td colSpan={6} className="muted">Asnjë shitje në këtë periudhë.</td></tr>}
                  {s.sorted.map((r) => {
                    const n = names[r.key]
                    return (
                      <tr key={`${r.key}|${r.monedha}`}>
                        <td>
                          <Link to={`/kliente/${r.key}`} className="client-link">{n?.emri ?? '…'}</Link>
                          {n?.qyteti && <div className="ip-city"><MapPin size={10} /> {n.qyteti}</div>}
                        </td>
                        <td className="num">{r.sasia} <span className="muted small">{item.njesia}</span></td>
                        <td className="num"><span className="ip-pill">{r.fatura} fat</span></td>
                        <td className="num muted">{formatMoney(r.cmimiMesatar, r.monedha)}</td>
                        <td className="num"><b>{formatMoney(r.totalLek)} L</b></td>
                        {showCost && (
                          <td className={`num ${r.fitimi < 0 ? 'neg' : 'pos'}`}>
                            {r.fitimiIPlote ? <b>{r.fitimi >= 0 ? '+' : ''}{formatMoney(r.fitimi)} L</b> : <span className="muted" title="Mungon kosto">—</span>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'hyrjet' && <ItemMovements item={item} onlyIn />}
      {tab === 'stoku' && <ItemMovements item={item} />}

      {tab === 'cmimet' && (
        <>
          <p className="muted small">
            Te Fatura e Re, çmimi merret automatikisht: 1) çmimi preferencial i klientit, 2) përndryshe
            çmimi standard ({formatMoney(item.cmimi, 'LEK')}).
          </p>
          <ItemPricesSection item={item} readOnly={!editable} />
        </>
      )}

      {editing && (
        <ItemFormModal item={item} cost={cost ?? undefined} showCost={showCost} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

/** Grupimi i grafikut: viti → muaj, muaji → ditë, gjithë kohës → vite (ose muaj nëse ka pak). */
function buckets(lines, period, range) {
  const valid = lines.filter((l) => !l.anuluar && (!range.from || millis(l.data) >= range.from.getTime()) && (!range.to || millis(l.data) <= range.to.getTime()))
  const map = new Map()
  const add = (k, q) => map.set(k, (map.get(k) ?? 0) + q)
  if (period.kind === 'year') {
    const y = Number(period.year)
    const now = new Date()
    const last = y === now.getFullYear() ? now.getMonth() : 11
    for (let m = 0; m <= last; m++) map.set(m, 0)
    for (const l of valid) add(new Date(millis(l.data)).getMonth(), l.sasia)
    return [...map.entries()].map(([m, q]) => ({ label: MONTHS[m], q }))
  }
  if (period.kind === 'month') {
    const [y, m] = period.month.split('-').map(Number)
    const days = new Date(y, m, 0).getDate()
    for (let d = 1; d <= days; d++) map.set(d, 0)
    for (const l of valid) add(new Date(millis(l.data)).getDate(), l.sasia)
    return [...map.entries()].map(([d, q]) => ({ label: String(d), q }))
  }
  if (period.kind === 'all') {
    const years = valid.map((l) => new Date(millis(l.data)).getFullYear())
    if (!years.length) return []
    const min = Math.min(...years)
    const max = Math.max(...years)
    if (max - min >= 1) {
      for (let y = min; y <= max; y++) map.set(y, 0)
      for (const l of valid) add(new Date(millis(l.data)).getFullYear(), l.sasia)
      return [...map.entries()].map(([y, q]) => ({ label: String(y), q }))
    }
    for (const l of valid) {
      const d = new Date(millis(l.data))
      add(d.getMonth(), l.sasia)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([m, q]) => ({ label: MONTHS[m], q }))
  }
  return [{ label: periodLabel(period), q: valid.reduce((a, l) => a + l.sasia, 0) }]
}

function QtyChart({ lines, period, range }) {
  const data = buckets(lines, period, range)
  if (!data.length || data.every((d) => !d.q)) return <p className="muted">Asnjë shitje në këtë periudhë.</p>
  const W = 1000
  const H = 240
  const padL = 44
  const padB = 28
  const padT = 22
  const max = Math.max(1, ...data.map((d) => d.q))
  const step = (W - padL - 10) / data.length
  const bw = Math.min(26, step * 0.45)
  const x = (i) => padL + step * i + step / 2
  const y = (q) => padT + (H - padT - padB) * (1 - q / max)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t))
  const dense = data.length > 16
  return (
    <svg className="ip-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sasia e shitur sipas periudhës">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 10} y1={y(t)} y2={y(t)} className="grid" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
        </g>
      ))}
      {data.map((d, i) => (
        <g key={d.label}>
          <rect x={x(i) - bw / 2} y={y(d.q)} width={bw} height={Math.max(0, H - padB - y(d.q))} rx="3" className="bar" />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="tick">{dense && i % 2 ? '' : d.label}</text>
        </g>
      ))}
      <polyline points={data.map((d, i) => `${x(i)},${y(d.q)}`).join(' ')} className="trend" />
      {data.map((d, i) => (
        <g key={`p${d.label}`}>
          <circle cx={x(i)} cy={y(d.q)} r="4" className="dot" />
          {d.q > 0 && (!dense || i % 2 === 0) && <text x={x(i)} y={y(d.q) - 9} textAnchor="middle" className="val">{d.q}</text>}
        </g>
      ))}
    </svg>
  )
}
