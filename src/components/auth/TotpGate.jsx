// ─────────────────────────────────────────────────────────────────────
// TotpGate — wraps a route or button with a 2FA-required check.
//
// Two ways to use:
//
//   1. Wrap a whole page:
//        <TotpGate><MySensitivePage /></TotpGate>
//      If no fresh totp cookie, renders an inline prompt that redirects
//      to /security/2fa?mode=verify&return=<current-path>.
//
//   2. Programmatic check before an action:
//        const ok = await TotpGate.requireFresh()
//        if (!ok) return  // user got redirected
//        ... do sensitive thing ...
//
// The gate is best-effort — the actual security boundary is the SQL
// super-admin gate + audit. This is a UX rail.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { hasFreshTotpCookie } from '../../lib/totpCookie'

export default function TotpGate({ children, fallback }) {
  const [fresh, setFresh] = useState(() => hasFreshTotpCookie())
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Re-check on mount + every minute (cookie may expire while page is open)
    const tick = () => setFresh(hasFreshTotpCookie())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

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
 * Programmatic check. Returns true if the cookie is fresh, otherwise
 * navigates to the verify route and returns false.
 *
 *   import TotpGate from '.../TotpGate'
 *   if (!await TotpGate.requireFresh(navigate, location)) return
 */
TotpGate.requireFresh = function (navigate, location) {
  if (hasFreshTotpCookie()) return true
  if (navigate) {
    const back = location ? (location.pathname + location.search) : '/'
    navigate(`/security/2fa?mode=verify&return=${encodeURIComponent(back)}`)
  }
  return false
}
