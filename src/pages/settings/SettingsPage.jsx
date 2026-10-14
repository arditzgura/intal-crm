import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useSettings } from '../../hooks/useSettings'
import { ensureCompanyInitialized } from '../../services/settingsService'
import CompanyTab from './CompanyTab'
import InvoiceLookTab from './InvoiceLookTab'
import LabelsTab from './LabelsTab'
import NumberingTab from './NumberingTab'
import CurrencyTab from './CurrencyTab'
import CategoriesTab from './CategoriesTab'
import UsersTab from './UsersTab'
import ImportTab from './ImportTab'

const TABS = [
  { key: 'kompania', label: 'Kompania', Component: CompanyTab },
  { key: 'fatura', label: 'Pamja e faturës', Component: InvoiceLookTab },
  { key: 'etiketat', label: 'Etiketat', Component: LabelsTab },
  { key: 'numerimi', label: 'Numërimi', Component: NumberingTab },
  { key: 'monedhat', label: 'Monedhat & Pikët', Component: CurrencyTab },
  { key: 'kategorite', label: 'Kategoritë', Component: CategoriesTab },
  { key: 'perdoruesit', label: 'Përdoruesit', Component: UsersTab },
  { key: 'importi', label: 'Importi', Component: ImportTab },
]

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const { profile } = useAuth()
  const { loading, error } = useSettings()
  const active = TABS.find((t) => t.key === params.get('skeda')) ?? TABS[0]

  useEffect(() => {
    ensureCompanyInitialized(profile?.emri).catch((err) => console.warn(err))
  }, [profile?.emri])

  return (
    <div>
      <h1 className="page-title">Cilësimet</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            className={`tab ${t.key === active.key ? 'active' : ''}`}
            onClick={() => setParams({ skeda: t.key })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <div className="alert error">Cilësimet nuk u ngarkuan: {error.message}</div>}
      {loading ? <div className="card muted">Duke u ngarkuar…</div> : <active.Component />}
    </div>
  )
}
