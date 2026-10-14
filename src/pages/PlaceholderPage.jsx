import { Construction } from 'lucide-react'

export default function PlaceholderPage({ module }) {
  return (
    <div>
      <h1 className="page-title">{module.label}</h1>
      <div className="card center placeholder">
        <Construction size={40} />
        <h2>Në ndërtim</h2>
        <p className="muted">Ky modul ndërtohet në Fazën {module.phase}.</p>
      </div>
    </div>
  )
}
