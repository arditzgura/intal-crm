import { useEffect, useState } from 'react'

/**
 * Dëgjon një burim live nga services (watchX(onData, onError) → unsubscribe).
 * `deps` rifillojnë dëgjimin; `enabled=false` e çaktivizon (p.sh. pa leje).
 */
export function useLive(watch, deps = [], { enabled = true, initial = null } = {}) {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }
    setLoading(true)
    return watch(
      (d) => {
        setData(d)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return { data, loading, error }
}
