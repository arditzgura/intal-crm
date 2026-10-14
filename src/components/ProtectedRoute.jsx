import { useAuth } from '../hooks/useAuth'
import { canAccess } from '../config/roles'

export default function ProtectedRoute({ moduleKey, children }) {
  const { role } = useAuth()
  if (!canAccess(role, moduleKey)) {
    return (
      <div className="card">
        <h2>Nuk keni akses</h2>
        <p className="muted">Roli juaj nuk e lejon këtë rubrikë.</p>
      </div>
    )
  }
  return children
}
