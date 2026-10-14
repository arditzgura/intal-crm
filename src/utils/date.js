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
