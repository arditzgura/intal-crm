import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useSectionForm } from '../../hooks/useSectionForm'
import SaveBar from './SaveBar'

function AddInput({ placeholder, onAdd }) {
  const [value, setValue] = useState('')
  function add() {
    const v = value.trim()
    if (!v) return
    onAdd(v)
    setValue('')
  }
  return (
    <div className="add-input">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
      />
      <button type="button" className="btn small" onClick={add}>
        <Plus size={14} /> Shto
      </button>
    </div>
  )
}

function Chips({ items, onRemove }) {
  return (
    <div className="chips">
      {items.map((it) => (
        <span key={it} className="chip">
          {it}
          <button type="button" onClick={() => onRemove(it)} aria-label={`Hiq ${it}`}>
            <X size={12} />
          </button>
        </span>
      ))}
      {!items.length && <span className="muted small">Asnjë</span>}
    </div>
  )
}

const uniqAdd = (list, v) => (list.some((x) => x.toLowerCase() === v.toLowerCase()) ? list : [...list, v])

export default function CategoriesTab() {
  const form = useSectionForm('kategorite')
  const { artikuj = [], blerje = [], shpenzime = [], origjinat = [] } = form.draft
  const set = (patch) => form.update(patch)

  return (
    <div className="card">
      <section className="subsection">
        <h3>Kategoritë e artikujve</h3>
        {artikuj.map((cat, i) => (
          <div key={cat.emri} className="category">
            <div className="category-head">
              <b>{cat.emri}</b>
              <button
                type="button"
                className="btn link small"
                onClick={() => window.confirm(`Të hiqet kategoria "${cat.emri}"?`) && set({ artikuj: artikuj.filter((_, j) => j !== i) })}
              >
                Hiq
              </button>
            </div>
            <Chips
              items={cat.nen}
              onRemove={(n) => set({ artikuj: artikuj.map((c, j) => (j === i ? { ...c, nen: c.nen.filter((x) => x !== n) } : c)) })}
            />
            <AddInput
              placeholder="Nënkategori e re"
              onAdd={(v) => set({ artikuj: artikuj.map((c, j) => (j === i ? { ...c, nen: uniqAdd(c.nen, v) } : c)) })}
            />
          </div>
        ))}
        <AddInput
          placeholder="Kategori e re"
          onAdd={(v) => !artikuj.some((c) => c.emri.toLowerCase() === v.toLowerCase()) && set({ artikuj: [...artikuj, { emri: v, nen: [] }] })}
        />
      </section>

      <section className="subsection">
        <h3>Kategoritë e blerjeve</h3>
        <Chips items={blerje} onRemove={(v) => set({ blerje: blerje.filter((x) => x !== v) })} />
        <AddInput placeholder="Kategori e re" onAdd={(v) => set({ blerje: uniqAdd(blerje, v) })} />
      </section>

      <section className="subsection">
        <h3>Origjinat e brendshme të hyrjeve</h3>
        <p className="muted small">P.sh. "Magazina Qendrore". Hyrjet nga këto origjina nuk krijojnë detyrim.</p>
        <Chips items={origjinat} onRemove={(v) => set({ origjinat: origjinat.filter((x) => x !== v) })} />
        <AddInput placeholder="Origjinë e re" onAdd={(v) => set({ origjinat: uniqAdd(origjinat, v) })} />
      </section>

      <section className="subsection">
        <h3>Kategoritë e shpenzimeve</h3>
        <Chips items={shpenzime} onRemove={(v) => set({ shpenzime: shpenzime.filter((x) => x !== v) })} />
        <AddInput placeholder="Kategori e re" onAdd={(v) => set({ shpenzime: uniqAdd(shpenzime, v) })} />
      </section>

      <SaveBar form={form} />
    </div>
  )
}
