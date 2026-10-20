// Rolet (etiketa) dhe rubrikat e sidebar-it. Aksesi vendoset nga lejet e
// përdoruesit (config/permissions.js); `perms` është Set-i nga useAuth().

import { TEMPLATES } from './permissions'

export const ROLES = {
  admin: 'Admin',
  ...Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, t.label])),
}

/** Emri i rolit që shfaqet: roli i riemërtuar ("Tjetër +", p.sh. Kontabilist) ose shablloni. */
export const roleLabel = (u) => u?.roliEmer || ROLES[u?.roli] || u?.roli || ''

// `perm` = leja që e shfaq rubrikën; `phase` = faza e SPEC.md ku ndërtohet.
export const MODULES = [
  { key: 'fature-e-re', label: 'Faturë e Re', icon: 'FilePlus2', perm: 'mod_fature_e_re', phase: 3, primary: true },
  { key: 'paneli', label: 'Paneli', icon: 'LayoutDashboard', perm: 'mod_paneli', phase: 6 },
  { key: 'historiku', label: 'Historiku', icon: 'History', perm: 'mod_historiku', phase: 3 },
  { key: 'kliente', label: 'Klientë', icon: 'Users', perm: 'mod_kliente', phase: 2 },
  { key: 'artikujt', label: 'Artikujt', icon: 'Package', perm: 'mod_artikujt', phase: 2 },
  { key: 'shitjet', label: 'Shitjet (Dalje)', icon: 'TrendingUp', perm: 'mod_shitjet', phase: 4 },
  { key: 'blerje', label: 'Blerje (Hyrje)', icon: 'PackagePlus', perm: 'mod_blerje', phase: 4 },
  { key: 'financa', label: 'Financa (Cash Flow)', icon: 'Wallet', perm: 'mod_financa', phase: 5 },
  { key: 'inventari', label: 'Inventari', icon: 'Warehouse', perm: 'mod_inventari', phase: 4 },
  { key: 'raporte', label: 'Raporte', icon: 'BarChart3', perm: 'mod_raporte', phase: 5 },
  { key: 'cilesimet', label: 'Cilësimet', icon: 'Settings', perm: 'admin', phase: 1 },
]

export function canAccess(perms, moduleKey) {
  const mod = MODULES.find((m) => m.key === moduleKey)
  return !!mod && perms.has(mod.perm)
}

export function modulesFor(perms) {
  return MODULES.filter((m) => perms.has(m.perm))
}

export function homePathFor(perms) {
  if (perms.has('mod_paneli')) return '/paneli'
  const first = modulesFor(perms)[0]
  return first ? `/${first.key}` : '/profili'
}

export const canSeeCost = (perms) => perms.has('sheh_koston')
