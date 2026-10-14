import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { useSettings } from '../hooks/useSettings'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { settings } = useSettings()

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
          <Outlet />
        </main>
      </div>
    </div>
  )
}
