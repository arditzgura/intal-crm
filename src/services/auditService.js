import { collection, doc, serverTimestamp } from 'firebase/firestore'
import { auth, db, getCompanyId } from '../firebase'

/**
 * Ndërton hyrjen e auditLog-ut. Shkruhet brenda të njëjtit batch/transaction
 * me veprimin, që log-u të mos humbasë kurrë.
 *   writer.set(ref, data)
 */
export function auditEntry({ action, entity, entityId = null, details = {}, actorName = '' }) {
  const ref = doc(collection(db, 'companies', getCompanyId(), 'auditLog'))
  const data = {
    action,
    entity,
    entityId,
    details,
    uid: auth.currentUser?.uid ?? null,
    emri: actorName,
    koha: serverTimestamp(),
  }
  return { ref, data }
}

export function addAudit(writer, entry) {
  const { ref, data } = auditEntry(entry)
  writer.set(ref, data)
}
