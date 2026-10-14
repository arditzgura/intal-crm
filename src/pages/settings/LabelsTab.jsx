import { useSectionForm } from '../../hooks/useSectionForm'
import { INVOICE_LABELS } from '../../services/settingsService'
import SaveBar from './SaveBar'

export default function LabelsTab() {
  const form = useSectionForm('etiketat')
  return (
    <div className="card">
      <p className="muted">Tekstet që printohen në faturë. Lëreni bosh për vlerën parazgjedhur.</p>
      <div className="grid-2">
        {INVOICE_LABELS.map(([key, def]) => (
          <label key={key} className="field">
            <span>{def}</span>
            <input value={form.draft[key] ?? ''} placeholder={def} onChange={(e) => form.update({ [key]: e.target.value })} />
          </label>
        ))}
      </div>
      <SaveBar
        form={form}
        onSave={() =>
          form.save(Object.fromEntries(INVOICE_LABELS.map(([k, def]) => [k, form.draft[k]?.trim() || def])))
        }
      />
    </div>
  )
}
