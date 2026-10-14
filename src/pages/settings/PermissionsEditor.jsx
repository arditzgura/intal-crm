import { PERMISSION_GROUPS, TEMPLATES } from '../../config/permissions'

/**
 * Zgjedhja e shabllonit (roli) dhe e lejeve.
 * value: { roli, lejet: [] }  –  roli 'admin' = të gjitha lejet.
 */
export default function PermissionsEditor({ value, onChange }) {
  const isAdmin = value.roli === 'admin'
  const set = new Set(value.lejet)

  function pickTemplate(roli) {
    onChange({ roli, lejet: roli === 'admin' ? [] : [...(TEMPLATES[roli]?.lejet ?? value.lejet)] })
  }

  function toggle(key) {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    // Ndryshimi me dorë e kthen në "I personalizuar", përveç kur përputhet me një shabllon.
    const lejet = [...next]
    const match = Object.entries(TEMPLATES).find(
      ([k, t]) => k !== 'personalizuar' && t.lejet.length === lejet.length && t.lejet.every((p) => next.has(p)),
    )
    onChange({ roli: match ? match[0] : 'personalizuar', lejet })
  }

  return (
    <div className="perm-editor">
      <label className="field">
        <span>Shablloni / roli</span>
        <select value={value.roli} onChange={(e) => pickTemplate(e.target.value)}>
          {Object.entries(TEMPLATES).map(([k, t]) => (
            <option key={k} value={k}>{t.label}</option>
          ))}
          <option value="admin">Admin (të gjitha lejet)</option>
        </select>
      </label>

      {isAdmin ? (
        <p className="alert">Admini ka të gjitha lejet, përfshirë Cilësimet dhe menaxhimin e përdoruesve.</p>
      ) : (
        <div className="perm-groups">
          {PERMISSION_GROUPS.map((g) => (
            <fieldset key={g.label} className="fieldset">
              <legend>{g.label}</legend>
              {g.items.map(([key, label]) => (
                <label key={key} className="check perm-check">
                  <input type="checkbox" checked={set.has(key)} onChange={() => toggle(key)} /> {label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  )
}
