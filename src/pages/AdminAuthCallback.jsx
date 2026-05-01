import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, ShieldOff, LogOut } from 'lucide-react'
import { supabase } from '../services/supabase'

/**
 * OAuth round-trip handler. Supabase redirects to /auth/callback after
 * Google sign-in, with either:
 *   - a `code` query param (PKCE / authorization-code flow)
 *   - or a hash containing access_token (implicit flow — handled by
 *     `detectSessionInUrl: true` in our supabase client config)
 *
 * We:
 *   1. Exchange the code if present.
 *   2. Wait for a session.
 *   3. Check is_super_admin().
 *   4. Route accordingly.
 *
 * This route is mounted OUTSIDE the AdminGate so unauthenticated users
 * can complete the OAuth flow.
 */
export default function AdminAuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('working') // 'working' | 'denied' | 'error'
  const [errorMessage, setErrorMessage] = useState(null)
  const [userEmail, setUserEmail] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const url = new URL(window.location.href)

        // 1. If there's an OAuth error in the URL, surface it immediately.
        const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error')
        if (oauthError) {
          if (!cancelled) {
            setErrorMessage(decodeURIComponent(oauthError))
            setStatus('error')
          }
          return
        }

        // 2. Exchange code for session if present (PKCE flow).
        const code = url.searchParams.get('code')
        if (code && typeof supabase.auth.exchangeCodeForSession === 'function') {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
          if (error) {
            if (!cancelled) {
              setErrorMessage(error.message || 'Failed to exchange OAuth code')
              setStatus('error')
            }
            return
          }
        }

        // 3. Pull the (now-established) session.
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return

        if (!session?.user) {
          // Hash-based implicit flow may still be settling — give detectSessionInUrl a tick.
          await new Promise((r) => setTimeout(r, 300))
          const { data: { session: retry } } = await supabase.auth.getSession()
          if (cancelled) return
          if (!retry?.user) {
            setErrorMessage('No session was established after sign-in.')
            setStatus('error')
            return
          }
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        setUserEmail(user?.email || null)

        // 4. Verify super-admin.
        const { data: isAdmin, error: rpcError } = await supabase.rpc('is_super_admin')
        if (cancelled) return

        if (rpcError) {
          // Treat RPC failure as not-an-admin but tell the user why.
          setErrorMessage(`Access verification failed: ${rpcError.message}`)
          setStatus('denied')
          return
        }

        if (isAdmin) {
          navigate('/', { replace: true })
        } else {
          setStatus('denied')
        }
      } catch (e) {
        if (cancelled) return
        setErrorMessage(e?.message || String(e))
        setStatus('error')
      }
    }

    run()
    return () => { cancelled = true }
  }, [navigate])

  if (status === 'working') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm">Completing sign-in…</p>
        </div>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 mb-5">
            <ShieldOff className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-2">Access denied</h1>
          <p className="text-slate-400 mb-2">
            This portal is for Orin staff only.
          </p>
          {userEmail && (
            <p className="text-slate-500 text-sm mb-6">
              Your account (<span className="text-slate-300">{userEmail}</span>) is signed in
              but is not authorized as a super admin.
            </p>
          )}
          {errorMessage && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
              {errorMessage}
            </p>
          )}
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              navigate('/login', { replace: true })
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // status === 'error'
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold text-slate-100 mb-2">Sign-in failed</h1>
        <p className="text-slate-400 mb-4">
          We couldn’t complete the OAuth flow.
        </p>
        {errorMessage && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-5 break-words">
            {errorMessage}
          </p>
        )}
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition"
        >
          Back to sign-in
        </Link>
      </div>
    </div>
  )
}
