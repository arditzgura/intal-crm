// Rolet dhe lejet. Burimi i vetëm për UI-në; të njëjtat rregulla zbatohen
// edhe te firestore.rules.

export const ROLES = {
  admin: 'Admin',
  shites: 'Shitës',
  finance: 'Financë',
  magazinier: 'Magazinier',
}

export const ROLE_KEYS = Object.keys(ROLES)

// Rubrikat e sidebar-it, me rolet që i shohin.
// `phase` = faza e SPEC.md ku ndërtohet moduli.
export const MODULES = [
  { key: 'fature-e-re', label: 'Faturë e Re', icon: 'FilePlus2', roles: ['admin', 'shites'], phase: 3, primary: true },
  { key: 'historiku', label: 'Historiku', icon: 'History', roles: ['admin', 'shites', 'finance'], phase: 3 },
  { key: 'kliente', label: 'Klientë', icon: 'Users', roles: ['admin', 'shites', 'finance'], phase: 2 },
  { key: 'artikujt', label: 'Artikujt', icon: 'Package', roles: ['admin', 'shites', 'magazinier'], phase: 2 },
  { key: 'shitjet', label: 'Shitjet (Dalje)', icon: 'TrendingUp', roles: ['admin'], phase: 4 },
  { key: 'blerje', label: 'Blerje (Hyrje)', icon: 'PackagePlus', roles: ['admin', 'finance', 'magazinier'], phase: 4 },
  { key: 'financa', label: 'Financa (Cash Flow)', icon: 'Wallet', roles: ['admin', 'finance'], phase: 5 },
  { key: 'inventari', label: 'Inventari', icon: 'Warehouse', roles: ['admin', 'shites', 'magazinier'], phase: 4 },
  { key: 'raporte', label: 'Raporte', icon: 'BarChart3', roles: ['admin', 'finance'], phase: 5 },
  { key: 'cilesimet', label: 'Cilësimet', icon: 'Settings', roles: ['admin'], phase: 1 },
]

export function canAccess(role, moduleKey) {
  const mod = MODULES.find((m) => m.key === moduleKey)
  return !!mod && mod.roles.includes(role)
}

export function modulesForRole(role) {
  return MODULES.filter((m) => m.roles.includes(role))
}

export function homePathForRole(role) {
  const first = modulesForRole(role)[0]
  return first ? `/${first.key}` : '/profili'
}

// Leje të veçanta
export const canSeeCost = (role) => role !== 'shites'
export const canAdjustBalance = (role) => role === 'admin' || role === 'finance'
