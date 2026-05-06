import { useState } from 'react'
import { ShieldAlert, Snowflake, Sun, AlertTriangle } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Modal from '../ui/Modal'

function formatDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString() } catch { return s }
}

/**
 * Status pill + Freeze/Unfreeze controls on the org detail page.
 * Reads frozen_at off the org row directly; the parent owns the data
 * fetch and re-fetches via onChanged() after a mutation.
 */
export default function OrgFreezeCard({ org, onChanged }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unfreezeOpen, setUnfreezeOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const isFrozen = !!org?.frozen_at

  async function freeze() {
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('admin_freeze_org', {
        p_org_id: org.id,
        p_reason: reason.trim() || null,
      })
      if (err) throw err
      setConfirmOpen(false)
      setReason('')
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Failed to freeze')
    } finally {
      setBusy(false)
    }
  }

  async function unfreeze() {
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('admin_unfreeze_org', {
        p_org_id: org.id,
      })
      if (err) throw err
      setUnfreezeOpen(false)
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'Failed to unfreeze')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-2xl border ${isFrozen ? 'border-rose-500/30 bg-rose-500/5' : 'border-slate-800/60 bg-slate-900/40'} backdrop-blur px-5 py-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isFrozen ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}`}>
            {isFrozen ? <Snowflake className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-slate-100">Tenancy status</h3>
              {isFrozen ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium tracking-wide bg-rose-500/15 text-rose-200 border-rose-500/30">Frozen</span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium tracking-wide bg-emerald-500/15 text-emerald-200 border-emerald-500/30">Active</span>
              )}
            </div>
            {isFrozen ? (
              <p className="text-xs text-rose-300/80 mt-1">
                Frozen at {formatDate(org.frozen_at)}{' '}
                {org.frozen_reason && <>· reason: <em className="text-rose-200">{org.frozen_reason}</em></>}
                <br />Customer writes (deals, contacts, messages, contracts, bills) are blocked. Reads still work.
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                Customer can read + write normally. Freeze to block all customer-facing writes platform-wide.
              </p>
            )}
          </div>
        </div>
        {isFrozen ? (
          <button
            onClick={() => setUnfreezeOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition shrink-0"
          >
            <Sun className="w-3.5 h-3.5" />
            Unfreeze
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition shrink-0"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Freeze tenancy
          </button>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title="Freeze tenancy"
        footer={
          <>
            <button onClick={() => setConfirmOpen(false)} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50">Cancel</button>
            <button onClick={freeze} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50">{busy ? 'Freezing…' : 'Confirm freeze'}</button>
          </>
        }
      >
        <p className="text-sm text-slate-300 mb-3">
          Freezing blocks all customer writes for <strong>{org?.name || org?.slug}</strong> across deals, contacts, channel messages, widget messages, contracts and bills. Reads keep working so support can investigate. Unfreeze any time.
        </p>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Reason</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this freeze needed?"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            autoFocus
          />
        </label>
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            {error}
          </div>
        )}
      </Modal>

      <Modal
        open={unfreezeOpen}
        onClose={() => !busy && setUnfreezeOpen(false)}
        title="Unfreeze tenancy"
        footer={
          <>
            <button onClick={() => setUnfreezeOpen(false)} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50">Cancel</button>
            <button onClick={unfreeze} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50">{busy ? 'Unfreezing…' : 'Confirm unfreeze'}</button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          This restores customer writes across deals, contacts, messages, contracts and bills for <strong>{org?.name || org?.slug}</strong>.
        </p>
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            {error}
          </div>
        )}
      </Modal>
    </div>
  )
}
