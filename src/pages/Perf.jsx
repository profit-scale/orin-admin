import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Database,
  Gauge,
  HardDrive,
  RefreshCcw,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'

// ────────────────────────────────────────────────────────────────────
// formatters
// ────────────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

function formatBytes(bytes) {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = Number(bytes)
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`
}

// Color-code latency: <100ms green, <500ms yellow, ≥500ms red.
function meanMsTone(ms) {
  if (ms == null) return 'text-slate-400'
  if (ms >= 500) return 'text-red-300'
  if (ms >= 100) return 'text-amber-300'
  return 'text-emerald-300'
}

// ────────────────────────────────────────────────────────────────────
// section card (matches Dashboard.jsx pattern)
// ────────────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur ${className}`}>
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// stat tile
// ────────────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, hint, tone = 'neutral', loading }) {
  const toneText =
    tone === 'good'    ? 'text-emerald-300' :
    tone === 'warn'    ? 'text-amber-300'   :
    tone === 'danger'  ? 'text-red-300'     :
    'text-slate-100'
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-500" />}
        <span>{label}</span>
      </div>
      {loading ? (
        <Skeleton width="60%" height={28} />
      ) : (
        <div className={`text-2xl font-semibold tabular-nums ${toneText}`}>
          {value ?? '—'}
        </div>
      )}
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// query-row table (slow + frequent share columns)
// ────────────────────────────────────────────────────────────────────

function QueryTable({ rows, loading, emptyText, sortByLabel }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={36} rounded="rounded-lg" />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic py-4">{emptyText || 'No data.'}</div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10">
          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
            <th className="text-left font-medium px-3 py-2 w-[55%]">Query</th>
            <th className="text-right font-medium px-3 py-2">Calls</th>
            <th className="text-right font-medium px-3 py-2">Mean</th>
            <th className="text-right font-medium px-3 py-2">Total</th>
            <th className="text-right font-medium px-3 py-2">% total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-t border-slate-800/40 hover:bg-slate-800/30 transition align-top"
            >
              <td className="px-3 py-2">
                <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all max-h-24 overflow-y-auto leading-snug">
                  {r.query}
                </pre>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                {formatNumber(r.calls)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums font-medium ${meanMsTone(Number(r.mean_ms))}`}>
                {r.mean_ms == null ? '—' : `${Number(r.mean_ms).toFixed(2)} ms`}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                {r.total_ms == null ? '—' : `${Number(r.total_ms).toFixed(0)} ms`}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                {r.pct_of_total == null ? '—' : `${Number(r.pct_of_total).toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sortByLabel && (
        <div className="px-3 py-2 text-[10px] text-slate-600 border-t border-slate-800/40 bg-slate-950/40">
          sorted by {sortByLabel}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// largest-tables list
// ────────────────────────────────────────────────────────────────────

function LargestTables({ rows, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={36} rounded="rounded-lg" />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return <div className="text-xs text-slate-500 italic py-4">No tables found.</div>
  }
  const max = Math.max(...rows.map((r) => Number(r.size_bytes) || 0), 1)
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = (Number(r.size_bytes) / max) * 100
        return (
          <li key={r.table_name}>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="font-mono text-slate-200 truncate">{r.table_name}</span>
              <span className="text-slate-400 tabular-nums">
                {r.total_size}
                <span className="text-slate-600 ml-2">
                  · {formatNumber(r.row_count)} rows
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden ring-1 ring-inset ring-slate-800/40">
              <div
                className="h-full bg-gradient-to-r from-indigo-500/70 to-violet-500/70 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ────────────────────────────────────────────────────────────────────
// page
// ────────────────────────────────────────────────────────────────────

export default function Perf() {
  const [slow, setSlow] = useState([])
  const [frequent, setFrequent] = useState([])
  const [health, setHealth] = useState(null)
  const [tables, setTables] = useState([])

  const [slowLoading, setSlowLoading] = useState(true)
  const [frequentLoading, setFrequentLoading] = useState(true)
  const [healthLoading, setHealthLoading] = useState(true)
  const [tablesLoading, setTablesLoading] = useState(true)

  const [missingMigrations, setMissingMigrations] = useState(false)
  const [pgssMessage, setPgssMessage] = useState(null)
  const [error, setError] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)

  const refresh = useCallback(async () => {
    setError(null)
    setSlowLoading(true)
    setFrequentLoading(true)
    setHealthLoading(true)
    setTablesLoading(true)

    const [slowRes, freqRes, healthRes, tablesRes] = await Promise.all([
      supabase.rpc('admin_top_slow_queries', { p_limit: 20 }),
      supabase.rpc('admin_top_frequent_queries', { p_limit: 10 }),
      supabase.rpc('admin_db_health'),
      supabase.rpc('admin_largest_tables', { p_limit: 10 }),
    ])

    // ── slow
    if (slowRes.error) {
      if (isMissingFunction(slowRes.error)) setMissingMigrations(true)
      else setError(slowRes.error.message || 'Failed to load slow queries')
      setSlow([])
    } else {
      const rows = Array.isArray(slowRes.data) ? slowRes.data : []
      // The RPC returns one synthetic row with `available: false` when
      // pg_stat_statements is missing. Detect that and surface a banner.
      if (rows.length === 1 && rows[0]?.available === false) {
        setPgssMessage(rows[0].message || 'pg_stat_statements not available')
        setSlow([])
      } else {
        setPgssMessage(null)
        setSlow(rows)
      }
    }
    setSlowLoading(false)

    // ── frequent
    if (freqRes.error) {
      if (isMissingFunction(freqRes.error)) setMissingMigrations(true)
      // else: silent — slow-query error message already covers it
      setFrequent([])
    } else {
      const rows = Array.isArray(freqRes.data) ? freqRes.data : []
      if (rows.length === 1 && rows[0]?.available === false) {
        setFrequent([])
      } else {
        setFrequent(rows)
      }
    }
    setFrequentLoading(false)

    // ── health
    if (healthRes.error) {
      if (isMissingFunction(healthRes.error)) setMissingMigrations(true)
      else if (!error) setError(healthRes.error.message || 'Failed to load db health')
      setHealth(null)
    } else {
      const row = Array.isArray(healthRes.data) ? healthRes.data[0] : healthRes.data
      setHealth(row || null)
    }
    setHealthLoading(false)

    // ── tables
    if (tablesRes.error) {
      if (isMissingFunction(tablesRes.error)) setMissingMigrations(true)
      else if (!error) setError(tablesRes.error.message || 'Failed to load tables')
      setTables([])
    } else {
      setTables(Array.isArray(tablesRes.data) ? tablesRes.data : [])
    }
    setTablesLoading(false)

    setRefreshedAt(new Date())
  }, [error])

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connPct =
    health?.active_connections != null && health?.max_connections
      ? (Number(health.active_connections) / Number(health.max_connections)) * 100
      : null

  const connTone =
    connPct == null ? 'neutral' :
    connPct >= 80   ? 'danger'  :
    connPct >= 60   ? 'warn'    :
    'good'

  const cacheTone =
    health?.cache_hit_ratio == null ? 'neutral' :
    Number(health.cache_hit_ratio) >= 99 ? 'good' :
    Number(health.cache_hit_ratio) >= 95 ? 'warn' :
    'danger'

  const idleTone =
    health?.idle_in_tx == null ? 'neutral' :
    Number(health.idle_in_tx) >= 5 ? 'danger' :
    Number(health.idle_in_tx) >= 1 ? 'warn'   :
    'good'

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Performance</h1>
          <p className="text-sm text-slate-500">
            Database health and slow-query diagnostics, platform-wide.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshedAt && (
            <span className="text-[11px] text-slate-600 hidden md:inline">
              Refreshed{' '}
              <span className="text-slate-400">
                {refreshedAt.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </span>
          )}
          <button
            onClick={refresh}
            disabled={slowLoading || frequentLoading || healthLoading || tablesLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw
              className={`w-3.5 h-3.5 ${
                slowLoading || frequentLoading || healthLoading || tablesLoading
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Refresh
          </button>
        </div>
      </div>

      {missingMigrations && (
        <Banner tone="warning" title="Migration 081 not yet applied">
          The performance RPCs (
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_top_slow_queries</code>,{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_db_health</code>,{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_largest_tables</code>
          ) are missing. Apply migration{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">081_admin_perf_rpcs.sql</code>{' '}
          to your Supabase project.
        </Banner>
      )}

      {pgssMessage && !missingMigrations && (
        <Banner tone="warning" title="pg_stat_statements not available">
          {pgssMessage} Database-size and largest-table panels still work.
        </Banner>
      )}

      {error && !missingMigrations && (
        <Banner tone="danger" title="Failed to load performance data">
          {error}
        </Banner>
      )}

      {/* DB health stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={HardDrive}
          label="Database size"
          value={health?.db_size_pretty ?? formatBytes(health?.db_size_bytes)}
          hint="Total on-disk footprint"
          loading={healthLoading}
        />
        <StatTile
          icon={Activity}
          label="Connections"
          value={
            health
              ? `${formatNumber(health.active_connections)} / ${formatNumber(health.max_connections)}`
              : null
          }
          hint={connPct != null ? `${connPct.toFixed(0)}% of max` : 'active / limit'}
          tone={connTone}
          loading={healthLoading}
        />
        <StatTile
          icon={Gauge}
          label="Cache hit ratio"
          value={
            health?.cache_hit_ratio == null
              ? null
              : `${Number(health.cache_hit_ratio).toFixed(2)}%`
          }
          hint="Buffer cache vs disk reads"
          tone={cacheTone}
          loading={healthLoading}
        />
        <StatTile
          icon={TrendingUp}
          label="Idle in transaction"
          value={health?.idle_in_tx != null ? formatNumber(health.idle_in_tx) : null}
          hint="Sessions holding open txns"
          tone={idleTone}
          loading={healthLoading}
        />
      </div>

      {/* Slow queries */}
      <SectionCard
        title="Top 20 slowest queries"
        subtitle="Highest mean execution time. Color-coded: green <100 ms · amber <500 ms · red ≥500 ms."
        action={
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>pg_stat_statements</span>
          </div>
        }
      >
        <QueryTable
          rows={slow}
          loading={slowLoading}
          emptyText={
            pgssMessage
              ? 'pg_stat_statements unavailable.'
              : 'No queries recorded yet.'
          }
          sortByLabel="mean_exec_time DESC"
        />
      </SectionCard>

      {/* Frequent queries + largest tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Top 10 most-frequent queries"
          subtitle="Highest call count — these are your hottest paths"
        >
          <QueryTable
            rows={frequent}
            loading={frequentLoading}
            emptyText={
              pgssMessage
                ? 'pg_stat_statements unavailable.'
                : 'No queries recorded yet.'
            }
            sortByLabel="calls DESC"
          />
        </SectionCard>

        <SectionCard
          title="Top 10 largest tables"
          subtitle="By total relation size (heap + indexes + toast)"
        >
          <LargestTables rows={tables} loading={tablesLoading} />
        </SectionCard>
      </div>
    </div>
  )
}
