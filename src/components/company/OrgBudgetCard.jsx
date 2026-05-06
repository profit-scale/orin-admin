import { useCallback, useEffect, useState } from 'react'
import { DollarSign, AlertTriangle, ZapOff, Zap, Save } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Modal from '../ui/Modal'

function formatCents(c) {
  if (c == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(c / 100)
}

/**
 * Per-org AI budget controls.
 * Shows current month usage as a progress bar, lets the admin set a hard
 * monthly cap (with auto-throttle), and exposes an emergency throttle button.
 */
export default function OrgBudgetCard({ orgId }) {
  const [quota, setQuota] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [budgetCents, setBudgetCents] = useState('')
  const [alertPct, setAlertPct] = useState(80)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [throttleConfirm, setThrottleConfirm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('org_ai_quotas')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle()
      if (err) throw err
      setQuota(data || null)
      setBudgetCents(data?.monthly_budget_cents == null ? '' : String(data.monthly_budget_cents))
      setAlertPct(data?.budget_alert_at_pct ?? 80)
    } catch (e) {
      setError(e?.message || 'Failed to load AI budget')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    setSaveOk(false)
    setError(null)
    try {
      const cents = budgetCents.trim() === '' ? null : Number(budgetCents)
      if (cents != null && (Number.isNaN(cents) || cents < 0)) throw new Error('Budget must be a non-negative integer (in cents).')
      const { error: err } = await supabase.rpc('admin_set_org_budget', {
        p_org_id: orgId,
        p_budget_cents: cents,
        p_alert_pct: Number(alertPct) || 80,
      })
      if (err) throw err
      setSaveOk(true)
      await load()
    } catch (e) {
      setError(e?.message || 'Failed to save budget')
    } finally {
      setSaving(false)
    }
  }

  async function throttle() {
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('admin_throttle_org', {
        p_org_id: orgId,
        p_reason: 'admin_emergency',
      })
      if (err) throw err
      setThrottleConfirm(false)
      await load()
    } catch (e) {
      setError(e?.message || 'Failed to throttle')
    } finally {
      setSaving(false)
    }
  }

  async function unthrottle() {
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('admin_unthrottle_org', { p_org_id: orgId })
      if (err) throw err
      await load()
    } catch (e) {
      setError(e?.message || 'Failed to unthrottle')
    } finally {
      setSaving(false)
    }
  }

  const used  = quota?.cost_cents_used ?? 0
  const cap   = quota?.monthly_budget_cents ?? null
  const pct   = (cap && cap > 0) ? Math.min(100, (used / cap) * 100) : null
  const tone  = pct == null ? 'bg-slate-600' : pct >= 95 ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-100">AI budget</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Monthly dollar cap. When usage hits the cap, the org is automatically throttled.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {quota?.is_throttled ? (
            <button
              onClick={unthrottle}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" /> Unthrottle
            </button>
          ) : (
            <button
              onClick={() => setThrottleConfirm(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition disabled:opacity-50"
            >
              <ZapOff className="w-3.5 h-3.5" /> Throttle now
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500 text-center py-6">Loading…</p>
      ) : (
        <>
          {quota?.is_throttled && (
            <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              <ZapOff className="w-3 h-3 inline mr-1" />
              Currently throttled — reason: <strong>{quota.throttled_reason || 'unknown'}</strong>
            </div>
          )}

          <div className="mb-3">
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <span className="text-slate-300 font-medium">This month</span>
              <span className="tabular-nums text-slate-400">
                <span className="text-slate-100">{formatCents(used)}</span>
                <span className="text-slate-500"> / {cap == null ? '∞ (no cap)' : formatCents(cap)}</span>
                {pct != null && <span className="text-slate-600 ml-2">({pct.toFixed(0)}%)</span>}
              </span>
            </div>
            <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden ring-1 ring-inset ring-slate-800/40">
              <div className={`h-full ${tone} transition-all duration-500 rounded-full`} style={{ width: `${pct == null ? 0 : Math.max(pct, used > 0 ? 4 : 0)}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Monthly cap (cents)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={budgetCents}
                  onChange={(e) => { setBudgetCents(e.target.value); setSaveOk(false) }}
                  placeholder="(no cap)"
                  className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none tabular-nums"
                />
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  {budgetCents ? formatCents(Number(budgetCents)) : '—'}
                </span>
              </div>
            </label>
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Alert at %</span>
              <input
                type="number"
                min={1}
                max={100}
                value={alertPct}
                onChange={(e) => { setAlertPct(Number(e.target.value) || 80); setSaveOk(false) }}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none tabular-nums"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            {saveOk && <span className="text-xs text-emerald-300">Saved.</span>}
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save budget'}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="w-3 h-3 inline mr-1" />
          {error}
        </div>
      )}

      <Modal
        open={throttleConfirm}
        onClose={() => !saving && setThrottleConfirm(false)}
        title="Emergency throttle?"
        footer={
          <>
            <button onClick={() => setThrottleConfirm(false)} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50">Cancel</button>
            <button onClick={throttle} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50">{saving ? 'Throttling…' : 'Confirm throttle'}</button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          This blocks every AI call for this org until you unthrottle. Useful for a runaway loop or a compromised key.
        </p>
      </Modal>
    </div>
  )
}
