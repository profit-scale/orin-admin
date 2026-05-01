import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

/**
 * Auth hook for the Orin admin portal.
 * Tracks the current Supabase session and verifies super-admin status
 * via the `is_super_admin()` RPC.
 *
 * Returns: { user, isSuperAdmin, loading, signIn, signOut, error }
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const checkSuperAdmin = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('is_super_admin')
      if (rpcError) {
        // RPC missing (migrations not applied) — treat as not-an-admin but surface the error.
        console.warn('[orin-admin] is_super_admin RPC failed:', rpcError.message)
        setError(rpcError)
        return false
      }
      return Boolean(data)
    } catch (e) {
      console.error('[orin-admin] is_super_admin RPC threw:', e)
      setError(e)
      return false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!isMounted) return

      if (session?.user) {
        setUser(session.user)
        const ok = await checkSuperAdmin()
        if (isMounted) setIsSuperAdmin(ok)
      } else {
        setUser(null)
        setIsSuperAdmin(false)
      }
      if (isMounted) setLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return
      if (session?.user) {
        setUser(session.user)
        setLoading(true)
        const ok = await checkSuperAdmin()
        if (isMounted) {
          setIsSuperAdmin(ok)
          setLoading(false)
        }
      } else {
        setUser(null)
        setIsSuperAdmin(false)
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [checkSuperAdmin])

  const signIn = useCallback(async ({ email, password }) => {
    setError(null)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError)
      return { error: signInError }
    }
    return { data }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsSuperAdmin(false)
  }, [])

  return { user, isSuperAdmin, loading, signIn, signOut, error }
}
