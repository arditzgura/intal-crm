import { useMemo, useState } from 'react'
import { matchesSearch } from '../utils/text'

/**
 * Zgjedhës me kërkim (klient / artikull).
 * options: [{ id, label, sub, search: [fusha për kërkim] }]
 */
export default function SearchPicker({ options, value, onChange, placeholder = 'Kërko…', exclude = [] }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)
  const list = useMemo(
    () => options.filter((o) => !exclude.includes(o.id) && matchesSearch(q, ...(o.search ?? [o.label]))).slice(0, 30),
    [options, q, exclude],
  )

  return (
    <div className="picker">
      <input
        value={open ? q : (selected?.label ?? '')}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setQ('')
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <div className="picker-list">
          {list.map((o) => (
            <button
              type="button"
              key={o.id}
              className="picker-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
            >
              <span>{o.label}</span>
              {o.sub && <small className="muted">{o.sub}</small>}
            </button>
          ))}
          {!list.length && <div className="picker-empty muted small">Asnjë rezultat</div>}
        </div>
      )}
    </div>
  )
}
