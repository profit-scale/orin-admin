import { useEffect, useMemo, useState } from 'react'
import { Globe, RefreshCcw, Zap, CheckCircle2, AlertTriangle, XCircle, Save } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import { toast } from '../components/ui/Toast'

const STATUS_META = {
  healthy:  { icon: CheckCircle2, tone: 'emerald', label: 'Healthy' },
  degraded: { icon: AlertTriangle,tone: 'amber',   label: 'Degraded' },
  down:     { icon: XCircle,      tone: 'rose',    label: 'Down' },
  unknown:  { icon: AlertTriangle,tone: 'slate',   label: 'Unknown' },
}
const TONE_BG = {
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
  amber:   'bg-amber-500/10 border-amber-500/30 text-amber-200',
  rose:    'bg-rose-500/10 border-rose-500/30 text-rose-200',
  slate:   'bg-slate-500/10 border-slate-500/30 text-slate-200',
}

function fmt(s) { return s ? new Date(s).toLocaleString() : '—' }

export default function Failover() {
  const [latest, setLatest] = useState([])
  const [history, setHistory] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [pinging, setPinging] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const [lRes, cRes] = await Promise.all([
      supabase.rpc('admin_region_health_latest'),
      supabase.rpc('admin_failover_config_get'),
    ])
    if (lRes.error) {
      if (isMissingFunction(lRes.error)) setMissing(true)
      else toast.error('Failed to load region health', { description: lRes.error.message })
    } else {
      setLatest(lRes.data || [])
    }
    if (!cRes.error) setConfig((cRes.data && cRes.data[0]) || null)

    // Pull history for the primary
    const primary = (lRes.data || []).find((r) => r.is_primary) || (lRes.data || [])[0]
    if (primary?.region_id) {
      const { data: hData } = await supabase.rpc('admin_region_health_history', {
        p_region_id: primary.region_id,
        p_hours: 24,
      })
      setHistory(hData || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const ping = async () => {
    setPinging(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-region-ping', { body: {} })
      if (error) throw new Error(error.message || 'Ping failed')
      if (!data?.ok) throw new Error(data?.message || 'Ping failed')
      toast.success(`Region ${data.status} · ${data.latency_ms ?? '—'}ms`)
      refresh()
    } catch (e) {
      toast.error('Ping failed', { description: e.message })
    } finally {
      setPinging(false)
    }
  }

  const flipped = useMemo(() => {
    if (latest.length < 2) return null
    const prev = latest[1]
    if (prev.status !== latest[0].status) return { from: prev.status, to: latest[0].status }
    return null
  }, [latest])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-300" />
            Failover
          </h1>
          <p className="text-sm text-slate-500">
            Region health + RTO/RPO targets. Single region today (apnortheast2 / Seoul).
          </p>
        </div>
        <button onClick={ping} disabled={pinging || loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
          <Zap className={`w-3.5 h-3.5 ${pinging ? 'animate-pulse' : ''}`} />
          {pinging ? 'Pinging…' : 'Ping now'}
        </button>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 142 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">142_failover.sql</code>.
        </Banner>
      )}

      {flipped && (
        <Banner tone={flipped.to === 'healthy' ? 'success' : 'warning'}
          title={`Status flipped: ${flipped.from} → ${flipped.to}`}>
          Last check {fmt(latest[0].last_check_at)}
        </Banner>
      )}

      {loading ? (
        <Skeleton width="100%" height={200} rounded="rounded-2xl" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {latest.map((r) => {
            const meta = STATUS_META[r.status] || STATUS_META.unknown
            const Icon = meta.icon
            return (
              <div key={r.region_id} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-0.5">
                      {r.is_primary ? 'Primary region' : 'Region'}
                    </div>
                    <div className="text-xl font-semibold text-slate-100 font-mono">{r.region_id}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] uppercase tracking-wider ${TONE_BG[meta.tone]}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {meta.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Latency (last)</div>
                    <div className="text-slate-200 tabular-nums">{r.latency_ms != null ? `${r.latency_ms}ms` : '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Last check</div>
                    <div className="text-slate-200">{fmt(r.last_check_at)}</div>
                  </div>
                </div>
                {r.notes && <div className="text-[11px] text-slate-500 mt-3">{r.notes}</div>}

                {r.is_primary && history.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800/60">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Latency, last 24h</div>
                    <LatencyLine history={history} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <FailoverConfig config={config} onSaved={refresh} />
    </div>
  )
}

function LatencyLine({ history }) {
  if (!history || history.length === 0) return null
  const data = history.map((h) => Number(h.avg_latency || 0))
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const w = 360
  const h = 60
  const stepX = w / Math.max(1, data.length - 1)
  const points = data.map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / Math.max(1, max - min)) * h).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} className="block">
      <polyline points={points} fill="none" stroke="#818cf8" strokeWidth="1.5" />
      {data.map((v, i) => (
        <circle key={i} cx={i * stepX} cy={h - ((v - min) / Math.max(1, max - min)) * h} r="2" fill="#a5b4fc" />
      ))}
    </svg>
  )
}

function FailoverConfig({ config, onSaved }) {
  const [rto, setRto]         = useState('')
  const [rpo, setRpo]         = useState('')
  const [primary, setPrimary] = useState('')
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    if (!config) return
    setRto(String(config.rto_minutes ?? 60))
    setRpo(String(config.rpo_minutes ?? 15))
    setPrimary(config.primary_region_id || 'apnortheast2')
  }, [config])

  const save = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_failover_config_set', {
        p_rto_minutes: Number(rto) || null,
        p_rpo_minutes: Number(rpo) || null,
        p_primary_region_id: primary.trim() || null,
      })
      if (error) throw error
      toast.success('Failover targets saved')
      onSaved?.()
    } catch (e) {
      toast.error('Save failed', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-slate-100">Failover targets</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">RTO (minutes)</label>
          <input value={rto} onChange={(e) => setRto(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
          <p className="text-[10px] text-slate-500 mt-1">Recovery Time Objective — max acceptable downtime.</p>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">RPO (minutes)</label>
          <input value={rpo} onChange={(e) => setRpo(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
          <p className="text-[10px] text-slate-500 mt-1">Recovery Point Objective — max acceptable data loss.</p>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Primary region id</label>
          <input value={primary} onChange={(e) => setPrimary(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200" />
          <p className="text-[10px] text-slate-500 mt-1">Used by the cron self-check. Default: apnortheast2.</p>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <button onClick={save} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
          <Save className="w-3.5 h-3.5" /> {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
