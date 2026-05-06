// ─────────────────────────────────────────────────────────────────────
// totpCookie — helpers for the orin_totp short-lived cookie that gates
// sensitive admin actions.
//
// The edge fn admin-totp-verify sets a non-httpOnly cookie `orin_totp`
// with a 4h max-age. We mirror its presence + expiry locally because
// the cookie itself is opaque (random uuid). On verify success, the
// admin app calls setTotpCookie() to record the expiry timestamp in
// localStorage; the gate component reads from there.
//
// Why mirror in localStorage: cookie max-age is set by the server but
// the SPA can\'t introspect a Set-Cookie response in detail. We trust
// the edge fn\'s response body for `expires_in` and store the deadline.
// ─────────────────────────────────────────────────────────────────────

const KEY = 'orin_totp_expires_at'

/** Record the cookie's expiry (in seconds-from-now). */
export function setTotpCookie(expiresInSeconds) {
  const now = Date.now()
  const at  = now + Math.max(0, expiresInSeconds * 1000)
  try { localStorage.setItem(KEY, String(at)) } catch { /* private mode */ }
}

/** True iff a fresh totp cookie exists (i.e. we're inside the 4h window). */
export function hasFreshTotpCookie() {
  try {
    const at = Number(localStorage.getItem(KEY) || 0)
    if (!at) return false
    return Date.now() < at
  } catch {
    return false
  }
}

/** Seconds remaining until the cookie expires (0 if already expired). */
export function totpCookieRemaining() {
  try {
    const at = Number(localStorage.getItem(KEY) || 0)
    if (!at) return 0
    return Math.max(0, Math.floor((at - Date.now()) / 1000))
  } catch {
    return 0
  }
}

export function clearTotpCookie() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
