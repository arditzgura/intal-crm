import { useEffect, useState } from 'react'
import { useSectionForm } from '../../hooks/useSectionForm'
import { formatRate, parseRate } from '../../utils/money'
import SaveBar from './SaveBar'

const FOREIGN = ['EUR', 'USD']

export default function CurrencyTab() {
  const rates = useSectionForm('monedhat')
  const points = useSectionForm('piket')
  const [text, setText] = useState({})
  const [rateError, setRateError] = useState('')

  // Kurset shfaqen si tekst ("98,5") dhe ruhen si numra të plotë ×10000.
  useEffect(() => {
    if (!rates.dirty) setText(Object.fromEntries(FOREIGN.map((c) => [c, formatRate(rates.draft[c])])))
  }, [rates.draft, rates.dirty])

  function saveRates() {
    const value = {}
    for (const c of FOREIGN) {
      const parsed = parseRate(text[c])
      if (!parsed || parsed <= 0) {
        setRateError(`Kursi ${c}→LEK nuk është i vlefshëm.`)
        return
      }
      value[c] = parsed
    }
    setRateError('')
    rates.save(value)
  }

  return (
    <>
      <div className="card">
        <h3>Kurset parazgjedhur</h3>
        <p className="muted">
          Monedha bazë është LEK. Kursi ngrihet te çdo dokument në momentin e krijimit; ndryshimi
          këtu nuk prek dokumentet e vjetra.
        </p>
        <div className="grid-2">
          {FOREIGN.map((c) => (
            <label key={c} className="field">
              <span>1 {c} = ? LEK</span>
              <input
                inputMode="decimal"
                value={text[c] ?? ''}
                onChange={(e) => {
                  setText((t) => ({ ...t, [c]: e.target.value }))
                  rates.update({})
                }}
              />
            </label>
          ))}
        </div>
        {rateError && <div className="alert error">{rateError}</div>}
        <SaveBar form={rates} onSave={saveRates} />
      </div>

      <div className="card">
        <h3>Pikët e besnikërisë</h3>
        <label className="field form-narrow">
          <span>Sa Lek = 1 pikë</span>
          <input
            type="number"
            min={1}
            step={1}
            value={points.draft.lekPerPike ?? ''}
            onChange={(e) => points.update({ lekPerPike: e.target.value === '' ? '' : Math.trunc(Number(e.target.value)) })}
          />
        </label>
        <p className="muted small">Faturat në EUR/USD konvertohen në LEK me kursin e faturës.</p>
        <SaveBar form={points} onSave={() => points.save({ lekPerPike: Math.max(1, Number(points.draft.lekPerPike) || 100) })} />
      </div>
    </>
  )
}
