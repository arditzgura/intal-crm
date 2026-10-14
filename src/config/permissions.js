// Lejet për çdo përdorues. Admini i vendos kur krijon përdoruesin dhe mund
// t'i ndryshojë më vonë. Ruhen te users/{uid}.lejet (listë çelësash).
// Të njëjtat çelësa dhe shabllone janë te firestore.rules (roleDefaults) –
// mbaji të sinkronizuara.

export const PERMISSION_GROUPS = [
  {
    label: 'Rubrikat që sheh',
    items: [
      ['mod_fature_e_re', 'Faturë e Re'],
      ['mod_historiku', 'Historiku'],
      ['mod_kliente', 'Klientë'],
      ['mod_artikujt', 'Artikujt'],
      ['mod_shitjet', 'Shitjet (Dalje)'],
      ['mod_blerje', 'Blerje (Hyrje)'],
      ['mod_financa', 'Financa (Cash Flow)'],
      ['mod_inventari', 'Inventari'],
      ['mod_raporte', 'Raporte'],
    ],
  },
  {
    label: 'Faturat',
    items: [
      ['fature_leshim', 'Krijo drafte dhe lësho fatura'],
      ['anulim_fature', 'Anulo fatura (me arsye)'],
      ['sheh_logun', 'Sheh log-un e të gjitha veprimeve'],
    ],
  },
  {
    label: 'Klientë',
    items: [
      ['kliente_ndrysho', 'Krijo / ndrysho klientë'],
      ['pagese', 'Regjistro pagesë'],
      ['levizje_kartele', 'Kthim / zbritje / postë'],
      ['rregullim_gjendjeje', 'Rregullim gjendjeje dhe gjendje fillestare'],
      ['piket', 'Rregullim pikësh'],
    ],
  },
  {
    label: 'Blerje dhe Inventari',
    items: [
      ['blerje_regjistro', 'Regjistro hyrje malli'],
      ['blerje_anulo', 'Anulo hyrje malli (me arsye)'],
      ['inventar_rregullim', 'Rregullim / inventarizim stoku'],
    ],
  },
  {
    label: 'Artikujt',
    items: [
      ['artikuj_ndrysho', 'Krijo / ndrysho artikuj dhe çmime preferenciale'],
      ['sheh_koston', 'Sheh koston (çmimin e blerjes) dhe fitimin'],
    ],
  },
]

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([k]) => k))
export const PERMISSION_LABELS = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.items))

// Shabllonet: plotësojnë kutitë kur krijohet përdoruesi.
export const TEMPLATES = {
  shites: {
    label: 'Shitës',
    lejet: ['mod_fature_e_re', 'mod_historiku', 'mod_kliente', 'mod_artikujt', 'mod_inventari', 'fature_leshim', 'kliente_ndrysho', 'pagese'],
  },
  finance: {
    label: 'Financë',
    lejet: ['mod_historiku', 'mod_kliente', 'mod_blerje', 'mod_financa', 'mod_raporte', 'pagese', 'levizje_kartele', 'rregullim_gjendjeje', 'piket', 'sheh_koston', 'blerje_regjistro'],
  },
  magazinier: {
    label: 'Magazinier',
    lejet: ['mod_artikujt', 'mod_blerje', 'mod_inventari', 'artikuj_ndrysho', 'sheh_koston', 'blerje_regjistro', 'inventar_rregullim'],
  },
  personalizuar: { label: 'I personalizuar', lejet: [] },
}

/**
 * Lejet efektive të një profili si Set.
 * Admin → të gjitha. Përdoruesit e vjetër pa `lejet` → shablloni i rolit.
 */
export function permissionsOf(profile) {
  if (!profile) return new Set()
  if (profile.roli === 'admin') return new Set([...ALL_PERMISSIONS, 'admin'])
  return new Set(Array.isArray(profile.lejet) ? profile.lejet : (TEMPLATES[profile.roli]?.lejet ?? []))
}
