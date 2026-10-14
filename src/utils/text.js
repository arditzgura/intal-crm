// Normalizim për kërkim: pa shkronja të mëdha dhe pa diakritikë (ë → e, ç → c).
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** A përmban ndonjë nga fushat të gjitha fjalët e kërkimit? */
export function matchesSearch(query, ...fields) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fields.map(normalize).join(' ')
  return words.every((w) => hay.includes(w))
}
