import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Filter,
  Pause,
  Play,
  RefreshCcw,
  ShieldAlert,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Tabs from '../components/ui/Tabs'
import Sparkline from '../components/observability/Sparkline'
import IssueDrawer from '../components/observability/IssueDrawer'

// ────────────────────────────────────────────────────────────────────
// In-house observability dashboard. Replaces the Sentry/Axiom UI
// we deliberately did NOT buy. Three tabs: Issues, Live tail,
// Performance. Plus a spike-alert banner at the top.
//
// All data flows through admin_* RPCs in migration 100. The live
// tail subscribes to Supabase realtime on the event_log table.
// ────────────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { id: '1h',   label: 'Last hour',     hours: 1 },
  { id: '24h',  label: 'Last 24 hours', hours: 24 },
  { id: '7d',   label: 'Last 7 days',   hours: 24 * 7 },
  { id: '30d',  label: 'Last 30 days',  hours: 24 * 30 },
]

const SOURCE_OPTIONS = [
  { id: '',                 label: 'All sources' },
  { id: 'client',           label: 'Client (browser)' },
  { id: 'edge:payment-webhook',      label: 'edge: payment-webhook' },
  { id: 'edge:booking-public-create', label: 'edge: booking-public-create' },
  { id: 'edge:ai-completion',        label: 'edge: ai-completion' },
]

const LEVEL_OPTIONS = [
  { id: '',      label: 'All levels' },
  { id: 'fatal', label: 'Fatal' },
  { id: 'error', label: 'Error' },
  { id: 'warn',  label: 'Warning' },
]

export default function Observability() {
  const [tab, setTab] = useState('issues')
  const [missingMigration, setMissingMigration] = useState(false)

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Observability</h1>
          <p className="text-sm text-slate-500">
            Errors, events, and performance across the customer app and edge functions.
          </p>
        </div>
      </div>

      {missingMigration && (
        <Banner tone="warning" title="Migration 100 not yet applied">
          The observability RPCs (
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_error_groups</code>,{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_error_rate</code>,{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_error_spikes</code>
          ) are missing. Apply{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">100_observability.sql</code>{' '}
          to your Supabase project.
        </Banner>
      )}

      <SpikeBanner onMissing={() => setMissingMigration(true)} />

      <StatStrip onMissing={() => setMissingMigration(true)} />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'issues',     label: <><Bug className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Issues</> },
          { id: 'live',       label: <><Activity className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Live tail</> },
          { id: 'perf',       label: <><TrendingUp className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Performance</> },
        ]}
      />

      {tab === 'issues' && <IssuesTab onMissing={() => setMissingMigration(true)} />}
      {tab === 'live'   && <LiveTailTab />}
      {tab === 'perf'   && <PerformanceTab onMissing={() => setMissingMigration(true)} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Stat strip — compact summary across the top
// ────────────────────────────────────────────────────────────────────

function StatStrip({ onMissing }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_observability_stats')
    if (error) {
      if (isMissingFunction(error)) onMissing?.()
      setStats(null)
    } else {
      const row = Array.isArray(data) ? data[0] : data
      setStats(row || null)
    }
    setLoading(false)
  }, [onMissing])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile
        icon={Bug}
        label="Open issues"
        value={loading ? null : stats?.open_issues ?? 0}
        loading={loading}
        tone={Number(stats?.open_issues) > 0 ? 'danger' : 'good'}
      />
      <StatTile
        icon={Activity}
        label="Events / hour"
        value={loading ? null : stats?.events_last_hour ?? 0}
        loading={loading}
      />
      <StatTile
        icon={Zap}
        label="Errors / hour"
        value={loading ? null : stats?.errors_last_hour ?? 0}
        loading={loading}
        tone={Number(stats?.errors_last_hour) > 10 ? 'warn' : 'neutral'}
      />
      <StatTile
        icon={Users}
        label="Affected users (24h)"
        value={loading ? null : stats?.affected_users_24h ?? 0}
        loading={loading}
      />
    </div>
  )
}

function StatTile({ icon: Icon, label, value, loading, tone = 'neutral' }) {
  const toneText =
    tone === 'good'   ? 'text-emerald-300' :
    tone === 'warn'   ? 'text-amber-300' :
    tone === 'danger' ? 'text-red-300' :
    'text-slate-100'
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-500" />}
        <span>{label}</span>
      </div>
      {loading ? (
        <Skeleton width="50%" height={28} />
      ) : (
        <div className={`text-2xl font-semibold tabular-nums ${toneText}`}>
          {value ?? '—'}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Spike banner — fires from admin_error_spikes
// ────────────────────────────────────────────────────────────────────

function SpikeBanner({ onMissing }) {
  const [spikes, setSpikes] = useState([])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const { data, error } = await supabase.rpc('admin_error_spikes', { p_window_minutes: 5 })
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) onMissing?.()
        return
      }
      setSpikes(Array.isArray(data) ? data : [])
    }
    tick()
    const interval = setInterval(tick, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [onMissing])

  if (spikes.length === 0) return null

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-start gap-3">
      <ShieldAlert className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-red-100 mb-1">
          Active error spike{spikes.length > 1 ? 's' : ''} detected
        </p>
        <ul className="space-y-1 text-[11px] text-red-200">
          {spikes.slice(0, 5).map((s) => (
            <li key={s.fingerprint} className="truncate">
              <code className="font-mono text-red-300/80 mr-2">{s.fingerprint}</code>
              <span className="text-red-100">{s.message}</span>
              <span className="ml-2 text-red-300">
                {Number(s.baseline_rate) === 0
                  ? `${Number(s.current_rate).toFixed(0)} hits in last 5 min`
                  : `${Number(s.ratio).toFixed(1)}x baseline`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tab 1: Issues
// ────────────────────────────────────────────────────────────────────

function IssuesTab({ onMissing }) {
  const [range, setRange]       = useState('24h')
  const [source, setSource]     = useState('')
  const [level, setLevel]       = useState('')
  const [showResolved, setShowResolved] = useState(false)

  const [groups, setGroups]     = useState([])
  const [rate, setRate]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [activeFp, setActiveFp] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const hours = TIME_RANGES.find((r) => r.id === range)?.hours ?? 24
    const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString()

    const [groupsRes, rateRes] = await Promise.all([
      supabase.rpc('admin_error_groups', {
        p_since: sinceIso,
        p_resolved: showResolved,
        p_source: source || null,
        p_level: level || null,
        p_limit: 100,
      }),
      supabase.rpc('admin_error_rate', { p_minutes: 60 }),
    ])

    if (groupsRes.error) {
      if (isMissingFunction(groupsRes.error)) onMissing?.()
      setError(groupsRes.error.message)
      setGroups([])
    } else {
      setGroups(Array.isArray(groupsRes.data) ? groupsRes.data : [])
    }
    if (!rateRes.error) setRate(Array.isArray(rateRes.data) ? rateRes.data : [])
    setLoading(false)
  }, [range, source, level, showResolved, onMissing])

  useEffect(() => { refresh() }, [refresh])

  const handleRowResolve = useCallback(async (fp, e) => {
    e.stopPropagation()
    const { error } = await supabase.rpc('admin_resolve_error_group', {
      p_fingerprint: fp, p_resolve: true,
    })
    if (!error) setGroups((prev) => prev.filter((g) => g.fingerprint !== fp))
  }, [])

  return (
    <div className="space-y-4">
      <Sparkline data={rate} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="w-3.5 h-3.5" /> Filters:
        </div>
        <Select value={range}  onChange={setRange}  options={TIME_RANGES} />
        <Select value={source} onChange={setSource} options={SOURCE_OPTIONS} />
        <Select value={level}  onChange={setLevel}  options={LEVEL_OPTIONS} />
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="accent-indigo-500"
          />
          Show resolved
        </label>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <Banner tone="danger" title="Failed to load issues">{error}</Banner>}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={48} rounded="rounded-lg" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No issues in this window"
            description="Either nothing's broken, or the filters are too narrow. Try widening the time range."
          />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-950/60">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left  font-medium px-4 py-2.5 w-[14%]">Count</th>
                <th className="text-left  font-medium px-4 py-2.5 w-[42%]">Issue</th>
                <th className="text-left  font-medium px-4 py-2.5 w-[18%]">Source</th>
                <th className="text-right font-medium px-4 py-2.5 w-[8%]">Users</th>
                <th className="text-right font-medium px-4 py-2.5 w-[8%]">Orgs</th>
                <th className="text-right font-medium px-4 py-2.5 w-[10%]">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr
                  key={g.fingerprint}
                  onClick={() => setActiveFp(g.fingerprint)}
                  className="border-t border-slate-800/40 hover:bg-slate-800/30 transition cursor-pointer align-top"
                >
                  <td className="px-4 py-3">
                    <CountBadge count={Number(g.total_occurrences)} level={g.level} />
                    <button
                      onClick={(e) => handleRowResolve(g.fingerprint, e)}
                      className="block mt-1.5 text-[10px] text-emerald-300/80 hover:text-emerald-200 transition"
                    >
                      Resolve
                    </button>
                  </td>
                  <td className="px-4 py-3 min-w-0">
                    <div className="text-slate-100 truncate font-medium">
                      {g.error_name && (
                        <span className="text-violet-300 font-mono mr-2">{g.error_name}</span>
                      )}
                      {g.message}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1 font-mono truncate">
                      {g.fingerprint}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Pill>{g.source}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                    {g.affected_users || 0}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                    {g.affected_orgs || 0}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 whitespace-nowrap">
                    {fmtRelative(g.last_seen_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <IssueDrawer
        fingerprint={activeFp}
        onClose={() => setActiveFp(null)}
        onResolved={(fp) => setGroups((prev) => prev.filter((g) => g.fingerprint !== fp))}
      />
    </div>
  )
}

function CountBadge({ count, level }) {
  const cls =
    level === 'fatal' ? 'bg-red-500/30 text-red-100 border-red-500/50' :
    level === 'warn'  ? 'bg-amber-500/20 text-amber-100 border-amber-500/40' :
                        'bg-red-500/15 text-red-200 border-red-500/30'
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md border ${cls} font-medium tabular-nums text-xs`}>
      {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
    </span>
  )
}

function Pill({ children, tone }) {
  const toneCls =
    tone === 'error' ? 'bg-red-500/15 text-red-200 border-red-500/30' :
    tone === 'warn'  ? 'bg-amber-500/15 text-amber-200 border-amber-500/30' :
    tone === 'info'  ? 'bg-sky-500/15 text-sky-200 border-sky-500/30' :
    tone === 'debug' ? 'bg-slate-700/40 text-slate-400 border-slate-700/60' :
    tone === 'fatal' ? 'bg-red-500/30 text-red-100 border-red-500/50' :
                       'bg-slate-800/60 text-slate-300 border-slate-700/60'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-mono ${toneCls}`}>
      {children}
    </span>
  )
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tab 2: Live tail
// ────────────────────────────────────────────────────────────────────

function LiveTailTab() {
  const [rows, setRows] = useState([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [filterSource, setFilterSource] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)

  // Initial fetch — last 100 events
  useEffect(() => {
    let cancelled = false
    supabase
      .from('event_log')
      .select('id, level, source, message, metadata, duration_ms, http_status, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setRows((data || []).reverse()) // oldest first so newest-on-bottom
      })
    return () => { cancelled = true }
  }, [])

  // Realtime subscription
  useEffect(() => {
    if (paused) return
    const channel = supabase
      .channel('event_log_tail')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_log' },
        (payload) => {
          setRows((prev) => {
            const next = [...prev, payload.new].slice(-300)
            return next
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [paused])

  // Auto-scroll on new rows
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return
    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [rows, autoScroll])

  const filtered = useMemo(
    () => rows.filter((r) =>
      (!filterSource || r.source === filterSource) &&
      (!filterLevel || r.level === filterLevel),
    ),
    [rows, filterSource, filterLevel],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterSource} onChange={setFilterSource} options={SOURCE_OPTIONS} />
        <Select
          value={filterLevel}
          onChange={setFilterLevel}
          options={[
            { id: '',      label: 'All levels' },
            { id: 'debug', label: 'Debug' },
            { id: 'info',  label: 'Info' },
            { id: 'warn',  label: 'Warning' },
            { id: 'error', label: 'Error' },
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-indigo-500"
            />
            Auto-scroll
          </label>
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
          >
            {paused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
          </button>
        </div>
      </div>

      {error && <Banner tone="danger" title="Failed to load live tail">{error}</Banner>}

      <div
        ref={containerRef}
        className="rounded-2xl border border-slate-800/60 bg-slate-950/60 backdrop-blur overflow-y-auto font-mono text-[11px] leading-relaxed"
        style={{ maxHeight: 600, minHeight: 400 }}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Waiting for events…"
            description={paused ? 'Live tail paused.' : 'Idle. New events will appear here.'}
          />
        ) : (
          filtered.map((r) => <EventRow key={r.id} row={r} />)
        )}
      </div>
    </div>
  )
}

function EventRow({ row }) {
  const [expanded, setExpanded] = useState(false)
  const hasMeta = row.metadata && Object.keys(row.metadata).length > 0

  const lvlClass =
    row.level === 'error' ? 'text-red-300' :
    row.level === 'warn'  ? 'text-amber-300' :
    row.level === 'debug' ? 'text-slate-500' :
                            'text-sky-300'

  return (
    <div
      className="px-3 py-1 hover:bg-slate-800/30 transition cursor-pointer flex items-start gap-2 border-l-2"
      style={{ borderLeftColor: borderColor(row.level) }}
      onClick={() => hasMeta && setExpanded((v) => !v)}
    >
      <span className="text-slate-600 tabular-nums shrink-0 w-20">
        {fmtTime(row.created_at)}
      </span>
      <span className={`shrink-0 w-12 uppercase ${lvlClass}`}>
        {row.level}
      </span>
      <span className="shrink-0 text-violet-300 truncate w-44" title={row.source}>
        {row.source}
      </span>
      <span className="text-slate-200 truncate flex-1">
        {row.message || '—'}
        {row.duration_ms != null && (
          <span className="text-slate-500 ml-2">{row.duration_ms}ms</span>
        )}
        {row.http_status != null && (
          <span className={`ml-2 ${row.http_status >= 500 ? 'text-red-300' : row.http_status >= 400 ? 'text-amber-300' : 'text-slate-500'}`}>
            {row.http_status}
          </span>
        )}
      </span>
      {hasMeta && (
        <span className="text-slate-600 shrink-0">{expanded ? '−' : '+'}</span>
      )}
      {expanded && hasMeta && (
        <pre className="basis-full text-slate-500 mt-1 whitespace-pre-wrap break-all">
          {JSON.stringify(row.metadata, null, 2)}
        </pre>
      )}
    </div>
  )
}

function borderColor(level) {
  if (level === 'error') return 'rgba(239,68,68,0.6)'
  if (level === 'warn')  return 'rgba(245,158,11,0.5)'
  if (level === 'debug') return 'rgba(100,116,139,0.4)'
  return 'rgba(56,189,248,0.4)'
}

// ────────────────────────────────────────────────────────────────────
// Tab 3: Performance
// ────────────────────────────────────────────────────────────────────

function PerformanceTab({ onMissing }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hours, setHours] = useState(24)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.rpc('admin_perf_by_source', { p_hours: hours }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) onMissing?.()
        setError(error.message)
        setRows([])
      } else {
        setRows(Array.isArray(data) ? data : [])
        setError(null)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [hours, onMissing])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select
          value={String(hours)}
          onChange={(v) => setHours(Number(v))}
          options={[
            { id: '1',   label: 'Last hour' },
            { id: '24',  label: 'Last 24 hours' },
            { id: '168', label: 'Last 7 days' },
          ]}
        />
      </div>

      {error && <Banner tone="danger" title="Failed to load performance data">{error}</Banner>}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={36} rounded="rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No timing data yet"
            description="Edge functions begin reporting durations here once they emit events with `duration_ms`. Wait a few minutes after deploys for traffic to flow through."
          />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-950/60">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left  font-medium px-4 py-2.5">Source</th>
                <th className="text-right font-medium px-4 py-2.5">Calls</th>
                <th className="text-right font-medium px-4 py-2.5">p50</th>
                <th className="text-right font-medium px-4 py-2.5">p95</th>
                <th className="text-right font-medium px-4 py-2.5">p99</th>
                <th className="text-right font-medium px-4 py-2.5">Error rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className="border-t border-slate-800/40 hover:bg-slate-800/30 transition">
                  <td className="px-4 py-2.5 text-violet-300 font-mono">{r.source}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                    {Number(r.call_count).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                    {fmtMs(r.p50_ms)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${msTone(r.p95_ms)}`}>
                    {fmtMs(r.p95_ms)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${msTone(r.p99_ms)}`}>
                    {fmtMs(r.p99_ms)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${rateTone(r.error_rate)}`}>
                    {r.error_rate == null ? '—' : `${(Number(r.error_rate) * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function msTone(ms) {
  if (ms == null) return 'text-slate-400'
  const n = Number(ms)
  if (n >= 1000) return 'text-red-300'
  if (n >= 500)  return 'text-amber-300'
  return 'text-emerald-300'
}

function rateTone(rate) {
  if (rate == null) return 'text-slate-400'
  const n = Number(rate)
  if (n >= 0.05) return 'text-red-300'
  if (n >= 0.01) return 'text-amber-300'
  return 'text-emerald-300'
}

function fmtMs(ms) {
  if (ms == null) return '—'
  const n = Number(ms)
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`
  return `${n.toFixed(0)}ms`
}

function fmtRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60)        return `${s}s ago`
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`
  if (s < 86_400)    return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

function fmtTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch { return '' }
}
