// ─────────────────────────────────────────────────────────────────────
// TotpGate — wraps a route or button with a 2FA-required check.
//
// Two ways to use:
//
//   1. Wrap a whole page:
//        <TotpGate><MySensitivePage /></TotpGate>
//      If no fresh totp session, renders an inline prompt that redirects
//      to /security/2fa?mode=verify&return=<current-path>.
//
//   2. Programmatic check before an action:
//        const ok = await TotpGate.requireFresh()
//        if (!ok) return  // user got redirected
//        ... do sensitive thing ...
//
// SECURITY: as of mig 150 the freshness check is server-side. We call
// /admin-totp-check, which validates the session token from the cookie
// against super_admins.totp_session_token + bound to the JWT's user_id
// + checks totp_session_expires_at. Setting the cookie value manually
// in DevTools no longer bypasses this — the token has to match what
// the server issued AND match this user's JWT.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '../../services/supabase'

const FUNCTIONS_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://zvopcktyvffcyvbjrisj.supabase.co').replace(/\/$/, '') + '/functions/v1'

// Module-level cache so re-mounts in the same minute don't spam the
// /admin-totp-check endpoint. 60 second TTL.
let _cache = { fresh: null, expires: 0, inflight: null }

export async function checkTotpFresh() {
  const now = Date.now()
  if (_cache.fresh !== null && now < _cache.expires) return _cache.fresh
  if (_cache.inflight) return _cache.inflight

  _cache.inflight = (async () => {
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      if (!token) return false
      const res = await fetch(`${FUNCTIONS_URL}/admin-totp-check`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) return false
      const body = await res.json().catch(() => ({}))
      const fresh = body?.fresh === true
      _cache.fresh = fresh
      _cache.expires = Date.now() + 60_000
      return fresh
    } catch {
      return false
    } finally {
      _cache.inflight = null
    }
  })()
  return _cache.inflight
}

export function invalidateTotpCache() {
  _cache = { fresh: null, expires: 0, inflight: null }
}

export default function TotpGate({ children, fallback }) {
  const [fresh, setFresh] = useState(null) // null = checking
  const navigate = useNavigate()
  const location = useLocation()

  const tick = useCallback(async () => {
    const ok = await checkTotpFresh()
    setFresh(ok)
  }, [])

  useEffect(() => {
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [tick])

  if (fresh === null) {
    // Still checking — show a tiny inline spinner so the verify form
    // doesn't flash for users who actually have a fresh cookie.
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-slate-500/30 border-t-slate-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (fresh) return children
  if (fallback) return fallback

  const goVerify = () => {
    const back = location.pathname + location.search
    navigate(`/security/2fa?mode=verify&return=${encodeURIComponent(back)}`)
  }

  return (
    <div className="max-w-xl mx-auto py-12">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
        <div className="flex items-start gap-3 mb-3">
          <ShieldAlert className="w-5 h-5 text-amber-300 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-amber-100 mb-1">2FA verification required</h3>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              This area is gated by 2FA. Verify with a 6-digit code from your authenticator
              to continue. Verifications stay valid for 4 hours.
            </p>
          </div>
        </div>
        <button onClick={goVerify}
          className="px-4 py-2 text-xs rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium">
          Verify now
        </button>
      </div>
    </div>
  )
}

/**
 * Programmatic check. Returns Promise<true> if the session is fresh,
 * otherwise navigates to the verify route and returns Promise<false>.
 *
 *   if (!(await TotpGate.requireFresh(navigate, location))) return
 */
TotpGate.requireFresh = async function (navigate, location) {
  const ok = await checkTotpFresh()
  if (ok) return true
  if (navigate) {
    const back = location ? (location.pathname + location.search) : '/'
    navigate(`/security/2fa?mode=verify&return=${encodeURIComponent(back)}`)
  }
  return false
}
