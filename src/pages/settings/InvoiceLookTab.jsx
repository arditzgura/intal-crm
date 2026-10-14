import { useSectionForm } from '../../hooks/useSectionForm'
import { INVOICE_TEMPLATES, INVOICE_FONTS } from '../../services/settingsService'
import SaveBar from './SaveBar'

function NumberField({ label, value, onChange, min, max, suffix }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-suffix">
        <input
          type="number"
          step="1"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Math.trunc(Number(e.target.value)))}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}

export default function InvoiceLookTab() {
  const form = useSectionForm('fatura')
  const d = form.draft
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || min))

  function onSave() {
    form.save({
      ...d,
      madhesiaFontit: clamp(d.madhesiaFontit, 8, 24),
      gjeresiaTermike: clamp(d.gjeresiaTermike, 48, 112),
      watermarkMadhesia: clamp(d.watermarkMadhesia, 0, 100),
      watermarkTransparenca: clamp(d.watermarkTransparenca, 0, 100),
    })
  }

  return (
    <div className="card">
      <div className="grid-2">
        <label className="field">
          <span>Shablloni A4</span>
          <select value={d.shablloni} onChange={(e) => form.update({ shablloni: e.target.value })}>
            {INVOICE_TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fonti i artikujve</span>
          <select value={d.fonti} onChange={(e) => form.update({ fonti: e.target.value })}>
            {INVOICE_FONTS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <NumberField label="Madhësia e fontit të artikujve" value={d.madhesiaFontit} min={8} max={24} suffix="px" onChange={(v) => form.update({ madhesiaFontit: v })} />
        <NumberField label="Gjerësia e printerit termik" value={d.gjeresiaTermike} min={48} max={112} suffix="mm" onChange={(v) => form.update({ gjeresiaTermike: v })} />
        <NumberField label="Madhësia e watermark-ut" value={d.watermarkMadhesia} min={0} max={100} suffix="%" onChange={(v) => form.update({ watermarkMadhesia: v })} />
        <NumberField label="Transparenca e watermark-ut" value={d.watermarkTransparenca} min={0} max={100} suffix="%" onChange={(v) => form.update({ watermarkTransparenca: v })} />
      </div>
      <p className="muted small">Pamja e plotë e faturës dhe printimi ndërtohen në Fazën 3.</p>
      <SaveBar form={form} onSave={onSave} />
    </div>
  )
}
