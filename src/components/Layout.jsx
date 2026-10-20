import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { useSettings } from '../hooks/useSettings'
import { useAuth } from '../hooks/useAuth'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { settings } = useSettings()
  const { profile } = useAuth()
  // Admini i një kompanie të re: plotëso emrin, mbiemrin dhe emrin e përdoruesit
  const incomplete = profile?.duhetVerifikim && !profile?.emriPare && location.pathname !== '/profili'

  // Në telefon, menuja mbyllet pas çdo navigimi.
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className={`app ${open ? 'menu-open' : ''}`}>
      <Sidebar />
      <div className="backdrop" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Hap menunë">
            <Menu size={22} />
          </button>
          <span className="topbar-title">{settings.kompania.emri || 'INTAL PRO'}</span>
        </header>
        <main className="content">
          {incomplete && (
            <div className="alert info">
              Mirë se erdhët! Plotësoni emrin, mbiemrin dhe emrin e përdoruesit te <Link to="/profili">Profili</Link>,
              pastaj emrin e kompanisë te <Link to="/cilesimet">Cilësimet</Link>.
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
