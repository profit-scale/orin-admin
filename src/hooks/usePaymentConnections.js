import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

/**
 * Loads `payment_processor_connections` for a single organization.
 *
 * In the admin portal we don't always look at our OWN org — we let the super
 * admin pick which org acts as the "platform org" via a dropdown. This hook
 * accepts an `organizationId` and re-queries when it changes.
 *
 * Returns:
 *   { connections, byProcessorId, loading, error, missingTable, refetch }
 *
 *   - byProcessorId is a Map keyed by processor_id for O(1) lookup from cards.
 *   - missingTable=true means migration 078 isn't applied yet.
 *
 * If `organizationId` is falsy, the hook short-circuits to an empty result so
 * the caller doesn't have to gate the render.
 */
export default function usePaymentConnections(organizationId) {
  const [connections, setConnections]   = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [missingTable, setMissingTable] = useState(false)
  const [reloadKey, setReloadKey]       = useState(0)

  useEffect(() => {
    if (!organizationId) {
      setConnections([])
      setLoading(false)
      setError(null)
      setMissingTable(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setMissingTable(false)

      const { data, error: err } = await supabase
        .from('payment_processor_connections')
        .select('*')
        .eq('organization_id', organizationId)

      if (cancelled) return

      if (err) {
        if (err.code === '42P01' || /relation .* does not exist/i.test(err.message || '')) {
          setMissingTable(true)
        } else {
          setError(err.message || 'Failed to load connections')
        }
        setConnections([])
      } else {
        setConnections(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [organizationId, reloadKey])

  // Build a Map keyed by processor_id for fast lookups in the gallery.
  const byProcessorId = new Map()
  for (const c of connections) byProcessorId.set(c.processor_id, c)

  return {
    connections,
    byProcessorId,
    loading,
    error,
    missingTable,
    refetch: () => setReloadKey((k) => k + 1),
  }
}
