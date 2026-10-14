import { useAuth } from '../hooks/useAuth'
import { canAccess } from '../config/roles'

/** Shfaq faqen nëse përdoruesi ka akses te të paktën një nga modulet. */
export default function ProtectedRoute({ moduleKey, children }) {
  const { perms } = useAuth()
  const keys = Array.isArray(moduleKey) ? moduleKey : [moduleKey]
  if (!keys.some((k) => canAccess(perms, k))) {
    return (
      <div className="card">
        <h2>Nuk keni akses</h2>
        <p className="muted">Lejet tuaja nuk e përfshijnë këtë rubrikë. Kërkojini Administratorit ta aktivizojë.</p>
      </div>
    )
  }
  return children
}
