import { onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { companyCol, companyDoc, newDocRef } from './paths'
import { addAudit } from './auditService'
import { millis } from '../utils/date'

/** Lëvizjet e pikëve të një klienti (më e reja e para). */
export function watchClientPoints(clientId, onData, onError) {
  return onSnapshot(
    query(companyCol('loyaltyPoints'), where('clientId', '==', clientId)),
    (snap) =>
      onData(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => millis(b.krijuar) - millis(a.krijuar)),
      ),
    onError,
  )
}

/**
 * Rregullim pikësh me dorë (me arsye). Pikët e fituara nga faturat shtohen
 * automatikisht në Fazën 3. "Klient Rastësor" nuk mbledh pikë.
 */
export async function adjustPoints({ clientId, pike, arsye, tipi = 'rregullim' }, actorName) {
  if (!Number.isInteger(pike) || pike === 0) throw new Error('Pikët duhet të jenë numër i plotë, jo zero.')
  if (!arsye?.trim()) throw new Error('Arsyeja është e detyrueshme.')
  const clientRef = companyDoc('clients', clientId)
  const ref = newDocRef('loyaltyPoints')
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(clientRef)
    if (!snap.exists()) throw new Error('Klienti nuk ekziston.')
    const client = snap.data()
    if (client.rastesor) throw new Error('Klienti Rastësor nuk mbledh pikë.')
    const para = client.piket ?? 0
    const pas = para + pike
    if (pas < 0) throw new Error(`Klienti ka vetëm ${para} pikë.`)
    tx.set(ref, {
      clientId,
      tipi,
      pike,
      piketPara: para,
      piketPas: pas,
      arsye: arsye.trim(),
      uid: auth.currentUser.uid,
      emri: actorName ?? '',
      krijuar: serverTimestamp(),
    })
    tx.update(clientRef, { piket: pas, lastPointsId: ref.id })
    addAudit(tx, { action: 'pike_rregullim', entity: 'loyaltyPoints', entityId: ref.id, details: { clientId, pike, arsye: arsye.trim() }, actorName })
  })
}
