// Paratë ruhen gjithmonë si numra të plotë në njësinë më të vogël
// (qindarka / cent): 990.90 EUR → 99090, 1500 Lek → 150000.
// Ky skedar është i vetmi vend ku bëhet konvertimi tekst ↔ numër i plotë.

export const CURRENCIES = {
  LEK: { label: 'Lek', symbol: 'L' },
  EUR: { label: 'EUR', symbol: '€' },
  USD: { label: 'USD', symbol: '$' },
}

// Kurset ruhen si numra të plotë të shkallëzuar me RATE_SCALE
// (p.sh. 1 EUR = 98.5 Lek → 985000), që të mos ketë presje dhjetore.
export const RATE_SCALE = 10000

/** "1 234,56" / "1234.56" → 123456. Kthen null nëse teksti s'është numër. */
export function parseMoney(text) {
  return parseScaled(text, 2)
}

/**
 * 594000 → "5,940"  ·  123456 → "1,234.56"
 * Mijëshet me presje; qindarkat (me pikë) shfaqen vetëm kur nuk janë zero.
 */
export function formatMoney(minor, currency) {
  if (minor == null || Number.isNaN(minor)) return ''
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(minor))
  const whole = Math.floor(abs / 100)
  const cents = abs % 100
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const text = cents ? `${sign}${wholeStr}.${String(cents).padStart(2, '0')}` : `${sign}${wholeStr}`
  return currency ? `${text} ${CURRENCIES[currency]?.label ?? currency}` : text
}

export function parseRate(text) {
  return parseScaled(text, 4)
}

export function formatRate(scaled) {
  if (scaled == null) return ''
  const whole = Math.floor(scaled / RATE_SCALE)
  const frac = String(scaled % RATE_SCALE).padStart(4, '0').replace(/0+$/, '')
  return frac ? `${whole},${frac}` : String(whole)
}

/** Konverton një shumë (njësi e vogël) në LEK me kursin e shkallëzuar, me rrumbullakim. */
export function toLek(minor, rateScaled) {
  return Math.round((minor * rateScaled) / RATE_SCALE)
}

// Parse pa float: ndan pjesën e plotë dhe dhjetore si tekst.
function parseScaled(text, decimals) {
  if (text == null) return null
  let s = String(text).trim().replace(/\s/g, '')
  if (!s) return null
  const negative = s.startsWith('-')
  if (negative) s = s.slice(1)
  // Ndarësi dhjetor është shenja e fundit "," ose "."; të tjerat janë ndarës mijëshesh.
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  let intPart = s
  let fracPart = ''
  if (lastSep !== -1 && s.length - lastSep - 1 <= decimals) {
    intPart = s.slice(0, lastSep)
    fracPart = s.slice(lastSep + 1)
  }
  intPart = intPart.replace(/[.,]/g, '')
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart) || (!intPart && !fracPart)) return null
  const value = Number(intPart || '0') * 10 ** decimals + Number(fracPart.padEnd(decimals, '0') || '0')
  return negative ? -value : value
}
