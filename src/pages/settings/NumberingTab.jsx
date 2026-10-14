import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useSectionForm } from '../../hooks/useSectionForm'
import { COUNTER_KEYS, formatDocNumber, getCounters, setCounter } from '../../services/settingsService'
import { errorMessage } from '../../services/authService'
import SaveBar from './SaveBar'

export default function NumberingTab() {
  const form = useSectionForm('numerimi')
  const { profile } = useAuth()
  const [counters, setCounters] = useState(null)
  const [edits, setEdits] = useState({})
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    getCounters().then(setCounters).catch((err) => setMsg({ type: 'error', text: errorMessage(err) }))
  }, [])

  function setFormat(key, patch) {
    form.update((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  }

  async function saveCounter(key) {
    const next = Number(edits[key])
    if (!Number.isInteger(next) || next < 1) {
      setMsg({ type: 'error', text: 'Numri i radhës duhet të jetë numër i plotë ≥ 1.' })
      return
    }
    if (next < counters[key] && !window.confirm(
      `Numri ${next} është më i vogël se numri aktual (${counters[key]}). ` +
      'Sistemi nuk lejon kurrë numra të përsëritur, por kjo mund të shkaktojë gabime gjatë lëshimit. Vazhdo?',
    )) return
    try {
      await setCounter(key, next, profile?.emri)
      setCounters((c) => ({ ...c, [key]: next }))
      setEdits((e) => ({ ...e, [key]: undefined }))
      setMsg({ type: 'success', text: 'Numri i radhës u ruajt.' })
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) })
    }
  }

  return (
    <div className="card">
      {Object.entries(COUNTER_KEYS).map(([key, label]) => {
        const fmt = form.draft[key] ?? {}
        const current = counters?.[key]
        return (
          <section key={key} className="subsection">
            <h3>{label}</h3>
            <div className="grid-3">
              <label className="field">
                <span>Prefiksi</span>
                <input value={fmt.prefiksi ?? ''} onChange={(e) => setFormat(key, { prefiksi: e.target.value })} placeholder="p.sh. F-" />
              </label>
              <label className="field">
                <span>Numri minimal i shifrave</span>
                <input type="number" min={0} max={10} value={fmt.shifra ?? 0} onChange={(e) => setFormat(key, { shifra: Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0))) })} />
              </label>
              <div className="field">
                <span>Shembull</span>
                <div className="example">{formatDocNumber(fmt, current ?? 1)}</div>
              </div>
            </div>
            <div className="grid-3">
              <label className="field">
                <span>Numri i radhës (i ardhshëm)</span>
                <input
                  type="number"
                  min={1}
                  value={edits[key] ?? current ?? ''}
                  disabled={current == null}
                  onChange={(e) => setEdits((x) => ({ ...x, [key]: e.target.value }))}
                />
              </label>
              <div className="field">
                <span>&nbsp;</span>
                <button
                  type="button"
                  className="btn"
                  disabled={edits[key] == null || Number(edits[key]) === current}
                  onClick={() => saveCounter(key)}
                >
                  Ruaj numrin e radhës
                </button>
              </div>
            </div>
          </section>
        )
      })}
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <p className="muted small">
        Numrat gjenerohen me transaction në Firestore dhe janë gjithmonë unikë. Formati (prefiksi,
        shifrat) ruhet me butonin "Ruaj" më poshtë.
      </p>
      <SaveBar form={form} />
    </div>
  )
}
