import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { toDate } from '../utils/date'

/**
 * Renditja e tabelave me klik mbi titullin e kolonës:
 * klik i parë → nga më i vogli te më i madhi / A → Z, klik i dytë → e kundërta.
 *
 *   const s = useSort(rows, { nr: (r) => r.numri, emri: (r) => r.emri }, { key: 'nr', dir: 'desc' })
 *   <SortTh s={s} k="nr">Nr.</SortTh>   …   s.sorted.map(…)
 */
export function useSort(rows, accessors, initial = null) {
  const [sort, setSort] = useState(initial)

  const sorted = useMemo(() => {
    if (!sort || !accessors[sort.key]) return rows
    const get = accessors[sort.key]
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => {
      const va = norm(get(a))
      const vb = norm(get(b))
      if (va == null && vb == null) return 0
      if (va == null) return 1 // bosh gjithmonë në fund
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'sq', { numeric: true, sensitivity: 'base' }) * dir
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])

  function toggle(key) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return { sorted, sort, toggle }
}

function norm(v) {
  if (v == null || v === '') return null
  if (v instanceof Date || typeof v?.toDate === 'function') return toDate(v).getTime()
  return v
}

/** Titull kolone që rendit tabelën kur klikohet. */
export function SortTh({ s, k, children, className = '', title }) {
  const active = s.sort?.key === k
  const Icon = !active ? ArrowUpDown : s.sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      className={`sortable ${active ? 'sorted' : ''} ${className}`}
      onClick={() => s.toggle(k)}
      title={title ?? 'Kliko për të renditur'}
      aria-sort={active ? (s.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="th-inner">{children}<Icon size={12} className="sort-icon" /></span>
    </th>
  )
}
