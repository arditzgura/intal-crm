// Llojet e lëvizjeve në kartelën e klientit. Duhet të përputhen me firestore.rules.
// sign: +1 rrit borxhin, -1 e ul, 0 = shuma futet me shenjë (rregullim / gjendje fillestare).

export const LEDGER_TYPES = {
  gjendje_fillestare: { label: 'Gjendje fillestare', sign: 0, roles: ['admin', 'finance'] },
  fature: { label: 'Faturë', sign: 1, roles: [] }, // krijohet vetëm nga lëshimi i faturës (Faza 3)
  pagese: { label: 'Pagesë', sign: -1, roles: ['admin', 'shites', 'finance'] },
  kthim: { label: 'Kthim malli', sign: -1, roles: ['admin', 'finance'] },
  zbritje: { label: 'Zbritje', sign: -1, roles: ['admin', 'finance'] },
  poste: { label: 'Postë / transport', sign: 1, roles: ['admin', 'finance'] },
  rregullim: { label: 'Rregullim manual i gjendjes', sign: 0, roles: ['admin', 'finance'] },
}

// Lëvizjet që zgjidhen te "Lëvizje tjetër"
export const OTHER_MOVEMENTS = ['kthim', 'zbritje', 'poste']

export const PAYMENT_METHODS = { arke: 'Arkë (cash)', banke: 'Bankë' }

export const CLIENT_TYPES = { klient: 'Klient', furnitor: 'Furnitor', te_dyja: 'Të dyja' }

export const POINT_TYPES = {
  gjendje_fillestare: 'Gjendje fillestare',
  fituar: 'Fituar',
  perdorur: 'Përdorur',
  rregullim: 'Rregullim me dorë',
}

export const canLedger = (role, tipi) => LEDGER_TYPES[tipi]?.roles.includes(role)
export const canEditClients = (role) => role === 'admin' || role === 'shites'
export const canEditItems = (role) => role === 'admin' || role === 'magazinier'
export const canAdjustPoints = (role) => role === 'admin' || role === 'finance'
