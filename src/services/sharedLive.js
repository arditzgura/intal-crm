import { getCompanyId } from '../firebase'

/**
 * Lidhjet live të përbashkëta (një listener Firestore për çdo burim, për gjithë aplikacionin).
 *
 * Pa këtë, çdo rubrikë hapte lidhjet e veta dhe rilexonte klientët, artikujt, stokun…
 * sa herë hapej (qindra lexime). Me `shared()`:
 *  - listener-i hapet herën e parë që dikush e kërkon dhe MBETET i hapur kur rubrika mbyllet;
 *  - rubrikat e tjera marrin menjëherë vlerën e fundit nga memoria (0 lexime);
 *  - Firestore lexon vetëm dokumentet që ndryshojnë.
 * Çelësi përfshin kompaninë; `resetShared()` i mbyll të gjitha (dalja / ndërrimi i llogarisë).
 */
const stores = new Map()

export function shared(name, start) {
  return (onData, onError) => {
    const key = `${getCompanyId()}|${name}`
    let s = stores.get(key)
    if (!s) {
      s = { subs: new Set(), has: false, value: undefined, unsub: null }
      stores.set(key, s)
    }
    const sub = { onData, onError }
    s.subs.add(sub)
    if (s.has) {
      const value = s.value
      queueMicrotask(() => s.subs.has(sub) && onData(value))
    }
    if (!s.unsub) {
      s.unsub = start(
        (value) => {
          s.value = value
          s.has = true
          for (const x of s.subs) x.onData(value)
        },
        (err) => {
          // P.sh. pa leje: mbyll këtë burim që të provohet sërish herën tjetër.
          stores.delete(key)
          for (const x of s.subs) x.onError?.(err)
        },
      )
    }
    return () => {
      s.subs.delete(sub)
    }
  }
}

/** Mbyll të gjitha lidhjet e përbashkëta (thirret kur përdoruesi del). */
export function resetShared() {
  for (const s of stores.values()) s.unsub?.()
  stores.clear()
}
