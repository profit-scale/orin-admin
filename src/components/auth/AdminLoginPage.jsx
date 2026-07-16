import { useState } from 'react'
import { Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../services/supabase'

// Inline Google "G" mark — no extra dep, official 4-color glyph.
function GoogleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.5 16.3 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C41.5 36.5 44 30.8 44 24c0-1.2-.1-2.4-.4-3.5z"/>
    </svg>
  )
}

export default function AdminLoginPage({ auth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [oauthSubmitting, setOauthSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [mode, setMode] = useState('signin') // 'signin' | 'forgot'
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    const { error } = await auth.signIn({ email, password })
    setSubmitting(false)
    if (error) setFormError(error.message || 'Sign-in failed')
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setFormError(null)
    if (!email) { setFormError('Enter your email first'); return }
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/reset',
    })
    setSubmitting(false)
    if (error) setFormError(error.message || 'Could not send the reset email')
    else setResetSent(true)
  }

  const handleGoogle = async () => {
    setFormError(null)
    setOauthSubmitting(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    })
    if (error) {
      setOauthSubmitting(false)
      setFormError(error.message || 'Google sign-in failed')
    }
    // On success the browser navigates to Google — no need to setSubmitting(false).
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center">
            <img src="/brand/orin-mark.png" alt="" width="56" height="56" draggable={false} className="h-14 w-auto select-none mb-3" />
            <span className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              ORIN
            </span>
            <span className="mt-1 text-[10px] tracking-[0.3em] text-indigo-400/80 font-medium">
              ADMIN PORTAL
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 shadow-2xl shadow-indigo-950/40">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-4 h-4 text-indigo-400" />
            <h1 className="text-base font-medium text-slate-100">
              {mode === 'forgot' ? 'Reset your password' : 'Staff sign in'}
            </h1>
          </div>

          {mode === 'forgot' ? (
            resetSent ? (
              <div className="py-4 text-center space-y-3">
                <CheckCircle2 className="w-9 h-9 text-emerald-400 mx-auto" />
                <p className="text-sm text-slate-200">Check your email</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  If an account exists for <span className="text-slate-300">{email}</span>, we&apos;ve sent a link to set a new password.
                </p>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setResetSent(false); setFormError(null) }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter your staff email and we&apos;ll send you a link to set a new password.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                  <input
                    type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none transition"
                    placeholder="you@orinsuite.com"
                  />
                </div>
                {formError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{formError}</div>
                )}
                <button
                  type="submit" disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/40"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send reset link
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setFormError(null) }}
                  className="w-full text-center text-[11px] text-slate-500 hover:text-slate-300 transition"
                >
                  Back to sign in
                </button>
              </form>
            )
          ) : (
            <>
              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={oauthSubmitting || submitting}
                className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-medium transition disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-black/20"
              >
                {oauthSubmitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <GoogleIcon className="w-4 h-4" />
                }
                <span className="text-sm">Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">or</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                  <input
                    type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none transition"
                    placeholder="you@orinsuite.com"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-400">Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setFormError(null) }}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password" required autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none transition"
                    placeholder="••••••••"
                  />
                </div>

                {formError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || oauthSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/40"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Sign in
                </button>
              </form>

              <p className="mt-5 text-[11px] text-slate-500 text-center leading-relaxed">
                Access is restricted to Orin staff. Sign in with the email associated with
                your super-admin account.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
