import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ToggleLeft,
  Plus,
  RefreshCcw,
  X,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import Modal from '../components/ui/Modal'

export default function Flags() {
  const [flags, setFlags]     = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [overridesFor, setOverridesFor] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const { data, error } = await supabase.rpc('admin_list_flags')
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      setFlags([])
    } else {
      setFlags(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function setFlag(key, patch) {
    setActionMsg(null)
    const flag = flags.find((f) => f.key === key)
    if (!flag) return
    const { error } = await supabase.rpc('admin_set_flag', {
      p_key: key,
      p_description: flag.description,
      p_default_enabled: patch.default_enabled ?? flag.default_enabled,
      p_rollout_pct: patch.rollout_pct ?? flag.rollout_pct,
    })
    if (error) {
      setActionMsg({ tone: 'danger', text: error.message })
    } else {
      setActionMsg({ tone: 'success', text: `Updated ${key}` })
      refresh()
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Feature flags</h1>
          <p className="text-sm text-slate-500">Global flags + per-org overrides + sticky percent-rollouts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50">
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white">
            <Plus className="w-3.5 h-3.5" /> New flag
          </button>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 125 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">125_feature_flags.sql</code>.
        </Banner>
      )}
      {actionMsg && <Banner tone={actionMsg.tone}>{actionMsg.text}</Banner>}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={32} rounded="rounded" />))}
          </div>
        ) : flags.length === 0 ? (
          <div className="p-12 text-center">
            <ToggleLeft className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No flags yet — create one to start gating features.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium px-5 py-2.5">Key</th>
                  <th className="text-left font-medium px-3 py-2.5">Description</th>
                  <th className="text-center font-medium px-3 py-2.5">Default</th>
                  <th className="text-left font-medium px-3 py-2.5 w-[280px]">Rollout %</th>
                  <th className="text-center font-medium px-3 py-2.5">Overrides</th>
                  <th className="text-right font-medium px-5 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.key} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-5 py-2.5 font-mono text-[12px] text-indigo-200">{f.key}</td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-400 truncate max-w-[280px]">{f.description || <span className="text-slate-600 italic">—</span>}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => setFlag(f.key, { default_enabled: !f.default_enabled })}
                        className={[
                          'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] transition',
                          f.default_enabled
                            ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-slate-700/30 text-slate-400 border-slate-700 hover:bg-slate-700/50',
                        ].join(' ')}
                      >
                        {f.default_enabled ? 'On' : 'Off'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0} max={100} step={5}
                          value={f.rollout_pct}
                          onChange={(e) => setFlag(f.key, { rollout_pct: Number(e.target.value) })}
                          className="flex-1 accent-indigo-500"
                          disabled={!f.default_enabled}
                        />
                        <span className="text-[11px] tabular-nums text-slate-300 w-9 text-right">{f.rollout_pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-[11px] text-slate-400">
                      <button onClick={() => setOverridesFor(f.key)}
                        className="text-indigo-300 hover:text-indigo-200">
                        {f.override_count} ({f.enabled_overrides} on)
                      </button>
                    </td>
                    <td className="px-5 py-2.5 text-right text-[11px] text-slate-500">
                      {f.updated_at ? new Date(f.updated_at).toLocaleString('en-US', { month:'short', day:'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateFlagModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refresh} />
      <OverridesModal flagKey={overridesFor} onClose={() => setOverridesFor(null)} />
    </div>
  )
}

function CreateFlagModal({ open, onClose, onCreated }) {
  const [key, setKey] = useState('')
  const [desc, setDesc] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [pct, setPct] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (open) { setKey(''); setDesc(''); setEnabled(false); setPct(0); setErr(null) }
  }, [open])

  async function onSave() {
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.rpc('admin_set_flag', {
        p_key: key.trim(),
        p_description: desc.trim() || null,
        p_default_enabled: enabled,
        p_rollout_pct: pct,
      })
      if (error) throw error
      onCreated?.()
      onClose?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose?.()} title="New feature flag">
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Key</span>
          <input value={key} onChange={(e)=>setKey(e.target.value)} placeholder="my_feature.subkey"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-slate-100 focus:border-indigo-500 focus:outline-none"/>
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Description</span>
          <textarea value={desc} onChange={(e)=>setDesc(e.target.value)} rows={2}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"/>
        </label>
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e)=>setEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500"/>
            <span className="text-sm text-slate-200">Default on</span>
          </label>
          <label className="flex items-center gap-2 flex-1">
            <span className="text-sm text-slate-200 shrink-0">Rollout %</span>
            <input type="range" min={0} max={100} step={5} value={pct}
              onChange={(e)=>setPct(Number(e.target.value))} className="flex-1 accent-indigo-500" disabled={!enabled}/>
            <span className="text-xs tabular-nums w-9 text-right">{pct}%</span>
          </label>
        </div>
        {err && <Banner tone="danger">{err}</Banner>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 disabled:opacity-50">Cancel</button>
        <button onClick={onSave} disabled={busy || !key.trim()}
          className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create'}</button>
      </div>
    </Modal>
  )
}

function OverridesModal({ flagKey, onClose }) {
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!flagKey) return
    setLoading(true)
    supabase.rpc('admin_list_flag_overrides', { p_key: flagKey }).then(({ data }) => {
      setRows(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [flagKey])

  return (
    <Modal open={!!flagKey} onClose={onClose} title={`Overrides: ${flagKey || ''}`} size="lg">
      {loading ? (
        <Skeleton width="100%" height={120} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No per-org overrides for this flag.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-medium px-3 py-2">Org</th>
                <th className="text-center font-medium px-3 py-2">State</th>
                <th className="text-left font-medium px-3 py-2">Set by</th>
                <th className="text-right font-medium px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.organization_id} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-3 py-2">
                    <Link to={`/companies/${r.organization_id}`} className="text-slate-200 hover:text-indigo-300" onClick={onClose}>
                      {r.org_name || r.org_slug}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={[
                      'inline-flex px-2 py-0.5 rounded-full border text-[11px]',
                      r.enabled
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-200 border-rose-500/30',
                    ].join(' ')}>
                      {r.enabled ? 'on' : 'off'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-400 truncate max-w-[200px]">{r.set_by_email || '—'}</td>
                  <td className="px-3 py-2 text-right text-[11px] text-slate-500">{r.set_at ? new Date(r.set_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 inline-flex items-center gap-1">
          <X className="w-3 h-3" /> Close
        </button>
      </div>
    </Modal>
  )
}
