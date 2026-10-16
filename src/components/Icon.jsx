import {
  FilePlus2,
  History,
  Users,
  Package,
  TrendingUp,
  PackagePlus,
  Wallet,
  Warehouse,
  BarChart3,
  Settings,
  LayoutDashboard,
} from 'lucide-react'

const ICONS = { FilePlus2, History, Users, Package, TrendingUp, PackagePlus, Wallet, Warehouse, BarChart3, Settings, LayoutDashboard }

export default function Icon({ name, size = 18 }) {
  const C = ICONS[name]
  return C ? <C size={size} strokeWidth={2} /> : null
}
