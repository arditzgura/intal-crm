import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { Download, Printer, FileDown, ChevronDown } from 'lucide-react'
import { downloadReportPdf } from '../../utils/exportReport'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { companyCol } from '../../services/paths'
import { watchClients } from '../../services/clientService'
import { watchItems, watchItemCosts, watchCostHistory, costAt } from '../../services/itemService'
import { watchStock } from '../../services/stockService'
import { queryCash, cashFlow } from '../../services/cashService'
import { ISSUED } from '../../services/invoiceChain'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { formatMoney, toLek, RATE_SCALE } from '../../utils/money'
import { endOfDay, formatDate, millis, periodLabel, periodRange, startOfDay, toInputDate } from '../../utils/date'
import PeriodFilter, { defaultPeriod } from '../../components/PeriodFilter'
import { monthFilter } from '../../services/aggStats'
import { downloadCsv } from '../../utils/csv'
import { useSort, SortTh } from '../../hooks/useSort'

const REPORTS = [
  ['shitjet', 'Shitjet'],
  ['fitimi', 'Fitimi bruto', 'sheh_koston'],
  ['borxhet', 'Borxhet sipas vjetërsisë'],
  ['cashflow', 'Cash flow'],
  ['inventari', 'Vlera e inventarit'],
]


export default function ReportsPage() {
  const { perms } = useAuth()
  const { settings } = useSettings()
  const [params, setParams] = useSearchParams()
  const available = REPORTS.filter(([, , p]) => !p || perms.has(p))
  const rep = available.find(([k]) => k === params.get('raporti'))?.[0] ?? 'shitjet'
  const title = REPORTS.find(([k]) => k === rep)[1]

  return (
    <div className="printable">
      <h1 className="page-title no-print">Raporte</h1>
      <div className="tabs no-print" role="tablist">
        {available.map(([k, label]) => (
          <button key={k} role="tab" className={`tab ${rep === k ? 'active' : ''}`} onClick={() => setParams({ raporti: k })}>{label}</button>
        ))}
      </div>
      <div className="print-only print-header">
        {settings.kompania.logo && <img src={settings.kompania.logo} alt="" className="print-logo" />}
        <div><h2>{settings.kompania.emri}</h2><div>Raport: {title} · printuar më {formatDate(new Date())}</div></div>
      </div>
      {rep === 'shitjet' && <SalesReport />}
      {rep === 'fitimi' && <ProfitReport />}
      {rep === 'borxhet' && <AgingReport />}
      {rep === 'cashflow' && <CashFlowReport />}
      {rep === 'inventari' && <InventoryReport />}
    </div>
  )
}

// ---------- Ndihmës ----------

/**
 * Periudha (butonat kohorë të aplikacionit) + të dhënat e shitjeve.
 * Gjithë kohës / muaj / vit: nga përmbledhjet mujore të gatshme (`monthStats`, disa lexime);
 * ditë të veçanta (ose `needLines`): nga rreshtat e faturave të periudhës.
 * Kthen `lines` (rreshta të vërtetë ose "rreshta" të përmbledhur me t / q / n) sipas grupimit.
 */
function useLines({ needLines = false } = {}) {
  const [period, setPeriodState] = useState(() => ({ ...defaultPeriod(), kind: 'month' }))
  const range = useMemo(() => periodRange(period), [period])
  const test = needLines ? null : monthFilter(range)
  const [data, setData] = useState({ lines: [], clientLines: [], itemLines: [], invoiceCount: 0, stats: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const job = test
      ? getDocs(companyCol('monthStats')).then((snap) => {
        const clientLines = []
        const itemLines = []
        let invoiceCount = 0
        for (const d of snap.docs) {
          if (!test(d.id)) continue
          const v = d.data()
          const [y, m] = d.id.split('-').map(Number)
          const data = new Date(y, m - 1, 1)
          invoiceCount += v.n ?? 0
          for (const [clientId, r] of Object.entries(v.c ?? {})) if (r.t || r.q) clientLines.push({ clientId, data, sasia: r.q, totali: r.t, kursi: RATE_SCALE, monedha: 'LEK', n: r.n })
          for (const [itemId, r] of Object.entries(v.i ?? {})) if (r.t || r.q) itemLines.push({ itemId, data, sasia: r.q, totali: r.t, kursi: RATE_SCALE, monedha: 'LEK', n: r.n })
        }
        return { lines: [], clientLines, itemLines, invoiceCount, stats: true }
      })
      : getDocs(query(companyCol('invoiceLines'), ...(range.from ? [where('data', '>=', range.from)] : []), ...(range.to ? [where('data', '<=', range.to)] : []), orderBy('data', 'desc')))
        .then((snap) => {
          const lines = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => !l.anuluar)
          return { lines, clientLines: lines, itemLines: lines, invoiceCount: new Set(lines.map((l) => l.invoiceId)).size, stats: false }
        })
    job.then((r) => !cancelled && setData(r))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, !!test])
  const form = <PeriodFilter period={period} setPeriod={setPeriodState} />
  const label = periodLabel(period)
  const fileTag = label.replace(/[^\p{L}\p{N}]+/gu, '_')
  return { ...data, loading, error, form, label, fileTag }
}

/** Rreshtat sipas grupimit: artikulli / kategoria nga artikujt, të tjerat nga klientët. */
const linesFor = (L, by) => (by === 'artikulli' || by === 'kategoria' ? L.itemLines : L.clientLines)

function useLookups() {
  const { data: clients } = useLive(watchClients, [], { initial: [] })
  const { data: items } = useLive(watchItems, [], { initial: [] })
  const cById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const iById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])
  return { clients, items, cById, iById }
}

const GROUP_LABELS = { klienti: 'Klienti', artikulli: 'Artikulli', kategoria: 'Kategoria', qyteti: 'Qyteti', muaji: 'Muaji' }

function groupKey(l, by, cById, iById) {
  if (by === 'klienti') return l.clientId
  if (by === 'artikulli') return l.itemId
  if (by === 'kategoria') return iById[l.itemId]?.kategoria || '(pa kategori)'
  if (by === 'qyteti') return cById[l.clientId]?.qyteti || '(pa qytet)'
  const d = new Date(millis(l.data))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function groupLabel(key, by, cById, iById) {
  // Emri / biznesi në fillim (renditja A–Z sipas emrit), pastaj kodi
  if (by === 'klienti') return cById[key] ? `${cById[key].emri} – ${cById[key].kodi}` : key
  if (by === 'artikulli') return iById[key] ? `${iById[key].kodi} – ${iById[key].emri}` : key
  if (by === 'muaji') return key.split('-').reverse().join('/')
  return key
}

function groupLink(key, by) {
  if (by === 'klienti') return `/kliente/${key}?skeda=blerjet`
  if (by === 'artikulli') return `/artikujt/${key}?skeda=shitjet`
  return null
}

function Toolbar({ children, onCsv }) {
  return (
    <div className="card filters no-print">
      {children}
      <span className="grow" />
      <button type="button" className="btn" onClick={onCsv}><Download size={16} /> CSV</button>
      <PrintMenu />
    </div>
  )
}

/** "Printo / PDF": pyet nëse raporti do të printohet apo do të shkarkohet si PDF. */
function PrintMenu() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  async function pdf() {
    setOpen(false)
    const node = document.querySelector('.printable')
    if (!node) return
    const title = document.querySelector('.printable .tabs .tab.active')?.textContent?.trim() || 'Raport'
    setBusy(true)
    try {
      await downloadReportPdf(node, `Raport_${title.replace(/[^\p{L}\p{N}]+/gu, '_')}_${toInputDate()}.pdf`)
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="print-menu" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn" onClick={() => setOpen((o) => !o)} disabled={busy} aria-haspopup="menu" aria-expanded={open}>
        <Printer size={16} /> {busy ? 'Duke krijuar PDF…' : 'Printo / PDF'} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="print-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); window.print() }}><Printer size={16} /> Printo raportin</button>
          <button type="button" role="menuitem" onClick={pdf}><FileDown size={16} /> Shkarko si PDF</button>
        </div>
      )}
    </div>
  )
}

function Cards({ items }) {
  return (
    <div className="balance-cards inv-cards">
      {items.map(([label, value, cls]) => (
        <div key={label} className="balance-card"><div className="balance-card-label">{label}</div><div className={`balance-card-value ${cls ?? ''}`}>{value}</div></div>
      ))}
    </div>
  )
}

// ---------- Shitjet ----------

function SalesReport() {
  const [orig, setOrig] = useState(false)
  const L = useLines({ needLines: orig })
  const { cById, iById } = useLookups()
  const [by, setBy] = useState('klienti')
  const [top, setTop] = useState(0)
  const src = linesFor(L, by)

  const rows = useMemo(() => {
    const m = new Map()
    for (const l of src) {
      const g = groupKey(l, by, cById, iById)
      const k = orig ? `${g}|${l.monedha}` : g
      const r = m.get(k) ?? { key: g, monedha: orig ? l.monedha : 'LEK', sasia: 0, totali: 0, lek: 0, fatura: new Set() }
      r.sasia += l.sasia
      r.totali += l.totali
      r.lek += toLek(l.totali, l.kursi)
      if (l.n != null) r.n = (r.n ?? 0) + l.n
      else r.fatura.add(l.invoiceId)
      m.set(k, r)
    }
    let arr = [...m.values()].map((r) => ({ ...r, fatura: r.n ?? r.fatura.size }))
    arr = by === 'muaji' ? arr.sort((a, b) => b.key.localeCompare(a.key)) : arr.sort((a, b) => b.lek - a.lek)
    return top ? arr.slice(0, top) : arr
  }, [src, by, orig, top, cById, iById])

  const totalLek = L.clientLines.reduce((s, l) => s + toLek(l.totali, l.kursi), 0)
  const invoices = L.invoiceCount
  const ss = useSort(rows, { emri: (r) => groupLabel(r.key, by, cById, iById), monedha: (r) => r.monedha, sasia: (r) => r.sasia, totali: (r) => (orig ? r.totali : r.lek), lek: (r) => r.lek, fatura: (r) => r.fatura })

  return (
    <>
      <Toolbar onCsv={() => downloadCsv(`shitjet_${by}_${L.fileTag}.csv`, [GROUP_LABELS[by], 'Monedha', 'Sasia', 'Totali', 'Totali LEK', 'Fatura'],
        rows.map((r) => [groupLabel(r.key, by, cById, iById), r.monedha, r.sasia, formatMoney(orig ? r.totali : r.lek), formatMoney(r.lek), r.fatura]))}>
        {L.form}
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>Sipas: {v}</option>)}
        </select>
        <select value={top} onChange={(e) => setTop(Number(e.target.value))}>
          <option value={0}>Të gjithë</option>
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
        </select>
        <label className="check"><input type="checkbox" checked={orig} onChange={(e) => setOrig(e.target.checked)} /> Monedha origjinale</label>
      </Toolbar>
      <p className="print-only">Periudha: {L.label}</p>
      {L.error && <div className="alert error">{L.error}</div>}
      <Cards items={[['Shitjet (LEK)', formatMoney(totalLek, 'LEK')], ['Fatura', String(invoices)], ['Njësi të shitura', String(L.itemLines.reduce((s, l) => s + l.sasia, 0))]]} />
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><SortTh s={ss} k="emri">{GROUP_LABELS[by]}</SortTh>{orig && <SortTh s={ss} k="monedha">Monedha</SortTh>}<SortTh s={ss} k="sasia" className="num">Sasia</SortTh><SortTh s={ss} k="totali" className="num">{orig ? 'Totali' : 'Totali (LEK)'}</SortTh>{orig && <SortTh s={ss} k="lek" className="num">Në LEK</SortTh>}<SortTh s={ss} k="fatura" className="num">Fatura</SortTh><SortTh s={ss} k="lek" className="num">%</SortTh></tr></thead>
            <tbody>
              {L.loading && <tr><td colSpan={8} className="muted">Duke u ngarkuar…</td></tr>}
              {!L.loading && !rows.length && <tr><td colSpan={8} className="muted">Asnjë shitje në këtë periudhë.</td></tr>}
              {!L.loading && ss.sorted.map((r, i) => {
                const link = groupLink(r.key, by)
                const label = groupLabel(r.key, by, cById, iById)
                return (
                  <tr key={`${r.key}${r.monedha}`}>
                    <td className="muted">{i + 1}</td>
                    <td>{link ? <Link to={link}>{label}</Link> : label}</td>
                    {orig && <td>{r.monedha}</td>}
                    <td className="num">{r.sasia}</td>
                    <td className="num"><b>{formatMoney(orig ? r.totali : r.lek, orig ? r.monedha : undefined)}</b></td>
                    {orig && <td className="num">{formatMoney(r.lek)}</td>}
                    <td className="num">{r.fatura}</td>
                    <td className="num muted">{totalLek ? `${Math.round((r.lek * 1000) / totalLek) / 10}%` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">Totalet në LEK llogariten me kursin e ruajtur te çdo faturë.</p>
    </>
  )
}

// ---------- Fitimi bruto ----------

function ProfitReport() {
  const [by, setBy] = useState('artikulli')
  const [top, setTop] = useState(0)
  // Fitimi kërkon artikullin për çdo shitje: sipas klientit / qytetit lexohen rreshtat e periudhës
  const L = useLines({ needLines: by === 'klienti' || by === 'qyteti' })
  const { cById, iById } = useLookups()
  const { data: history } = useLive(watchCostHistory, [], { initial: {} })
  const { data: current } = useLive(watchItemCosts, [], { initial: {} })

  const { rows, tot } = useMemo(() => {
    const m = new Map()
    const tot = { shitje: 0, kosto: 0, pa: 0 }
    for (const l of L.itemLines) {
      const k = groupKey(l, by, cById, iById)
      const r = m.get(k) ?? { key: k, sasia: 0, shitje: 0, kosto: 0, paKosto: 0 }
      const lek = toLek(l.totali, l.kursi)
      const c = costAt(l.itemId, millis(l.data), history, current)
      r.sasia += l.sasia
      r.shitje += lek
      tot.shitje += lek
      if (c == null) { r.paKosto += lek; tot.pa += lek } else { r.kosto += l.sasia * c; tot.kosto += l.sasia * c }
      m.set(k, r)
    }
    const arr = [...m.values()].map((r) => ({ ...r, fitimi: r.shitje - r.paKosto - r.kosto }))
    const sorted = by === 'muaji' ? arr.sort((a, b) => b.key.localeCompare(a.key)) : arr.sort((a, b) => b.fitimi - a.fitimi)
    return { rows: top ? sorted.slice(0, top) : sorted, tot }
  }, [L.itemLines, by, top, history, current, cById, iById])

  const fsort = useSort(rows, { emri: (r) => groupLabel(r.key, by, cById, iById), sasia: (r) => r.sasia, shitje: (r) => r.shitje, kosto: (r) => r.kosto, fitimi: (r) => r.fitimi, marzhi: (r) => (r.shitje - r.paKosto ? r.fitimi / (r.shitje - r.paKosto) : null) })
  const fitimi = tot.shitje - tot.pa - tot.kosto
  const marzh = tot.shitje - tot.pa ? Math.round((fitimi * 1000) / (tot.shitje - tot.pa)) / 10 : 0

  return (
    <>
      <Toolbar onCsv={() => downloadCsv(`fitimi_${by}_${L.fileTag}.csv`, [GROUP_LABELS[by], 'Sasia', 'Shitje LEK', 'Kosto LEK', 'Fitimi LEK', 'Marzhi %', 'Shitje pa kosto'],
        rows.map((r) => [groupLabel(r.key, by, cById, iById), r.sasia, formatMoney(r.shitje), formatMoney(r.kosto), formatMoney(r.fitimi), r.shitje - r.paKosto ? Math.round((r.fitimi * 1000) / (r.shitje - r.paKosto)) / 10 : '', formatMoney(r.paKosto)]))}>
        {L.form}
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>Sipas: {v}</option>)}
        </select>
        <select value={top} onChange={(e) => setTop(Number(e.target.value))}>
          <option value={0}>Të gjithë</option>
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
        </select>
      </Toolbar>
      <p className="print-only">Periudha: {L.label}</p>
      {L.error && <div className="alert error">{L.error}</div>}
      <Cards items={[
        ['Shitjet (LEK)', formatMoney(tot.shitje, 'LEK')],
        ['Kosto (LEK)', formatMoney(tot.kosto, 'LEK')],
        ['Fitimi bruto', formatMoney(fitimi, 'LEK'), fitimi < 0 ? 'neg' : 'pos'],
        ['Marzhi', `${marzh}%`],
      ]} />
      {tot.pa > 0 && <div className="alert">Shitje prej {formatMoney(tot.pa, 'LEK')} janë artikuj pa kosto dhe nuk përfshihen në fitim.</div>}
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh s={fsort} k="emri">{GROUP_LABELS[by]}</SortTh><SortTh s={fsort} k="sasia" className="num">Sasia</SortTh><SortTh s={fsort} k="shitje" className="num">Shitje</SortTh><SortTh s={fsort} k="kosto" className="num">Kosto</SortTh><SortTh s={fsort} k="fitimi" className="num">Fitimi</SortTh><SortTh s={fsort} k="marzhi" className="num">Marzhi</SortTh></tr></thead>
            <tbody>
              {L.loading && <tr><td colSpan={6} className="muted">Duke u ngarkuar…</td></tr>}
              {!L.loading && fsort.sorted.map((r) => {
                const link = groupLink(r.key, by)
                const label = groupLabel(r.key, by, cById, iById)
                const base = r.shitje - r.paKosto
                return (
                  <tr key={r.key}>
                    <td>{link ? <Link to={link}>{label}</Link> : label}{r.paKosto > 0 && <span className="muted small"> *</span>}</td>
                    <td className="num">{r.sasia}</td>
                    <td className="num">{formatMoney(r.shitje)}</td>
                    <td className="num">{formatMoney(r.kosto)}</td>
                    <td className={`num ${r.fitimi < 0 ? 'neg' : ''}`}><b>{formatMoney(r.fitimi)}</b></td>
                    <td className="num">{base ? `${Math.round((r.fitimi * 1000) / base) / 10}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">Fitimi = shitja në LEK − sasia × kosto e artikullit {L.stats ? 'në fillim të çdo muaji' : 'në datën e faturës'}. * = ka shitje pa kosto.</p>
    </>
  )
}

// ---------- Borxhet sipas vjetërsisë ----------

const BUCKETS = [['b0', '0–30 ditë'], ['b31', '31–60 ditë'], ['b60', 'Mbi 60 ditë']]

/**
 * Borxhi aktual i klientit u ndahet faturave më të reja (nga e fundit drejt
 * së vjetrës); pjesa që mbetet pa faturë (p.sh. gjendje fillestare) shkon te "Mbi 60".
 */
function AgingReport() {
  const { clients } = useLookups()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const debtors = useMemo(
    () => clients.flatMap((c) => Object.entries(c.gjendje ?? {}).filter(([, v]) => v > 0).map(([m, v]) => ({ client: c, monedha: m, borxhi: v }))),
    [clients],
  )
  const key = debtors.map((d) => `${d.client.id}${d.monedha}${d.borxhi}`).join(',')

  useEffect(() => {
    if (!debtors.length) { setRows([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const now = Date.now()
    Promise.all(
      debtors.map(async (d) => {
        const snap = await getDocs(query(companyCol('invoices'), where('clientId', '==', d.client.id), orderBy('data', 'desc'), limit(300)))
        const invs = snap.docs.map((x) => x.data()).filter((i) => i.monedha === d.monedha && ISSUED.includes(i.statusi))
        const out = { ...d, b0: 0, b31: 0, b60: 0, eVjetra: null }
        let left = d.borxhi
        for (const inv of invs) {
          if (left <= 0) break
          const part = Math.min(left, inv.totali)
          const days = (now - millis(inv.data)) / 86400000
          out[days <= 30 ? 'b0' : days <= 60 ? 'b31' : 'b60'] += part
          out.eVjetra = inv.data
          left -= part
        }
        if (left > 0) out.b60 += left
        return out
      }),
    )
      .then((r) => !cancelled && setRows(r.sort((a, b) => b.b60 - a.b60 || b.borxhi - a.borxhi)))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const as = useSort(rows, { klienti: (r) => r.client.emri, qyteti: (r) => r.client.qyteti, borxhi: (r) => r.borxhi, b0: (r) => r.b0 || null, b31: (r) => r.b31 || null, b60: (r) => r.b60 || null })
  const totals = {}
  for (const r of rows) {
    const t = (totals[r.monedha] ??= { borxhi: 0, b0: 0, b31: 0, b60: 0 })
    t.borxhi += r.borxhi; t.b0 += r.b0; t.b31 += r.b31; t.b60 += r.b60
  }

  return (
    <>
      <Toolbar onCsv={() => downloadCsv(`borxhet_${toInputDate()}.csv`, ['Klienti', 'Qyteti', 'Monedha', 'Borxhi', ...BUCKETS.map(([, l]) => l)],
        rows.map((r) => [`${r.client.emri} – ${r.client.kodi}`, r.client.qyteti, r.monedha, formatMoney(r.borxhi), ...BUCKETS.map(([k]) => formatMoney(r[k]))]))}>
        <span className="muted">Gjendja më {formatDate(new Date())}</span>
      </Toolbar>
      {error && <div className="alert error">{error}</div>}
      <div className="balance-cards inv-cards">
        {Object.entries(totals).map(([m, t]) => (
          <div key={m} className="balance-card debt">
            <div className="balance-card-label">Borxhi total {m}</div>
            <div className="balance-card-value">{formatMoney(t.borxhi, m)}</div>
            <div className="balance-card-sub">{BUCKETS.map(([k, l]) => `${l}: ${formatMoney(t[k])}`).join(' · ')}</div>
          </div>
        ))}
      </div>
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh s={as} k="klienti">Klienti</SortTh><SortTh s={as} k="qyteti">Qyteti</SortTh><SortTh s={as} k="borxhi" className="num">Borxhi</SortTh>{BUCKETS.map(([k, l]) => <SortTh key={k} s={as} k={k} className="num">{l}</SortTh>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="muted">Duke llogaritur…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={6} className="muted">Asnjë klient me borxh.</td></tr>}
              {!loading && as.sorted.map((r) => (
                <tr key={`${r.client.id}${r.monedha}`}>
                  <td><Link to={`/kliente/${r.client.id}`}>{r.client.emri} – {r.client.kodi}</Link></td>
                  <td>{r.client.qyteti}</td>
                  <td className="num"><b>{formatMoney(r.borxhi, r.monedha)}</b></td>
                  {BUCKETS.map(([k]) => <td key={k} className={`num ${k === 'b60' && r[k] ? 'neg' : ''}`}>{r[k] ? formatMoney(r[k]) : ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">Borxhi i çdo klienti u ndahet faturave më të reja, nga e fundit drejt së vjetrës; pjesa pa faturë (gjendje fillestare) shkon te "Mbi 60 ditë".</p>
    </>
  )
}

// ---------- Cash flow ----------

function CashFlowReport() {
  const [period, setPeriod] = useState(() => ({ ...defaultPeriod(), kind: 'year' }))
  const range = useMemo(() => periodRange(period), [period])
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    setError('')
    queryCash(range.from ?? new Date(2000, 0, 1), range.to ?? endOfDay(toInputDate())).then(setRows).catch((err) => setError(errorMessage(err)))
  }, [range])
  const fileTag = periodLabel(period).replace(/[^\p{L}\p{N}]+/gu, '_')
  const flow = cashFlow(rows, 'month')
  const keys = Object.keys(flow).sort()
  const currencies = [...new Set(keys.flatMap((k) => Object.keys(flow[k])))]

  return (
    <>
      <Toolbar onCsv={() => downloadCsv(`cashflow_${fileTag}.csv`, ['Muaji', 'Monedha', 'Hyrje', 'Dalje', 'Neto'],
        keys.flatMap((k) => Object.entries(flow[k]).map(([m, v]) => [k, m, formatMoney(v.hyrje), formatMoney(v.dalje), formatMoney(v.hyrje - v.dalje)])))}>
        <PeriodFilter period={period} setPeriod={setPeriod} />
      </Toolbar>
      <p className="print-only">Periudha: {periodLabel(period)}</p>
      {error && <div className="alert error">{error}</div>}
      {currencies.map((m) => {
        let cum = 0
        return (
          <div key={m} className="card no-pad">
            <h3 className="pad">{m}</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Muaji</th><th className="num">Hyrje</th><th className="num">Dalje</th><th className="num">Neto</th><th className="num">Kumulative</th></tr></thead>
                <tbody>
                  {keys.filter((k) => flow[k][m]).map((k) => {
                    const v = flow[k][m]
                    cum += v.hyrje - v.dalje
                    return (
                      <tr key={k}>
                        <td>{k.split('-').reverse().join('/')}</td>
                        <td className="num pos">{formatMoney(v.hyrje)}</td>
                        <td className="num neg">{formatMoney(v.dalje)}</td>
                        <td className="num"><b>{formatMoney(v.hyrje - v.dalje)}</b></td>
                        <td className="num">{formatMoney(cum)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      {!currencies.length && <div className="card muted">Asnjë lëvizje parash në këtë periudhë.</div>}
    </>
  )
}

// ---------- Vlera e inventarit ----------

function InventoryReport() {
  const { perms } = useAuth()
  const showCost = canSeeCost(perms)
  const { items } = useLookups()
  const { data: stock } = useLive(watchStock, [], { initial: {} })
  const { data: costs } = useLive(watchItemCosts, [], { enabled: showCost, initial: {} })

  const byCat = new Map()
  for (const i of items.filter((x) => !x.arkivuar)) {
    const q = Math.max(0, stock[i.id] ?? 0)
    const k = i.kategoria || '(pa kategori)'
    const r = byCat.get(k) ?? { kategoria: k, artikuj: 0, sasia: 0, kosto: 0, shitje: 0, paKosto: 0 }
    r.artikuj += 1
    r.sasia += q
    r.shitje += q * (i.cmimi ?? 0)
    if (costs[i.id] != null) r.kosto += q * costs[i.id]
    else if (q > 0) r.paKosto += 1
    byCat.set(k, r)
  }
  const rows = [...byCat.values()].sort((a, b) => b.shitje - a.shitje)
  const is = useSort(rows, { kategoria: (r) => r.kategoria, artikuj: (r) => r.artikuj, sasia: (r) => r.sasia, kosto: (r) => r.kosto, shitje: (r) => r.shitje })
  const tot = rows.reduce((s, r) => ({ sasia: s.sasia + r.sasia, kosto: s.kosto + r.kosto, shitje: s.shitje + r.shitje }), { sasia: 0, kosto: 0, shitje: 0 })

  return (
    <>
      <Toolbar onCsv={() => downloadCsv(`inventari_${toInputDate()}.csv`, ['Kategoria', 'Artikuj', 'Sasia', ...(showCost ? ['Vlera me kosto'] : []), 'Vlera me çmim shitje'],
        rows.map((r) => [r.kategoria, r.artikuj, r.sasia, ...(showCost ? [formatMoney(r.kosto)] : []), formatMoney(r.shitje)]))}>
        <span className="muted">Gjendja më {formatDate(new Date())}</span>
      </Toolbar>
      <Cards items={[
        ['Njësi në stok', String(tot.sasia)],
        ...(showCost ? [['Vlera me kosto', formatMoney(tot.kosto, 'LEK')]] : []),
        ['Vlera me çmim shitje', formatMoney(tot.shitje, 'LEK')],
      ]} />
      <div className="card no-pad">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><SortTh s={is} k="kategoria">Kategoria</SortTh><SortTh s={is} k="artikuj" className="num">Artikuj</SortTh><SortTh s={is} k="sasia" className="num">Sasia</SortTh>{showCost && <SortTh s={is} k="kosto" className="num">Vlera (kosto)</SortTh>}<SortTh s={is} k="shitje" className="num">Vlera (shitje)</SortTh></tr></thead>
            <tbody>
              {is.sorted.map((r) => (
                <tr key={r.kategoria}>
                  <td>{r.kategoria}</td>
                  <td className="num">{r.artikuj}</td>
                  <td className="num">{r.sasia}</td>
                  {showCost && <td className="num">{formatMoney(r.kosto)}{r.paKosto > 0 && <span className="muted small"> ({r.paKosto} pa kosto)</span>}</td>}
                  <td className="num">{formatMoney(r.shitje)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">Vlera llogaritet mbi stokun pozitiv. Detajet për çdo artikull: Inventari → Gjendja e stokut.</p>
    </>
  )
}
