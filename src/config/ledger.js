// Llojet e lëvizjeve në kartelën e klientit. Duhet të përputhen me firestore.rules.
// sign: +1 rrit borxhin, -1 e ul, 0 = shuma futet me shenjë (rregullim / gjendje fillestare).
// perm: leja e përdoruesit që e lejon (config/permissions.js).

export const LEDGER_TYPES = {
  gjendje_fillestare: { label: 'Gjendje fillestare', sign: 0, perm: 'rregullim_gjendjeje' },
  fature: { label: 'Faturë', sign: 1, perm: null }, // krijohet vetëm nga lëshimi i faturës (Faza 3)
  pagese: { label: 'Pagesë', sign: -1, perm: 'pagese' },
  kthim: { label: 'Kthim malli', sign: -1, perm: 'levizje_kartele' },
  zbritje: { label: 'Zbritje', sign: -1, perm: 'levizje_kartele' },
  poste: { label: 'Postë / transport', sign: 1, perm: 'levizje_kartele' },
  rregullim: { label: 'Rregullim manual i gjendjes', sign: 0, perm: 'rregullim_gjendjeje' },
  anulim: { label: 'Anulim fature', sign: 0, perm: null }, // krijohet vetëm nga anulimi i faturës
  anulim_pagese: { label: 'Anulim pagese', sign: 1, perm: null }, // krijohet vetëm nga heqja e shenjës "E paguar" (fatura e fundit)
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
  anulim_fature: 'Anulim fature',
  anulim_pagese: 'Anulim pagese',
}

// `perms` = Set-i i lejeve nga useAuth()
export const canLedger = (perms, tipi) => !!LEDGER_TYPES[tipi]?.perm && perms.has(LEDGER_TYPES[tipi].perm)
export const canEditClients = (perms) => perms.has('kliente_ndrysho')
export const canEditItems = (perms) => perms.has('artikuj_ndrysho')
export const canAdjustPoints = (perms) => perms.has('piket')
