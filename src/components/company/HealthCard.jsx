import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../services/supabase'

const BUCKET_TONE = {
  thriving: { label: 'Thriving', tone: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' },
  active:   { label: 'Active',   tone: 'bg-sky-500/15 text-sky-200 border-sky-500/30' },
  idle:     { label: 'Idle',     tone: 'bg-amber-500/15 text-amber-200 border-amber-500/30' },
  at_risk:  { label: 'At risk',  tone: 'bg-orange-500/15 text-orange-200 border-orange-500/30' },
  ghost:    { label: 'Ghost',    tone: 'bg-rose-500/15 text-rose-200 border-rose-500/30' },
}

function formatRel(s) {
  if (!s) return '—'
  try {
    const d = new Date(s).getTime()
    const m = Math.floor((Date.now() - d) / 60_000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const dd = Math.floor(h / 24)
    return `${dd}d ago`
  } catch { return s }
}

export default function HealthCard({ orgId }) {
  const [latest, setLatest] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [latestRes, histRes] = await Promise.all([
        supabase.from('org_health_snapshots').select('*').eq('organization_id', orgId).order('computed_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('org_health_snapshots').select('computed_at, score, bucket').eq('organization_id', orgId).order('computed_at', { ascending: false }).limit(30),
      ])
      if (latestRes.error) {
        if (/relation .* does not exist/i.test(latestRes.error.message)) {
          setMissing(true); return
        }
        throw latestRes.error
      }
      setLatest(latestRes.data || null)
      setHistory((histRes.data || []).reverse())
    } catch (e) {
      setError(e?.message || 'Failed to load health')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function recompute() {
    setRecomputing(true)
    setError(null)
    try {
      const { error: err } = await supabase.rpc('admin_compute_org_health', { p_org_id: orgId })
      if (err) throw err
      await load()
    } catch (e) {
      setError(e?.message || 'Failed to recompute')
    } finally {
      setRecomputing(false)
    }
  }

  if (missing) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-xs text-amber-200">
        Migration 118 not applied yet — health scores unavailable.
      </div>
    )
  }

  const meta = latest ? BUCKET_TONE[latest.bucket] || BUCKET_TONE.idle : null
  const sig = latest?.signals || {}

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/15 text-sky-300 border border-sky-500/30">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-100">Health score</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Composite 0–100 score across logins, activity, AI, integrations.
            </p>
          </div>
        </div>
        <button
          onClick={recompute}
          disabled={recomputing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recomputing ? 'animate-spin' : ''}`} />
          Recompute
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500 text-center py-6">Loading…</p>
      ) : !latest ? (
        <p className="text-xs text-slate-500 py-2">No snapshots yet — click Recompute.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="text-3xl font-semibold text-slate-100 tabular-nums">{Number(latest.score).toFixed(1)}</div>
            {meta && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.tone}`}>
                {meta.label}
              </span>
            )}
            <span className="text-[11px] text-slate-500 ml-auto">
              {formatRel(latest.computed_at)}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
            {[
              ['Members', sig.member_count],
              ['Logged in (30d)', `${sig.recent_logins_30d ?? '—'} (${sig.recent_logins_pct ?? '—'}%)`],
              ['Weekly active', sig.weekly_active_users],
              ['Deals (30d)', sig.deal_activity_30d],
              ['Contacts (30d)', sig.contact_activity_30d],
              ['Messages (30d)', sig.messaging_activity_30d],
              ['AI calls (30d)', sig.ai_usage_30d],
              ['Integrations', sig.integrations_connected],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wider text-[10px]">{label}</div>
                <div className="text-slate-200 mt-1 tabular-nums">{val ?? '—'}</div>
              </div>
            ))}
          </div>

          {history.length > 1 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">History</div>
              <Spark history={history} />
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="w-3 h-3 inline mr-1" />
          {error}
        </div>
      )}
    </div>
  )
}

// Tiny inline sparkline — no recharts dependency needed for a 30-point line.
function Spark({ history }) {
  const w = 480, h = 64
  const xs = history.length > 1 ? history.length - 1 : 1
  const points = history.map((p, i) => {
    const x = (i / xs) * w
    const y = h - (Number(p.score) / 100) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <polyline points={points} fill="none" stroke="rgb(99 102 241)" strokeWidth="1.5" />
    </svg>
  )
}
