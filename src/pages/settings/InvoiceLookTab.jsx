import { useRef, useState } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { useSectionForm } from '../../hooks/useSectionForm'
import { useSettings } from '../../hooks/useSettings'
import { compressLogo, logoSizeKb } from '../../utils/image'
import InvoiceDocument from '../../components/invoice/InvoiceDocument'
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
  const { settings } = useSettings()
  const fileRef = useRef(null)
  const [wmError, setWmError] = useState('')
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || min))

  async function onWatermark(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setWmError('')
    try {
      form.update({ watermark: await compressLogo(file) })
    } catch (err) {
      setWmError(err.message)
    }
  }

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
            {d.fonti && !INVOICE_FONTS.includes(d.fonti) && <option value={d.fonti}>{d.fonti}</option>}
          </select>
        </label>
        <NumberField label="Madhësia e fontit të artikujve" value={d.madhesiaFontit} min={8} max={24} suffix="px" onChange={(v) => form.update({ madhesiaFontit: v })} />
        <NumberField label="Gjerësia e printerit termik" value={d.gjeresiaTermike} min={48} max={112} suffix="mm" onChange={(v) => form.update({ gjeresiaTermike: v })} />
      </div>

      <h3 className="wm-title">Watermark (sfondi i faturës A4)</h3>
      <p className="muted small">Logoja e kompanisë shfaqet vetëm në krye të faturës. Watermark-u është imazh më vete, i zbehur në mes të faqes.</p>
      <div className="wm-grid">
        <div className="wm-controls">
          <div className="logo-row">
            {d.watermark ? <img src={d.watermark} alt="Watermark" className="logo-preview" /> : <div className="logo-preview empty">Pa watermark</div>}
            <div className="logo-actions">
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Ngarko imazhin</button>
              {d.watermark && (
                <>
                  <button type="button" className="btn danger" onClick={() => form.update({ watermark: '' })}><Trash2 size={16} /> Hiqe</button>
                  <span className="muted small">{logoSizeKb(d.watermark)} KB</span>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onWatermark} />
            </div>
          </div>
          {wmError && <div className="alert error">{wmError}</div>}
          <label className="field">
            <span>Madhësia: <b>{d.watermarkMadhesia}%</b> e gjerësisë së faqes</span>
            <input type="range" min={5} max={100} step={1} value={d.watermarkMadhesia} onChange={(e) => form.update({ watermarkMadhesia: Number(e.target.value) })} disabled={!d.watermark} />
          </label>
          <label className="field">
            <span>Dukshmëria: <b>{d.watermarkTransparenca}%</b> (0 = i padukshëm, 100 = plotësisht i dukshëm)</span>
            <input type="range" min={1} max={100} step={1} value={d.watermarkTransparenca} onChange={(e) => form.update({ watermarkTransparenca: Number(e.target.value) })} disabled={!d.watermark} />
          </label>
          <p className="muted small">Ndryshimet shihen menjëherë në parapamje; ruhen me "Ruaj".</p>
        </div>
        <div className="wm-preview" aria-label="Parapamja e faturës">
          <div className="wm-preview-inner">
            <InvoiceDocument invoice={SAMPLE} settings={{ ...settings, fatura: { ...settings.fatura, ...d } }} format="a4" />
          </div>
        </div>
      </div>
      <SaveBar form={form} onSave={onSave} />
    </div>
  )
}

/** Fatura shembull për parapamjen e watermark-ut. */
const SAMPLE = {
  numriTekst: '0001',
  statusi: 'pa_paguar',
  data: new Date(),
  monedha: 'LEK',
  klient: { emri: 'KLIENT SHEMBULL', qyteti: 'TIRANË' },
  rreshtat: [
    { emri: 'Artikull shembull 1', sasia: 12, njesia: 'copë', cmimi: 35000, totali: 420000 },
    { emri: 'Artikull shembull 2', sasia: 6, njesia: 'copë', cmimi: 26000, totali: 156000 },
    { emri: 'Artikull shembull 3', sasia: 3, njesia: 'copë', cmimi: 52000, totali: 156000 },
  ],
  nentotali: 732000,
  totali: 732000,
  gjendjaPara: 0,
  paguar: 0,
  gjendjaRe: 732000,
}
