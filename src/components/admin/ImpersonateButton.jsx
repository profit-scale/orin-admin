import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Modal from '../ui/Modal'

/**
 * "Login as user X" UX. Calls the `admin-impersonate` edge function which
 * is responsible for issuing a magic link / signed URL bound to the target
 * user. We open that URL in a new tab.
 *
 * Props:
 *   - targetUserId : UUID (required)
 *   - targetOrgId  : UUID (optional — included in audit metadata)
 *   - userLabel    : string (display name / email)
 *   - className    : extra classes for the trigger button
 *   - children     : optional custom trigger content (defaults to "Login as <label>")
 *   - size         : 'sm' | 'md'  (button size, default 'md')
 */
export default function ImpersonateButton({
  targetUserId,
  targetOrgId,
  userLabel,
  className = '',
  children,
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function onConfirm() {
    setError(null)
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-impersonate', {
        body: {
          target_user_id: targetUserId,
          target_org_id: targetOrgId || null,
        },
      })
      if (error) {
        // Edge function not deployed (404) or 501 not-implemented.
        const msg = (error.message || '').toLowerCase()
        const status = error.context?.status || error.status
        if (status === 404 || status === 501 || msg.includes('not found') || msg.includes('failed to fetch')) {
          setError('Impersonation is not yet deployed — the admin-impersonate edge function is missing. Wait for the platform team to ship it.')
        } else {
          setError(error.message || 'Impersonation failed')
        }
        return
      }
      const url = data?.magic_link
      if (!url) {
        setError('Edge function returned no magic link. This indicates a misconfiguration.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      setSuccess(true)
      // Close after a short pause so the user sees the success message.
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
      }, 800)
    } catch (e) {
      setError(e?.message || 'Unexpected error invoking admin-impersonate')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setError(null)
    setSuccess(false)
  }

  const sizeCls = size === 'sm'
    ? 'px-2.5 py-1 text-[11px]'
    : 'px-3 py-1.5 text-xs'

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true) }}
        className={[
          'inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-400/60 transition whitespace-nowrap',
          sizeCls,
          className,
        ].join(' ')}
      >
        <LogIn className="w-3.5 h-3.5" />
        {children || (userLabel ? `Login as ${userLabel}` : 'Login as user')}
      </button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Impersonate user"
        footer={
          <>
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy || success}
              className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50"
            >
              {busy ? 'Generating link…' : success ? 'Opened in new tab' : 'Continue'}
            </button>
          </>
        }
      >
        <p className="mb-3">
          You're about to log in as{' '}
          <span className="text-slate-100 font-medium">{userLabel || 'this user'}</span>.
          This action will be recorded in the admin audit log.
        </p>
        <ul className="text-xs text-slate-400 list-disc pl-4 space-y-1 mb-3">
          <li>A signed magic link will open in a new tab.</li>
          <li>Use it to view the customer's app — do not modify customer data without a clear support reason.</li>
          <li>Your sign-out from the customer session does not affect this admin session.</li>
        </ul>
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            Link opened in a new tab.
          </div>
        )}
      </Modal>
    </>
  )
}
