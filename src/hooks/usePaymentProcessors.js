import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

/**
 * Loads the global `payment_processors` catalog (read-only for the gallery).
 *
 * The catalog is a global, super-admin-maintained list — RLS lets anyone
 * SELECT, so the admin portal user just queries the table directly.
 *
 * Returns:
 *   { processors, loading, error, missingTable, refetch }
 *
 *   - missingTable=true means migration 078 isn't applied yet. The page-level
 *     UI uses that signal to show the "Apply migration 078" message.
 *   - error is anything else (network, RLS misconfiguration, etc).
 */
export default function usePaymentProcessors() {
  const [processors, setProcessors]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [missingTable, setMissingTable] = useState(false)
  const [reloadKey, setReloadKey]     = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setMissingTable(false)

      const { data, error: err } = await supabase
        .from('payment_processors')
        .select('*')
        .eq('is_enabled', true)
        .order('sort_order', { ascending: true })

      if (cancelled) return

      if (err) {
        // 42P01 = relation does not exist
        if (err.code === '42P01' || /relation .* does not exist/i.test(err.message || '')) {
          setMissingTable(true)
        } else {
          setError(err.message || 'Failed to load payment processors')
        }
        setProcessors([])
      } else {
        setProcessors(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [reloadKey])

  return {
    processors,
    loading,
    error,
    missingTable,
    refetch: () => setReloadKey((k) => k + 1),
  }
}
