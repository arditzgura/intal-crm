import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db, getCompanyId, LEGACY_COMPANY_ID } from '../firebase'
import { addAudit } from './auditService'
import { RATE_SCALE } from '../utils/money'

const settingsRef = () => doc(db, 'companies', getCompanyId(), 'settings', 'main')
const counterRef = (key) => doc(db, 'companies', getCompanyId(), 'counters', key)

export const INVOICE_LABELS = [
  ['fatura', 'FATURË'],
  ['klienti', 'KLIENTI'],
  ['artikulli', 'ARTIKULLI'],
  ['sasia', 'SASIA'],
  ['cmimi', 'ÇMIMI'],
  ['nentotali', 'NËNTOTALI'],
  ['totali', 'TOTALI'],
  ['gjendja', 'GJENDJA'],
  ['paguar', 'PAGUAR'],
  ['detyrimi', 'DETYRIMI'],
  ['teprica', 'TEPRICA'],
  ['falenderim', 'FALEMINDERIT QË NA BESUAT!'],
  ['besnikeria', 'RAPORTI I BESNIKËRISË: BLERJET GRUMBULLOJNË PIKË QË MUND TË PËRDOREN SI ZBRITJE NË TË ARDHMEN.'],
]

export const INVOICE_TEMPLATES = [
  { value: 'klasik', label: 'Klasik (INTAL)' },
  { value: 'standard', label: 'Standard' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
]

export const INVOICE_FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Times New Roman', 'Courier New']

export const COUNTER_KEYS = { invoices: 'Faturat', purchases: 'Hyrjet e mallit' }

export const DEFAULT_SETTINGS = {
  kompania: {
    emri: 'INTAL ALBANIA',
    nipt: '',
    adresa: '',
    telefoni: '',
    email: '',
    website: '',
    slogani: '',
    banka: '',
    iban: '',
    logo: '', // base64 data URL, max ~200 KB
    instagram: '@intalalbania',
  },
  fatura: {
    shablloni: 'klasik',
    fonti: 'Arial',
    madhesiaFontit: 12,
    gjeresiaTermike: 80, // mm
    watermark: '', // imazhi i watermark-ut (base64), më vete nga logoja
    watermarkMadhesia: 50, // % e faqes
    watermarkTransparenca: 10, // %
  },
  etiketat: Object.fromEntries(INVOICE_LABELS),
  numerimi: {
    invoices: { prefiksi: '', shifra: 0 }, // shifra = sa shifra minimalisht (0 = pa mbushje)
    purchases: { prefiksi: 'H-', shifra: 4 },
  },
  monedhat: {
    // Kurset ×RATE_SCALE (numra të plotë)
    EUR: 100 * RATE_SCALE,
    USD: 92 * RATE_SCALE,
  },
  piket: { lekPerPike: 100 },
  kategorite: {
    artikuj: [
      { emri: 'Meshkuj', nen: ['Mbathje', 'Kanatjere'] },
      { emri: 'Femra', nen: ['Mbathje', 'Kanatjere'] },
      { emri: 'Fëmijë', nen: ['Mbathje', 'Kanatjere'] },
      { emri: 'Stinore', nen: [] },
    ],
    blerje: ['Lëndë e parë', 'Aksesorë', 'Mall'],
    origjinat: ['Magazina Qendrore'], // origjinat e brendshme të hyrjeve (pa detyrim)
    shpenzime: ['Paga', 'Qira', 'Energji', 'Transport', 'Të tjera'],
  },
}

/** Bashkon cilësimet e ruajtura me vlerat parazgjedhur (për fusha të reja). */
export function withDefaults(stored = {}) {
  const out = {}
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const val = stored[key]
    out[key] =
      def && typeof def === 'object' && !Array.isArray(def) && val && typeof val === 'object'
        ? { ...def, ...val }
        : (val ?? def)
  }
  return out
}

export function watchSettings(onData, onError) {
  return onSnapshot(
    settingsRef(),
    (snap) => onData(withDefaults(snap.exists() ? snap.data() : {})),
    onError,
  )
}

/** Ruan një seksion të cilësimeve (p.sh. 'kompania') dhe e shkruan te auditLog. */
export async function saveSettingsSection(section, value, actorName) {
  const batch = writeBatch(db)
  batch.set(
    settingsRef(),
    { [section]: value, ndryshuar: serverTimestamp() },
    { merge: true },
  )
  const details = { seksioni: section }
  // Logoja nuk futet te log-u (është e madhe).
  if (section === 'kompania') details.vlerat = { ...value, logo: value.logo ? '[logo]' : '' }
  else details.vlerat = value
  addAudit(batch, { action: 'ndryshim_cilesimesh', entity: 'settings', entityId: 'main', details, actorName })
  await batch.commit()
}

export async function getCounters() {
  const out = {}
  for (const key of Object.keys(COUNTER_KEYS)) {
    const snap = await getDoc(counterRef(key))
    out[key] = snap.exists() ? snap.data().next : 1
  }
  return out
}

/**
 * Vendos numrin e radhës për faturat/hyrjet. Gjenerimi i numrave bëhet me
 * transaction te shërbimi i faturave (Faza 3); këtu vetëm konfigurohet.
 */
export async function setCounter(key, next, actorName) {
  const batch = writeBatch(db)
  batch.set(counterRef(key), { next, ndryshuar: serverTimestamp() }, { merge: true })
  addAudit(batch, { action: 'ndryshim_numeruesi', entity: 'counters', entityId: key, details: { next }, actorName })
  await batch.commit()
}

/** Krijon cilësimet dhe numëruesit parazgjedhur nëse mungojnë. */
export async function ensureCompanyInitialized(actorName) {
  const batch = writeBatch(db)
  let changed = false
  if (!(await getDoc(settingsRef())).exists()) {
    // Kompanitë e reja marrin emrin e tyre (nga companies/{id}); INTAL mbetet me parazgjedhjet.
    const company = getCompanyId() === LEGACY_COMPANY_ID ? null : (await getDoc(doc(db, 'companies', getCompanyId()))).data()
    const kompania = company ? { ...DEFAULT_SETTINGS.kompania, emri: company.emri, instagram: '' } : DEFAULT_SETTINGS.kompania
    batch.set(settingsRef(), { ...DEFAULT_SETTINGS, kompania, krijuar: serverTimestamp() })
    changed = true
  }
  for (const key of Object.keys(COUNTER_KEYS)) {
    if (!(await getDoc(counterRef(key))).exists()) {
      batch.set(counterRef(key), { next: 1 })
      changed = true
    }
  }
  if (!changed) return
  addAudit(batch, { action: 'konfigurim_fillestar', entity: 'settings', entityId: 'main', actorName })
  await batch.commit()
}

/** Formaton një numër dokumenti sipas cilësimeve: {prefiksi:'H-', shifra:4}, 7 → "H-0007". */
export function formatDocNumber(format, n) {
  const num = format?.shifra ? String(n).padStart(format.shifra, '0') : String(n)
  return `${format?.prefiksi ?? ''}${num}`
}
