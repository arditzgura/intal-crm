import { Timestamp } from 'firebase/firestore'

const pad = (n) => String(n).padStart(2, '0')

export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  return new Date(value)
}

/** Date → "2026-10-14" për <input type="date"> */
export function toInputDate(value = new Date()) {
  const d = toDate(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "2026-10-14" → Timestamp (ora 12:00 lokale, që të mos ndryshojë dita nga zona orare). */
export function fromInputDate(text) {
  const [y, m, d] = text.split('-').map(Number)
  return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0))
}

/** Fillimi / fundi i ditës për filtra periudhe. */
export function startOfDay(text) {
  const [y, m, d] = text.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0)
}
export function endOfDay(text) {
  const [y, m, d] = text.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

export function formatDate(value) {
  const d = toDate(value)
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function formatDateTime(value) {
  const d = toDate(value)
  if (!d) return ''
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const millis = (value) => toDate(value)?.getTime() ?? 0

const MONTHS = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor']

/**
 * Periudha e filtrit: { kind: 'all' | 'day' | 'date' | 'month' | 'year', date: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY' }
 * → { from, to } (Date ose null).
 */
export function periodRange(p) {
  switch (p.kind) {
    case 'day': {
      const t = toInputDate()
      return { from: startOfDay(t), to: endOfDay(t) }
    }
    case 'date':
      return p.date ? { from: startOfDay(p.date), to: endOfDay(p.date) } : { from: null, to: null }
    case 'month': {
      const [y, m] = (p.month || '').split('-').map(Number)
      return y ? { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59, 999) } : { from: null, to: null }
    }
    case 'year': {
      const y = Number(p.year)
      return y ? { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59, 999) } : { from: null, to: null }
    }
    default:
      return { from: null, to: null }
  }
}

export function periodLabel(p) {
  switch (p.kind) {
    case 'day':
      return `Sot, ${formatDate(new Date())}`
    case 'date':
      return p.date ? formatDate(startOfDay(p.date)) : '—'
    case 'month': {
      const [y, m] = (p.month || '').split('-').map(Number)
      return y ? `${MONTHS[m - 1]} ${y}` : '—'
    }
    case 'year':
      return p.year || '—'
    default:
      return 'Gjithë kohës'
  }
}
