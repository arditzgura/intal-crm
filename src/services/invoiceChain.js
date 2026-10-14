import { serverTimestamp } from 'firebase/firestore'
import { auth } from '../firebase'
import { companyDoc, newDocRef } from './paths'
import { withDefaults } from './settingsService'
import { toLek } from '../utils/money'

/**
 * Zinxhiri i faturave të një klienti (për monedhë) – "Bartja e gjendjes".
 *
 * - Borxhi mbahet gjithmonë te fatura më e fundit e klientit (`clients.faturaFundit[MONEDHA]`).
 *   Fusha `mbetur` e saj = gjendja aktuale e klientit në atë monedhë.
 * - Statusi:  mbetur ≤ 0 → "e_paguar";  më e fundit me mbetur > 0 → "pa_paguar";
 *   mbetur > 0 e bartur te një faturë më e re → "pasuar".
 * - Kur fatura që mban borxhin bëhet "e_paguar", faturat "pasuar" para saj
 *   (lidhja `faturaPara`) kalojnë në "e_paguar" dhe marrin pikët.
 *
 * Këto funksione përdoren BRENDA transaction-eve (tx); të gjitha leximet
 * bëhen para shkrimeve.
 */

export const ISSUED = ['pa_paguar', 'pasuar', 'e_paguar']

export const STATUS_LABELS = {
  draft: 'Draft',
  pa_paguar: 'Pa paguar',
  pasuar: 'Pasuar',
  e_paguar: 'E paguar',
  anuluar: 'Anuluar',
}

export const invoiceRef = (id) => companyDoc('invoices', id)

export async function readSettings(tx) {
  const snap = await tx.get(companyDoc('settings', 'main'))
  return withDefaults(snap.exists() ? snap.data() : {})
}

/** Lexon një faturë të lëshuar (jo draft, jo të anuluar). */
export async function readIssued(tx, id) {
  if (!id) return null
  const snap = await tx.get(invoiceRef(id))
  if (!snap.exists() || !ISSUED.includes(snap.data().statusi)) return null
  return { id, ref: snap.ref, data: snap.data() }
}

/**
 * Faturat "pasuar" para `inv` në zinxhir (kapërcen të anuluarat), deri te
 * e para që nuk është "pasuar".
 */
export async function readPasuarChain(tx, inv) {
  const out = []
  let id = inv.faturaPara
  for (let i = 0; id && i < 1000; i++) {
    const snap = await tx.get(invoiceRef(id))
    if (!snap.exists()) break
    const d = snap.data()
    if (d.statusi === 'anuluar') {
      id = d.faturaPara
      continue
    }
    if (d.statusi !== 'pasuar') break
    out.push({ id, ref: snap.ref, data: d })
    id = d.faturaPara
  }
  return out
}

/** Pikët e një fature: totali në LEK / (Lek për pikë). */
export function pointsFor(inv, settings) {
  const perPoint = (Number(settings.piket?.lekPerPike) || 100) * 100
  return Math.max(0, Math.floor(toLek(inv.totali, inv.kursi) / perPoint))
}

/** Pikët për faturat që sapo u paguan (vetëm ato që s'kanë marrë ende pikë). */
export function awardPoints(invoices, client, settings) {
  const per = {}
  let total = 0
  if (client.rastesor) return { per, total }
  for (const inv of invoices) {
    if (inv.data.piketDhene) continue
    const p = pointsFor(inv.data, settings)
    if (p > 0) {
      per[inv.id] = p
      total += p
    }
  }
  return { per, total }
}

/**
 * Shkruan një lëvizje pikësh (një për transaction) dhe kthen fushat për klientin.
 * @returns patch për dokumentin e klientit ose {} nëse pike = 0
 */
export function writePointsEntry(tx, { clientId, client, pike, tipi, arsye, invoiceIds }, actorName) {
  if (!pike) return {}
  const ref = newDocRef('loyaltyPoints')
  const para = client.piket ?? 0
  const pas = Math.max(0, para + pike)
  const real = pas - para
  if (!real) return {}
  tx.set(ref, {
    clientId,
    tipi,
    pike: real,
    piketPara: para,
    piketPas: pas,
    arsye,
    invoiceIds,
    uid: auth.currentUser.uid,
    emri: actorName ?? '',
    krijuar: serverTimestamp(),
  })
  return { piket: pas, lastPointsId: ref.id }
}

/** Teksti "#12, #15" për një listë faturash. */
export const numbersText = (invs) => invs.map((i) => `#${i.data.numriTekst ?? i.data.numri}`).join(', ')

/**
 * Përditëson faturën që mban borxhin pas një lëvizjeje me `delta` (shuma me shenjë),
 * dhe faturat "pasuar" para saj nëse borxhi shlyhet. Thirret pas leximeve:
 *   const plan = await planLatestChange(tx, latest, delta)
 *   ... shkrimet ...
 *   const pts = applyLatestChange(tx, plan, client, settings)
 */
export async function planLatestChange(tx, latest, delta) {
  if (!latest) return null
  const mbetur = latest.data.mbetur + delta
  const statusi = mbetur <= 0 ? 'e_paguar' : 'pa_paguar'
  const chain = statusi === 'e_paguar' ? await readPasuarChain(tx, latest.data) : []
  return { latest, mbetur, statusi, chain }
}

/** Shkruan ndryshimet e planit; kthen { per, total, paid } për pikët. */
export function applyLatestChange(tx, plan, client, settings, extra = {}) {
  if (!plan) return { per: {}, total: 0, paid: [] }
  const { latest, mbetur, statusi, chain } = plan
  const paid = statusi === 'e_paguar' ? [latest, ...chain] : []
  const pts = awardPoints(paid, client, settings)
  tx.update(latest.ref, {
    mbetur,
    statusi,
    ...extra,
    ...(pts.per[latest.id] ? { piketDhene: pts.per[latest.id] } : {}),
  })
  for (const c of chain) {
    tx.update(c.ref, { statusi: 'e_paguar', ...(pts.per[c.id] ? { piketDhene: pts.per[c.id] } : {}) })
  }
  return { ...pts, paid }
}
