import { useAuth } from '../hooks/useAuth'
import { canAccess } from '../config/roles'

export default function ProtectedRoute({ moduleKey, children }) {
  const { perms } = useAuth()
  if (!canAccess(perms, moduleKey)) {
    return (
      <div className="card">
        <h2>Nuk keni akses</h2>
        <p className="muted">Lejet tuaja nuk e përfshijnë këtë rubrikë. Kërkojini Administratorit ta aktivizojë.</p>
      </div>
    )
  }
  return children
}
