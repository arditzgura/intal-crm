import { NavLink } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { roleLabel, modulesFor } from '../config/roles'
import Icon from './Icon'

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export default function Sidebar() {
  const { profile, perms, isSuperAdmin } = useAuth()
  const { settings } = useSettings()
  const modules = modulesFor(perms)
  const primary = modules.find((m) => m.primary)
  const rest = modules.filter((m) => !m.primary)

  return (
    <aside className="sidebar">
      <div className="brand">
        {settings.kompania.logo ? (
          <img src={settings.kompania.logo} alt="" className="brand-logo" />
        ) : (
          <div className="brand-mark">IP</div>
        )}
        <div>
          <div className="brand-name">INTAL PRO</div>
          <div className="brand-sub">CRM & Faturim</div>
        </div>
      </div>

      <nav className="nav">
        {primary && (
          <NavLink to={`/${primary.key}`} className="nav-primary">
            <Icon name={primary.icon} />
            <span>{primary.label}</span>
          </NavLink>
        )}
        {rest.map((m) => (
          <NavLink key={m.key} to={`/${m.key}`} className="nav-item">
            <span className="nav-icon">
              <Icon name={m.icon} />
            </span>
            <span>{m.label}</span>
          </NavLink>
        ))}
        {isSuperAdmin && (
          <NavLink to="/super-admin" className="nav-item">
            <span className="nav-icon"><ShieldCheck size={18} /></span>
            <span>Super-Admin</span>
          </NavLink>
        )}
      </nav>

      <NavLink to="/profili" className="profile">
        <div className="avatar">{initials(profile?.emri)}</div>
        <div className="profile-text">
          <div className="profile-name">{profile?.emri}</div>
          <div className="profile-role">{roleLabel(profile)}</div>
        </div>
      </NavLink>
    </aside>
  )
}
