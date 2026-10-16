import { periodLabel, toInputDate } from '../utils/date'

export const PERIODS = [
  ['all', 'Gjithë kohës'],
  ['day', 'Ditore'],
  ['date', 'Sipas ditës'],
  ['month', 'Muaji'],
  ['year', 'Viti'],
]

export const defaultPeriod = () => ({
  kind: 'all',
  date: toInputDate(),
  month: toInputDate().slice(0, 7),
  year: String(new Date().getFullYear()),
})

/** Filtri kohor: Gjithë kohës · Ditore · Sipas ditës · Muaji · Viti (+ "Periudha: …"). */
export default function PeriodFilter({ period, setPeriod }) {
  const years = Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => String(new Date().getFullYear() - i))
  return (
    <div className="period-row">
      <div className="period-tabs">
        {PERIODS.map(([k, l]) => (
          <button key={k} type="button" className={period.kind === k ? 'active' : ''} onClick={() => setPeriod((p) => ({ ...p, kind: k }))}>{l}</button>
        ))}
      </div>
      {period.kind === 'date' && <input type="date" value={period.date} onChange={(e) => setPeriod((p) => ({ ...p, date: e.target.value }))} />}
      {period.kind === 'month' && <input type="month" value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: e.target.value }))} />}
      {period.kind === 'year' && (
        <select value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: e.target.value }))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
      <span className="grow" />
      <div className="period-label"><span>Periudha</span><b>{periodLabel(period)}</b></div>
    </div>
  )
}
