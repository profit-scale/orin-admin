import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../services/supabase'

// Landing page for the Supabase password-recovery link. supabase-js parses the
// recovery token from the URL on load (detectSessionInUrl) and establishes a
// temporary session; we then let the admin set a new password via updateUser.
export default function AdminResetPassword() {
  const navigate = useNavigate()
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data?.session) setHasSession(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true)
    })
    return () => { mounted = false; subscription?.unsubscribe() }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    const { error: updErr } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updErr) {
      setError(updErr.message || 'Could not update the password. The link may have expired — request a new one.')
      return
    }
    setDone(true)
    setTimeout(() => navigate('/', { replace: true }), 1600)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/brand/orin-mark.png" alt="" width="56" height="56" draggable={false} className="h-14 w-auto select-none mb-3 mx-auto" />
          <span className="block text-3xl font-semibold tracking-tight bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">ORIN</span>
          <span className="mt-1 block text-[10px] tracking-[0.3em] text-indigo-400/80 font-medium">ADMIN PORTAL</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 shadow-2xl shadow-indigo-950/40">
          {done ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-slate-100 font-medium">Password updated</p>
              <p className="text-xs text-slate-500">Signing you in…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-5">
                <Lock className="w-4 h-4 text-indigo-400" />
                <h1 className="text-base font-medium text-slate-100">Set a new password</h1>
              </div>

              {!hasSession && (
                <div className="mb-4 flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Open this page from the reset link in your email. If you typed the URL directly, it won&apos;t work.
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">New password</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none transition"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none transition"
                    placeholder="Re-enter password"
                  />
                </div>

                {error && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/40"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update password
                </button>
              </form>

              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="mt-4 w-full text-center text-[11px] text-slate-500 hover:text-slate-300 transition"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
