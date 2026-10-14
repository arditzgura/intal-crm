import { formatMoney } from '../utils/money'

/** Gjendja e klientit: pozitive = DETYRIM, negative = TEPRICË. */
export function balanceLabel(v) {
  if (!v) return 'Pa detyrim'
  return v > 0 ? 'Detyrim' : 'Tepricë'
}

export default function Balance({ value, currency, showLabel }) {
  const v = value ?? 0
  const cls = v > 0 ? 'bal-debt' : v < 0 ? 'bal-credit' : 'bal-zero'
  return (
    <span className={`bal ${cls}`}>
      {formatMoney(Math.abs(v), currency)}
      {showLabel && v !== 0 && <small> {v > 0 ? 'DETYRIM' : 'TEPRICË'}</small>}
    </span>
  )
}
