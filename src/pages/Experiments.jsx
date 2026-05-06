import { useEffect, useMemo, useState } from 'react'
import {
  Beaker,
  Play,
  Pause,
  StopCircle,
  Award,
  RefreshCcw,
  Plus,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'

const STATUS_TONE = {
  draft:     'bg-slate-500/15 text-slate-300 border-slate-500/30',
  running:   'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  paused:    'bg-amber-500/15 text-amber-200 border-amber-500/30',
  completed: 'bg-violet-500/15 text-violet-200 border-violet-500/30',
  aborted:   'bg-rose-500/15 text-rose-200 border-rose-500/30',
}

const SURFACE_OPTIONS = [
  'chat-widget',
  'compass-narrative',
  'message-assistant',
  'pipeline-insight',
  'reach-knowledge',
  'contract-ai',
]

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return `${Number(n).toFixed(1)}%`
}
function fmtMs(n) {
  if (n == null) return '—'
  return `${Math.round(Number(n))}ms`
}
function fmtCents(n) {
  if (n == null) return '—'
  const v = Number(n) / 100
  if (v < 0.01) return `${(Number(n)).toFixed(2)}¢`
  return `$${v.toFixed(3)}`
}

export default function Experiments() {
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [err, setErr]         = useState(null)
  const [composer, setComposer] = useState(false)
  const [stats, setStats]     = useState({})    // { [exp_id]: rows }

  const refresh = async () => {
    setLoading(true)
    setErr(null)
    const { data, error } = await supabase
      .from('ai_prompt_experiments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
        setMissing(true)
      } else {
        setErr(error.message)
      }
    } else {
      setList(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  // Pull stats for running experiments only — they're the only ones the UI
  // actively tracks. Completed/aborted are static.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const running = list.filter((e) => e.status === 'running' || e.status === 'paused')
      const next = {}
      for (const e of running) {
        const { data, error } = await supabase.rpc('admin_ai_experiment_stats', { p_experiment_id: e.id })
        if (cancelled) return
        if (!error && Array.isArray(data)) next[e.id] = data
      }
      if (!cancelled) setStats(next)
    })()
    return () => { cancelled = true }
  }, [list])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Beaker className="w-5 h-5 text-indigo-300" />
            AI prompt experiments
          </h1>
          <p className="text-sm text-slate-500">A/B test candidate system prompts on a slice of traffic.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setComposer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white">
            <Plus className="w-3.5 h-3.5" />
            New experiment
          </button>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 129 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">129_ai_prompt_experiments.sql</code>.
        </Banner>
      )}
      {err && <Banner tone="danger" title="Failed to load">{err}</Banner>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({length:3}).map((_,i)=>(<Skeleton key={i} width="100%" height={140} rounded="rounded-2xl" />))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={Sparkles}
          title="No experiments yet"
          description="Spin one up to test a candidate system prompt against the production prompt." />
      ) : (
        <div className="space-y-4">
          {list.map((e) => (
            <ExperimentCard key={e.id} exp={e} stats={stats[e.id]} onChange={refresh} />
          ))}
        </div>
      )}

      <NewExperimentModal open={composer} onClose={() => setComposer(false)} onCreated={refresh} />
    </div>
  )
}

function ExperimentCard({ exp, stats, onChange }) {
  const [busy, setBusy] = useState(false)

  const setStatus = async (status) => {
    if (!confirm(`Set status to ${status}?`)) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_ai_experiment_set_status', {
      p_id: exp.id, p_status: status,
    })
    setBusy(false)
    if (error) alert(error.message)
    else onChange()
  }

  const promote = async () => {
    if (!confirm(`Promote variant prompt to default for surface "${exp.surface}"? This rewrites platform_ai_config.system_prompts and ends the experiment.`)) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_ai_experiment_promote', { p_id: exp.id })
    setBusy(false)
    if (error) alert(error.message)
    else onChange()
  }

  // Group stats by arm — { control, variant }
  const armMap = useMemo(() => {
    const m = {}
    for (const r of stats || []) m[r.arm] = r
    return m
  }, [stats])

  const winRate = (arm) => {
    const r = armMap[arm]
    if (!r) return null
    if (!Number(r.rated_total)) return null
    return (Number(r.rated_useful) / Number(r.rated_total)) * 100
  }

  const errRate = (arm) => {
    const r = armMap[arm]
    if (!r) return null
    if (!Number(r.calls)) return null
    return (Number(r.errors) / Number(r.calls)) * 100
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <code className="px-2 py-0.5 text-[11px] font-mono bg-slate-950 border border-slate-800 rounded text-indigo-200">
              {exp.surface}
            </code>
            <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider ${STATUS_TONE[exp.status] || ''}`}>
              {exp.status}
            </span>
            <span className="text-[11px] text-slate-500">
              {Number(exp.variant_pct)}% on variant
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Created {new Date(exp.created_at).toLocaleString()}
            {exp.started_at && <> · started {new Date(exp.started_at).toLocaleString()}</>}
            {exp.ended_at && <> · ended {new Date(exp.ended_at).toLocaleString()}</>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {exp.status === 'draft' && (
            <button disabled={busy} onClick={() => setStatus('running')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 disabled:opacity-50">
              <Play className="w-3 h-3" /> Start
            </button>
          )}
          {exp.status === 'running' && (
            <button disabled={busy} onClick={() => setStatus('paused')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 disabled:opacity-50">
              <Pause className="w-3 h-3" /> Pause
            </button>
          )}
          {exp.status === 'paused' && (
            <button disabled={busy} onClick={() => setStatus('running')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 disabled:opacity-50">
              <Play className="w-3 h-3" /> Resume
            </button>
          )}
          {(exp.status === 'running' || exp.status === 'paused') && (
            <>
              <button disabled={busy} onClick={() => setStatus('aborted')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/30 disabled:opacity-50">
                <StopCircle className="w-3 h-3" /> Abort
              </button>
              <button disabled={busy} onClick={promote}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/30 disabled:opacity-50">
                <Award className="w-3 h-3" /> Promote variant
              </button>
            </>
          )}
        </div>
      </div>

      {exp.notes && <p className="text-xs text-slate-400 mb-4">{exp.notes}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {['control','variant'].map((arm) => {
          const r = armMap[arm]
          return (
            <div key={arm} className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${arm === 'variant' ? 'text-indigo-300' : 'text-slate-300'}`}>
                  {arm}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {r ? `${Number(r.calls).toLocaleString()} calls` : 'no calls yet'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-500 uppercase tracking-wider text-[9px] mb-0.5">Errors</div>
                  <div className={Number(r?.errors) > 0 ? 'text-rose-300 tabular-nums' : 'text-slate-300 tabular-nums'}>
                    {r ? `${Number(r.errors)} (${fmtPct(errRate(arm))})` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 uppercase tracking-wider text-[9px] mb-0.5">Avg dur</div>
                  <div className="text-slate-300 tabular-nums">{fmtMs(r?.avg_duration_ms)}</div>
                </div>
                <div>
                  <div className="text-slate-500 uppercase tracking-wider text-[9px] mb-0.5">Avg cost</div>
                  <div className="text-slate-300 tabular-nums">{fmtCents(r?.avg_cost_cents)}</div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/60">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Win rate</span>
                  <span className={`tabular-nums ${r && winRate(arm) != null ? 'text-emerald-300' : 'text-slate-500'}`}>
                    {fmtPct(winRate(arm))} ({Number(r?.rated_useful || 0)}/{Number(r?.rated_total || 0)})
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-300">View prompts</summary>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Control</div>
            <pre className="p-2 rounded-md bg-slate-950 border border-slate-800 text-[11px] text-slate-300 max-h-48 overflow-auto whitespace-pre-wrap">{exp.control_prompt || '(empty)'}</pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Variant</div>
            <pre className="p-2 rounded-md bg-slate-950 border border-indigo-500/30 text-[11px] text-indigo-100 max-h-48 overflow-auto whitespace-pre-wrap">{exp.variant_prompt}</pre>
          </div>
        </div>
      </details>
    </div>
  )
}

function NewExperimentModal({ open, onClose, onCreated }) {
  const [surface, setSurface] = useState('chat-widget')
  const [variant, setVariant] = useState('')
  const [pct, setPct]         = useState(10)
  const [notes, setNotes]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState(null)

  useEffect(() => {
    if (open) {
      setVariant(''); setPct(10); setNotes(''); setErr(null)
    }
  }, [open])

  const submit = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('admin_ai_experiment_create', {
      p_surface: surface,
      p_variant_prompt: variant,
      p_variant_pct: Number(pct) || 10,
      p_control_prompt: null,
      p_notes: notes || null,
    })
    setBusy(false)
    if (error) {
      if (isMissingFunction(error)) setErr('Migration 129 not applied yet.')
      else setErr(error.message)
      return
    }
    onCreated?.()
    onClose?.()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="New AI prompt experiment"
      footer={
        <>
          <button onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
          <button disabled={busy || !variant.trim()}
            onClick={submit}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
            {busy ? 'Creating…' : 'Create draft'}
          </button>
        </>
      }>
      {err && <Banner tone="danger" className="mb-3">{err}</Banner>}
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Surface</label>
          <select value={surface} onChange={(e) => setSurface(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
            {SURFACE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <p className="text-[10px] text-slate-500 mt-1">Control prompt will be auto-snapshotted from platform_ai_config.system_prompts[{surface}].</p>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Variant prompt</label>
          <textarea value={variant} onChange={(e) => setVariant(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
            placeholder="System prompt to test against the existing one…"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Variant traffic %</label>
            <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Notes (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
              placeholder="What hypothesis is this testing?" />
          </div>
        </div>
      </div>
    </Modal>
  )
}
