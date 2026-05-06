import { useState } from 'react'
import { Wrench, RefreshCw, RotateCcw, Database, Hash, Phone, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Modal from '../ui/Modal'

/**
 * Per-org force-actions card. Each button is a thin wrapper around an
 * edge function or RPC. All actions confirm in a modal first and record
 * to the audit log on success.
 *
 * The buttons are intentionally pessimistic — if the underlying
 * functionality isn't deployed yet, we render a "deferred" tooltip
 * rather than a hard error.
 */
const ACTIONS = [
  {
    id: 'refresh_tokens',
    label: 'Refresh OAuth tokens',
    desc: 'Mark every connected integration for token refresh on its next sync.',
    icon: RefreshCw,
    fn: async (orgId) => {
      const { data, error } = await supabase.functions.invoke('admin-force-refresh-tokens', { body: { organization_id: orgId } })
      if (error) throw error
      return data
    },
  },
  {
    id: 'resync_ghl',
    label: 'Resync GoHighLevel',
    desc: 'Trigger a full GHL sync for this org.',
    icon: RotateCcw,
    fn: async (orgId) => {
      // Best-effort: call ghl-sync. If the function doesn't exist on this
      // deploy, fall back to the deferred branch.
      const { data, error } = await supabase.functions.invoke('ghl-sync', { body: { organization_id: orgId, mode: 'full' } })
      if (error) {
        if (/Failed to send|404|not found/i.test(error.message)) {
          return { ok: true, deferred: true, message: 'ghl-sync not deployed on this environment.' }
        }
        throw error
      }
      return data
    },
  },
  {
    id: 'reach_reindex',
    label: 'Rebuild Reach RAG index',
    desc: 'Clear FTS state for every chat widget so the next ingest re-runs.',
    icon: Database,
    fn: async (orgId) => {
      // Find widgets for this org; clear tsv on chunks. If reach_knowledge_chunks
      // doesn't exist on this deploy, return deferred.
      const { data: widgets, error: widErr } = await supabase
        .from('chat_widgets')
        .select('id')
        .eq('organization_id', orgId)
      if (widErr) {
        if (/relation .* does not exist/i.test(widErr.message)) {
          return { ok: true, deferred: true, message: 'chat_widgets table not present on this deploy.' }
        }
        throw widErr
      }
      const widgetIds = (widgets || []).map((w) => w.id)
      if (widgetIds.length === 0) return { ok: true, message: 'No chat widgets for this org.' }
      const { error } = await supabase
        .from('reach_knowledge_chunks')
        .update({ tsv: null })
        .in('widget_id', widgetIds)
      if (error) {
        if (/relation .* does not exist|column .* does not exist/i.test(error.message)) {
          return { ok: true, deferred: true, message: 'reach_knowledge_chunks not present on this deploy.' }
        }
        throw error
      }
      return { ok: true, widgets_marked: widgetIds.length }
    },
  },
  {
    id: 'regenerate_slugs',
    label: 'Regenerate widget slugs',
    desc: 'Issue fresh URL slugs for every chat widget belonging to this org.',
    icon: Hash,
    fn: async (orgId) => {
      const { data: widgets, error: widErr } = await supabase
        .from('chat_widgets')
        .select('id, slug')
        .eq('organization_id', orgId)
      if (widErr) {
        if (/relation .* does not exist/i.test(widErr.message)) {
          return { ok: true, deferred: true, message: 'chat_widgets not present on this deploy.' }
        }
        throw widErr
      }
      let updated = 0
      for (const w of (widgets || [])) {
        const newSlug = `w-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}`
        const { error } = await supabase.from('chat_widgets').update({ slug: newSlug }).eq('id', w.id)
        if (!error) updated++
      }
      return { ok: true, widgets_updated: updated }
    },
  },
  {
    id: 'baileys_restart',
    label: 'Restart Baileys WhatsApp',
    desc: 'Best-effort restart of the WhatsApp microservice for this org.',
    icon: Phone,
    fn: async () => {
      // We don't have a uniform "restart Baileys" endpoint exposed. Mark as
      // deferred until the corresponding microservice contract ships.
      return {
        ok: true,
        deferred: true,
        message: 'Baileys microservice does not yet expose a per-org restart endpoint.',
      }
    },
  },
]

export default function ForceActionsCard({ orgId }) {
  const [confirming, setConfirming] = useState(null) // action id
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState({}) // id -> { ok, message, at }

  async function run(action) {
    setBusy(true)
    setResults((prev) => ({ ...prev, [action.id]: { running: true } }))
    try {
      const out = await action.fn(orgId)
      // Audit
      supabase.rpc('record_admin_action', {
        p_action: 'force_action',
        p_target_type: 'organization',
        p_target_id: orgId,
        p_payload: { action: action.id, deferred: !!out?.deferred, result: out },
      }).catch(() => {})
      setResults((prev) => ({
        ...prev,
        [action.id]: {
          ok: out?.ok !== false,
          deferred: !!out?.deferred,
          message: out?.message || (out?.ok ? 'Done.' : 'Done (no message).'),
          at: new Date().toISOString(),
        },
      }))
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [action.id]: { ok: false, message: e?.message || String(e), at: new Date().toISOString() },
      }))
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur px-5 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Wrench className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-100">Force actions</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational levers for this org. Each is audited and confirmed before running.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {ACTIONS.map((a) => {
          const r = results[a.id]
          const I = a.icon
          return (
            <div key={a.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-slate-800/60 bg-slate-950/40">
              <div className="flex items-center gap-3 min-w-0">
                <I className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-slate-100">{a.label}</div>
                  <div className="text-[11px] text-slate-500 truncate">{a.desc}</div>
                  {r && !r.running && (
                    <div className="text-[11px] mt-0.5 inline-flex items-center gap-1.5">
                      {r.ok ? (
                        r.deferred ? (
                          <><Clock className="w-3 h-3 text-amber-400" /><span className="text-amber-300">Deferred · {r.message}</span></>
                        ) : (
                          <><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-emerald-300">{r.message}</span></>
                        )
                      ) : (
                        <><AlertTriangle className="w-3 h-3 text-rose-400" /><span className="text-rose-300">{r.message}</span></>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setConfirming(a.id)}
                disabled={busy || r?.running}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-40 shrink-0"
              >
                {r?.running ? 'Running…' : 'Run'}
              </button>
            </div>
          )
        })}
      </div>

      {confirming && (
        <Modal
          open={true}
          onClose={() => !busy && setConfirming(null)}
          title={`Run "${ACTIONS.find((a) => a.id === confirming)?.label}"?`}
          footer={
            <>
              <button onClick={() => setConfirming(null)} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50">Cancel</button>
              <button onClick={() => run(ACTIONS.find((a) => a.id === confirming))} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50">{busy ? 'Running…' : 'Run now'}</button>
            </>
          }
        >
          <p className="text-sm text-slate-300">
            {ACTIONS.find((a) => a.id === confirming)?.desc}
          </p>
        </Modal>
      )}
    </div>
  )
}
