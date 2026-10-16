import { useEffect, useMemo, useState } from 'react'
import { getDocs, orderBy, query, where } from 'firebase/firestore'
import { Download, Printer } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useLive } from '../../hooks/useLive'
import { useSettings } from '../../hooks/useSettings'
import { companyCol } from '../../services/paths'
import { ISSUED } from '../../services/invoiceChain'
import { watchCostHistory, watchItemCosts, costAt } from '../../services/itemService'
import { errorMessage } from '../../services/authService'
import { canSeeCost } from '../../config/roles'
import { formatMoney, toLek } from '../../utils/money'
import { millis, toInputDate } from '../../utils/date'
import { downloadCsv } from '../../utils/csv'
import Modal from '../../components/Modal'

const MONTHS = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor']
const pad = (n) => String(n).padStart(2, '0')

/**
 * Raporti i periudhës: për çdo ditë (Muaji) ose çdo muaj (Viti):
 * Shitje · Arkëtime · Fitimi · Detyrimi (= shitje − arkëtime), të gjitha në LEK.
 * Shitjet dhe fitimi vijnë nga faturat e lëshuara (me rreshtat e tyre), arkëtimet
 * nga pagesat e klientëve në kartelë.
 */
export default function PeriodReport({ initialPeriod, onClose }) {
  const { perms } = useAuth()
  const { settings } = useSettings()
  const showProfit = canSeeCost(perms)
  const now = new Date()
  const [mode, setMode] = useState(initialPeriod?.kind === 'year' ? 'year' : 'month')
  const [month, setMonth] = useState(initialPeriod?.kind === 'month' ? initialPeriod.month : toInputDate().slice(0, 7))
  const [year, setYear] = useState(initialPeriod?.kind === 'year' ? initialPeriod.year : String(now.getFullYear()))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const { data: history } = useLive(watchCostHistory, [], { enabled: showProfit, initial: {} })
  const { data: current } = useLive(watchItemCosts, [], { enabled: showProfit, initial: {} })

  const range = useMemo(() => {
    if (mode === 'year') {
      const y = Number(year)
      return { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59, 999) }
    }
    const [y, m] = month.split('-').map(Number)
    return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59, 999) }
  }, [mode, month, year])
  const label = mode === 'year' ? year : `${MONTHS[Number(month.split('-')[1]) - 1]} ${month.split('-')[0]}`

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    const inRange = [where('data', '>=', range.from), where('data', '<=', range.to)]
    Promise.all([
      getDocs(query(companyCol('invoices'), ...inRange, orderBy('data'))),
      getDocs(query(companyCol('ledger'), where('tipi', '==', 'pagese'), ...inRange)),
    ])
      .then(([inv, led]) => {
        if (cancelled) return
        setData({
          invoices: inv.docs.map((d) => d.data()).filter((i) => ISSUED.includes(i.statusi)),
          payments: led.docs.map((d) => d.data()),
        })
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
    return () => { cancelled = true }
  }, [range])

  const rows = useMemo(() => {
    if (!data) return []
    const keyOf = (ms) => {
      const d = new Date(ms)
      return mode === 'year' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    // Rreshtat bosh për çdo ditë / muaj të periudhës (deri sot)
    const slots = new Map()
    const end = Math.min(range.to.getTime(), Date.now())
    if (mode === 'year') {
      for (let m = 0; m < 12; m++) {
        const d = new Date(range.from.getFullYear(), m, 1)
        if (d.getTime() > end) break
        slots.set(keyOf(d.getTime()), { shitje: 0, arketime: 0, fitimi: 0, paKosto: false })
      }
    } else {
      for (let d = new Date(range.from); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
        slots.set(keyOf(d.getTime()), { shitje: 0, arketime: 0, fitimi: 0, paKosto: false })
      }
    }
    const slot = (ms) => {
      const k = keyOf(ms)
      if (!slots.has(k)) slots.set(k, { shitje: 0, arketime: 0, fitimi: 0, paKosto: false })
      return slots.get(k)
    }
    for (const inv of data.invoices) {
      const t = millis(inv.data)
      const s = slot(t)
      s.shitje += toLek(inv.totali, inv.kursi)
      if (showProfit) {
        for (const l of inv.rreshtat ?? []) {
          const c = costAt(l.itemId, t, history, current)
          if (c == null) s.paKosto = true
          else s.fitimi += toLek(l.totali, inv.kursi) - l.sasia * c
        }
      }
    }
    for (const p of data.payments) slot(millis(p.data)).arketime += toLek(-p.shuma, p.kursi)
    return [...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k, ...v, detyrimi: v.shitje - v.arketime }))
  }, [data, mode, range, showProfit, history, current])

  const tot = rows.reduce((a, r) => ({ shitje: a.shitje + r.shitje, arketime: a.arketime + r.arketime, fitimi: a.fitimi + r.fitimi, detyrimi: a.detyrimi + r.detyrimi }), { shitje: 0, arketime: 0, fitimi: 0, detyrimi: 0 })
  const rowLabel = (k) => {
    const [y, m, d] = k.split('-').map(Number)
    return mode === 'year' ? `${MONTHS[m - 1]} ${y}` : `${pad(d)} ${MONTHS[m - 1]}`
  }
  const signed = (v) => `${v > 0 ? '+' : ''}${formatMoney(v)}`
  const headers = ['Data', 'Shitje (LEK)', 'Arkëtime (LEK)', ...(showProfit ? ['Fitimi (LEK)'] : []), 'Detyrimi (LEK)']
  const line = (r) => [rowLabel(r.k), formatMoney(r.shitje), formatMoney(r.arketime), ...(showProfit ? [signed(r.fitimi)] : []), signed(r.detyrimi)]
  const totalLine = ['Totali', formatMoney(tot.shitje), formatMoney(tot.arketime), ...(showProfit ? [signed(tot.fitimi)] : []), signed(tot.detyrimi)]

  function print() {
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const w = window.open('', '_blank')
    if (!w) return setError('Shfletuesi bllokoi dritaren e printimit.')
    w.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><title>Raport – ${esc(label)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h1{font-size:16px;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #ddd;padding:5px 8px}
      th{background:#eee;text-align:right}th:first-child,td:first-child{text-align:left}td{text-align:right}tfoot td{font-weight:bold;border-top:2px solid #000}</style></head><body>
      <h1>${esc(settings.kompania.emri)} – Raport ${esc(label)}</h1>
      <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${line(r).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr>${totalLine.map((c) => `<td>${esc(c)}</td>`).join('')}</tr></tfoot></table></body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  const years = Array.from({ length: now.getFullYear() - 2019 }, (_, i) => String(now.getFullYear() - i))

  return (
    <Modal title="Raport sipas periudhës" onClose={onClose} wide>
      <div className="pr-toolbar">
        <div className="period-tabs">
          <button type="button" className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>Muaji</button>
          <button type="button" className={mode === 'year' ? 'active' : ''} onClick={() => setMode('year')}>Viti</button>
        </div>
        {mode === 'month'
          ? <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          : <select value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        <span className="grow" />
        <b className="pr-label">{label}</b>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!data && !error && <p className="muted">Duke llogaritur…</p>}
      {data && (
        <>
          <div className="table-wrap pr-table-wrap">
            <table className="table pr-table">
              <thead><tr>{headers.map((h, i) => <th key={h} className={i ? 'num' : ''}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.k}>
                    <td><b>{rowLabel(r.k)}</b></td>
                    <td className="num"><b>{formatMoney(r.shitje)}</b></td>
                    <td className="num pos"><b>{formatMoney(r.arketime)}</b></td>
                    {showProfit && <td className="num pr-profit" title={r.paKosto ? 'Disa artikuj pa kosto nuk përfshihen' : ''}><b>{signed(r.fitimi)}{r.paKosto ? ' *' : ''}</b></td>}
                    <td className={`num ${r.detyrimi > 0 ? 'neg' : r.detyrimi < 0 ? 'pos' : ''}`}><b>{signed(r.detyrimi)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totali</td>
                  <td className="num">{formatMoney(tot.shitje)}</td>
                  <td className="num pos">{formatMoney(tot.arketime)}</td>
                  {showProfit && <td className="num pr-profit">{signed(tot.fitimi)}</td>}
                  <td className={`num ${tot.detyrimi > 0 ? 'neg' : 'pos'}`}>{signed(tot.detyrimi)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted small">Detyrimi = shitje − arkëtime e periudhës (+ borxhi u rrit, − u arkëtua më shumë). Shumat në EUR/USD janë kthyer në LEK me kursin e çdo dokumenti.</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => downloadCsv(`raport_${mode === 'year' ? year : month}.csv`, headers, [...rows.map(line), totalLine])}><Download size={16} /> CSV</button>
            <button className="btn primary" onClick={print}><Printer size={16} /> Printo / PDF</button>
          </div>
        </>
      )}
    </Modal>
  )
}
