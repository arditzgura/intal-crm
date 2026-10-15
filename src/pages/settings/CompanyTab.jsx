import { useRef, useState } from 'react'
import { useSectionForm } from '../../hooks/useSectionForm'
import { compressLogo, logoSizeKb } from '../../utils/image'
import SaveBar from './SaveBar'

const FIELDS = [
  ['emri', 'Emri i kompanisë'],
  ['nipt', 'NIPT'],
  ['adresa', 'Adresa'],
  ['telefoni', 'Telefoni'],
  ['email', 'Email'],
  ['website', 'Website'],
  ['slogani', 'Slogani'],
  ['banka', 'Banka'],
  ['iban', 'IBAN'],
  ['instagram', 'Instagram (p.sh. @intalalbania)'],
]

export default function CompanyTab() {
  const form = useSectionForm('kompania')
  const fileRef = useRef(null)
  const [logoError, setLogoError] = useState('')

  async function onLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoError('')
    try {
      form.update({ logo: await compressLogo(file) })
    } catch (err) {
      setLogoError(err.message)
    }
  }

  return (
    <div className="card">
      <div className="grid-2">
        {FIELDS.map(([key, label]) => (
          <label key={key} className="field">
            <span>{label}</span>
            <input value={form.draft[key] ?? ''} onChange={(e) => form.update({ [key]: e.target.value })} />
          </label>
        ))}
      </div>

      <div className="field">
        <span>Logoja (PNG/JPG, kompresohet në max 200 KB)</span>
        <div className="logo-row">
          {form.draft.logo ? (
            <img src={form.draft.logo} alt="Logo" className="logo-preview" />
          ) : (
            <div className="logo-preview empty">Pa logo</div>
          )}
          <div className="logo-actions">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onLogo} />
            <button type="button" className="btn" onClick={() => fileRef.current.click()}>
              Ngarko logo
            </button>
            {form.draft.logo && (
              <>
                <button type="button" className="btn link" onClick={() => form.update({ logo: '' })}>
                  Hiq logon
                </button>
                <span className="muted small">{logoSizeKb(form.draft.logo)} KB</span>
              </>
            )}
          </div>
        </div>
        {logoError && <div className="alert error">{logoError}</div>}
      </div>

      <SaveBar form={form} />
    </div>
  )
}
