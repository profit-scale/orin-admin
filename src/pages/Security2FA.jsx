import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ShieldCheck, Smartphone, RefreshCcw, Check, KeyRound, AlertTriangle, Copy,
} from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import { toast } from '../components/ui/Toast'
import { setTotpCookie, hasFreshTotpCookie } from '../lib/totpCookie'
import { invalidateTotpCache } from '../components/auth/TotpGate'

export default function Security2FA() {
  const [params] = useSearchParams()
  const mode = params.get('mode') || 'manage'   // 'manage' | 'verify' | 'enroll'
  const navigate = useNavigate()

  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_my_totp_status')
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      else toast.error('Failed to load 2FA status', { description: error.message })
    } else {
      setStatus((data && data[0]) || null)
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const reset = async () => {
    if (!confirm('Remove your enrollment? You\'ll need to scan a fresh QR code with your authenticator.')) return
    const { error } = await supabase.rpc('admin_my_totp_reset')
    if (error) {
      toast.error('Reset failed', { description: error.message })
      return
    }
    toast.success('Enrollment reset')
    refresh()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-300" />
          Two-factor authentication
        </h1>
        <p className="text-sm text-slate-500">
          A 6-digit code from your authenticator is required to perform sensitive admin actions.
        </p>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 140 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">140_super_admin_totp.sql</code>.
        </Banner>
      )}

      {loading ? (
        <Skeleton width="100%" height={200} rounded="rounded-2xl" />
      ) : (
        <>
          {/* Verify mode — used by gate redirects */}
          {mode === 'verify' && status?.is_enrolled && (
            <VerifyCard
              onSuccess={() => {
                const back = params.get('return') || '/'
                navigate(back, { replace: true })
              }}
            />
          )}

          {/* Enroll mode — first-time setup */}
          {(mode === 'enroll' || (!status?.is_enrolled && mode !== 'verify')) && (
            <EnrollCard
              onEnrolled={() => {
                refresh()
                if (params.get('return')) navigate(params.get('return'), { replace: true })
              }}
            />
          )}

          {/* Manage mode — already enrolled */}
          {mode === 'manage' && status?.is_enrolled && (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-100">2FA is enrolled</div>
                  <div className="text-xs text-slate-500">
                    Enrolled {status.enrolled_at ? new Date(status.enrolled_at).toLocaleString() : '—'}
                    {status.last_verified_at && ` · Last verified ${new Date(status.last_verified_at).toLocaleString()}`}
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-400 leading-relaxed">
                Use your authenticator app to generate the 6-digit code when prompted.
                Verifications stay valid for 4 hours.
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                <button onClick={reset}
                  className="px-3 py-1.5 text-xs rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20">
                  Reset enrollment
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Enrollment flow — first time setup
// ════════════════════════════════════════════════════════════════

function EnrollCard({ onEnrolled }) {
  const [step, setStep] = useState('start')   // start | scan | verify | done
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')
  const [account, setAccount] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const canvasRef = useRef(null)

  const start = async () => {
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-totp-enroll', { body: {} })
      if (error) throw new Error(error.message || 'Enroll failed')
      if (!data?.ok) throw new Error(data?.message || 'Enroll failed')
      setSecret(data.secret); setUri(data.uri); setAccount(data.account)
      setStep('scan')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Render QR
  useEffect(() => {
    if (step !== 'scan' || !uri || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch((e) => setErr('Failed to render QR: ' + e.message))
  }, [step, uri])

  const submitCode = async () => {
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-totp-verify', { body: { code } })
      if (error) throw new Error(error.message || 'Verify failed')
      if (!data?.ok) throw new Error(data?.message || 'Verify failed')
      setTotpCookie(data.expires_in ?? 4 * 3600)
      invalidateTotpCache() // tell TotpGate to recheck server-side on next access
      setStep('done')
      toast.success('2FA enabled')
      setTimeout(() => onEnrolled?.(), 600)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      toast.success('Secret copied')
    } catch { /* ignore */ }
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      {err && <Banner tone="danger">{err}</Banner>}

      {step === 'start' && (
        <>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-100">2FA is not enrolled</div>
              <div className="text-xs text-slate-500">You can still browse, but sensitive actions require enrollment.</div>
            </div>
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">
            You\'ll need an authenticator app — Google Authenticator, 1Password, Authy, or similar.
            We\'ll show you a QR code; scan it, then enter the 6-digit code shown.
          </div>
          <button onClick={start} disabled={busy}
            className="px-4 py-2 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white inline-flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> {busy ? 'Generating…' : 'Begin enrollment'}
          </button>
        </>
      )}

      {step === 'scan' && (
        <>
          <div className="text-sm text-slate-100 font-medium">Scan with your authenticator</div>
          <div className="flex gap-6 items-center">
            <div className="rounded-xl bg-white p-3">
              <canvas ref={canvasRef} />
            </div>
            <div className="flex-1 space-y-3">
              <Field label="Account">
                <div className="text-xs text-slate-200 font-mono">{account}</div>
              </Field>
              <Field label="Or enter this key manually">
                <div className="flex items-center gap-2">
                  <code className="text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 break-all flex-1 font-mono">
                    {secret}
                  </code>
                  <button onClick={copySecret} title="Copy"
                    className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Field>
            </div>
          </div>

          <div className="border-t border-slate-800/60 pt-4">
            <Field label="Enter the 6-digit code from your authenticator">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                className="w-40 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-lg font-mono tracking-widest text-slate-100 text-center" />
            </Field>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={submitCode} disabled={busy || code.length !== 6}
                className="px-4 py-2 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
                {busy ? 'Verifying…' : 'Verify & enable'}
              </button>
              <button onClick={() => { setStep('start'); setSecret(''); setUri(''); setCode('') }}
                className="px-3 py-2 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-100">2FA enabled</div>
            <div className="text-xs text-slate-500">Redirecting…</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Verify-only flow — used by /security/2fa?mode=verify
// ════════════════════════════════════════════════════════════════

function VerifyCard({ onSuccess }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  // If they already have a fresh cookie, skip
  useEffect(() => {
    if (hasFreshTotpCookie()) onSuccess?.()
  }, [onSuccess])

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-totp-verify', { body: { code } })
      if (error) throw new Error(error.message || 'Verify failed')
      if (!data?.ok) throw new Error(data?.message || 'Verify failed')
      setTotpCookie(data.expires_in ?? 4 * 3600)
      invalidateTotpCache() // tell TotpGate to recheck server-side on next access
      toast.success('Verified')
      onSuccess?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-indigo-300" />
        </div>
        <div>
          <div className="text-sm font-medium text-slate-100">Verify with 2FA</div>
          <div className="text-xs text-slate-500">Enter the current 6-digit code from your authenticator.</div>
        </div>
      </div>
      {err && <Banner tone="danger">{err}</Banner>}
      <Field label="Code">
        <input
          value={code}
          autoFocus
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) submit() }}
          inputMode="numeric"
          placeholder="000000"
          className="w-40 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-lg font-mono tracking-widest text-slate-100 text-center" />
      </Field>
      <button onClick={submit} disabled={busy || code.length !== 6}
        className="px-4 py-2 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
        {busy ? 'Verifying…' : 'Verify'}
      </button>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}
