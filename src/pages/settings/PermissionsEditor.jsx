import { PERMISSION_GROUPS, TEMPLATES } from '../../config/permissions'

const OTHER = '__tjeter'

/**
 * Zgjedhja e shabllonit (roli) dhe e lejeve.
 * value: { roli, roliEmer, lejet: [] }  –  roli 'admin' = të gjitha lejet.
 * "Tjetër +" krijon një rol me emër të ri (roli 'personalizuar' + roliEmer, p.sh. "Kontabilist");
 * rolet e krijuara më parë (`customRoles`: { emri: lejet }) shfaqen si zgjedhje në listë.
 */
export default function PermissionsEditor({ value, onChange, customRoles = {} }) {
  const isAdmin = value.roli === 'admin'
  const set = new Set(value.lejet)
  const selected = value.roliEmer != null ? `emer:${value.roliEmer}` : value.roli

  function pickTemplate(v) {
    if (v === OTHER) return onChange({ roli: 'personalizuar', roliEmer: 'Rol i ri', lejet: value.roli === 'admin' ? [] : value.lejet })
    if (v.startsWith('emer:')) {
      const emri = v.slice(5)
      return onChange({ roli: 'personalizuar', roliEmer: emri, lejet: [...(customRoles[emri] ?? value.lejet)] })
    }
    onChange({ roli: v, roliEmer: null, lejet: v === 'admin' ? [] : [...(TEMPLATES[v]?.lejet ?? value.lejet)] })
  }

  function toggle(key) {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    // Ndryshimi me dorë e kthen në "I personalizuar", përveç kur përputhet me një shabllon.
    const lejet = [...next]
    // Një rol i riemërtuar mbetet me emrin e vet, cilatdo leje të ketë.
    if (value.roliEmer != null) return onChange({ roli: 'personalizuar', roliEmer: value.roliEmer, lejet })
    const match = Object.entries(TEMPLATES).find(
      ([k, t]) => k !== 'personalizuar' && t.lejet.length === lejet.length && t.lejet.every((p) => next.has(p)),
    )
    onChange({ roli: match ? match[0] : 'personalizuar', roliEmer: null, lejet })
  }

  return (
    <div className="perm-editor">
      <label className="field">
        <span>Shablloni / roli</span>
        <select value={selected} onChange={(e) => pickTemplate(e.target.value)}>
          {Object.entries(TEMPLATES).map(([k, t]) => (
            <option key={k} value={k}>{t.label}</option>
          ))}
          {Object.keys(customRoles).filter((n) => n !== value.roliEmer).sort((a, b) => a.localeCompare(b, 'sq')).map((n) => (
            <option key={n} value={`emer:${n}`}>{n}</option>
          ))}
          {value.roliEmer != null && <option value={`emer:${value.roliEmer}`}>{value.roliEmer || '(pa emër)'}</option>}
          <option value="admin">Admin (të gjitha lejet)</option>
          <option value={OTHER}>Tjetër +</option>
        </select>
      </label>
      {value.roliEmer != null && (
        <label className="field">
          <span>Emri i rolit (riemërto)</span>
          <input value={value.roliEmer} onChange={(e) => onChange({ ...value, roliEmer: e.target.value })} placeholder="p.sh. Kontabilist" />
        </label>
      )}

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
