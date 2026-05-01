import { useState } from 'react'
import { Lock, Loader2 } from 'lucide-react'

export default function AdminLoginPage({ auth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    const { error } = await auth.signIn({ email, password })
    setSubmitting(false)
    if (error) setFormError(error.message || 'Sign-in failed')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center">
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
            <h1 className="text-base font-medium text-slate-100">Staff sign in</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none transition"
                placeholder="you@nctmediagroup.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
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
              disabled={submitting}
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
        </div>
      </div>
    </div>
  )
}
