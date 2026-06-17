import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Database,
  GitBranch,
  Inbox,
  Layers,
  PieChart,
  Plug,
  RefreshCcw,
  XCircle,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import MiniLineChart from '../components/charts/MiniLineChart'
import PageTitle from '../components/ui/PageTitle'

// ────────────────────────────────────────────────────────────────────
// formatters
// ────────────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

function formatDateTime(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return s
  }
}

// ────────────────────────────────────────────────────────────────────
// reusable bits (kept local, matching AIUsage.jsx)
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

function StatTile({ icon: Icon, label, value, hint, accent = 'from-indigo-500/40 to-violet-500/40', loading, children }) {
  return (
    <div className="relative rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-medium">
            {label}
          </span>
          {Icon && (
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center text-white/90 ring-1 ring-white/5`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
        {loading ? (
          <Skeleton width="60%" height={32} />
        ) : (
          <div className="text-3xl font-bold text-slate-50 tabular-nums tracking-tight">
            {value ?? '—'}
          </div>
        )}
        {hint && !loading && <div className="mt-2 text-[11px] text-slate-500">{hint}</div>}
        {children}
      </div>
    </div>
  )
}

// pure-SVG horizontal bar chart for category breakdowns
function HBarChart({ data, height = 220, formatValue, color = '#a78bfa' }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map((d) => Number(d.value) || 0), 1)
  const rowH = Math.max(28, Math.floor((height - 16) / data.length))
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = (Number(d.value) / max) * 100
        return (
          <div key={d.label} className="grid grid-cols-[140px_1fr_90px] items-center gap-3" style={{ minHeight: rowH }}>
            <span className="text-xs text-slate-300 truncate font-mono" title={d.label}>{d.label}</span>
            <div className="h-3 bg-slate-800/60 rounded-full overflow-hidden ring-1 ring-inset ring-slate-800/40 relative">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(pct, d.value > 0 ? 4 : 0)}%`,
                  background: `linear-gradient(90deg, ${color}cc, ${color}88)`,
                }}
              />
            </div>
            <span className="text-xs text-slate-300 tabular-nums text-right">
              {formatValue ? formatValue(d.value) : d.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// pure-SVG donut chart for status / provider breakdowns
const PIE_COLORS = ['#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#22d3ee', '#34d399', '#fbbf24']

function DonutChart({ data, size = 200, formatValue }) {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0)
  if (!data || data.length === 0 || total <= 0) return null

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 12
  const innerR = r - 26

  const offsets = data.reduce((acc, d) => {
    const last = acc.length === 0 ? 0 : acc[acc.length - 1]
    acc.push(last + ((Number(d.value) || 0) / total))
    return acc
  }, [])

  const segments = data.map((d, i) => {
    const pct = (Number(d.value) || 0) / total
    const start = i === 0 ? 0 : offsets[i - 1]
    const end   = offsets[i]
    const a0 = start * 2 * Math.PI - Math.PI / 2
    const a1 = end   * 2 * Math.PI - Math.PI / 2
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const xi0 = cx + innerR * Math.cos(a0)
    const yi0 = cy + innerR * Math.sin(a0)
    const xi1 = cx + innerR * Math.cos(a1)
    const yi1 = cy + innerR * Math.sin(a1)
    const large = pct > 0.5 ? 1 : 0
    const path = [
      `M ${x0} ${y0}`,
      `A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
      `L ${xi1} ${yi1}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${xi0} ${yi0}`,
      'Z',
    ].join(' ')
    return { ...d, path, color: PIE_COLORS[i % PIE_COLORS.length], pct }
  })

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
        {segments.map((s) => (
          <path key={s.label} d={s.path} fill={s.color} stroke="#0f172a" strokeWidth="1.5">
            <title>{`${s.label}: ${formatValue ? formatValue(s.value) : s.value}`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-300" fontSize="11">Total</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-slate-100" fontSize="16" fontWeight="600">
          {formatValue ? formatValue(total) : total}
        </text>
      </svg>
      <ul className="space-y-1.5 flex-1 min-w-[180px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-slate-200 font-mono truncate flex-1" title={s.label}>{s.label}</span>
            <span className="text-slate-400 tabular-nums">{formatValue ? formatValue(s.value) : s.value}</span>
            <span className="text-slate-600 text-[10px] tabular-nums w-10 text-right">{(s.pct * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// status / connection pills
// ────────────────────────────────────────────────────────────────────

const MIGRATION_STATUS_TONE = {
  completed: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  running:   'bg-sky-500/15 text-sky-200 border-sky-500/30',
  reviewing: 'bg-violet-500/15 text-violet-200 border-violet-500/30',
  detected:  'bg-amber-500/15 text-amber-200 border-amber-500/30',
  failed:    'bg-red-500/15 text-red-200 border-red-500/30',
}

function MigrationStatusPill({ status }) {
  const tone = MIGRATION_STATUS_TONE[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] capitalize ${tone}`}>
      {status || 'unknown'}
    </span>
  )
}

function ConnectionPill({ connected, syncStatus }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </span>
    )
  }
  const errored = syncStatus && /error|fail/i.test(syncStatus)
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${
        errored
          ? 'bg-red-500/15 border-red-500/30 text-red-200'
          : 'bg-slate-500/15 border-slate-500/30 text-slate-300'
      }`}
    >
      <XCircle className="w-3 h-3" /> {errored ? 'Error' : 'Disconnected'}
    </span>
  )
}

const PROVIDER_LABEL = {
  lark: 'Lark',
  gohighlevel: 'GoHighLevel',
  ghl: 'GoHighLevel',
  meta_ads: 'Meta Ads',
  twilio: 'Twilio',
  stripe: 'Stripe',
  xendit: 'Xendit',
  hitpay: 'HitPay',
  billplz: 'Billplz',
  airwallex: 'Airwallex',
}

function providerLabel(p) {
  if (!p) return 'unknown'
  return PROVIDER_LABEL[p] || p
}

// ────────────────────────────────────────────────────────────────────
// recent migrations table
// ────────────────────────────────────────────────────────────────────

function RecentMigrationsTable({ rows, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={36} rounded="rounded-lg" />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return <EmptyState icon={GitBranch} title="No migrations yet" description="Once orgs start a Lark or GoHighLevel migration, it shows up here." />
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-950/40">
            <th scope="col" className="text-left font-medium px-3 py-2.5">Org</th>
            <th scope="col" className="text-left font-medium px-3 py-2.5">Provider</th>
            <th scope="col" className="text-left font-medium px-3 py-2.5">Status</th>
            <th scope="col" className="text-right font-medium px-3 py-2.5">Items</th>
            <th scope="col" className="text-left font-medium px-3 py-2.5">Created</th>
            <th scope="col" className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition">
              <td className="px-3 py-2.5">
                <div className="text-slate-100 font-medium truncate max-w-[220px]">
                  {r.org_name || r.organization_id || '—'}
                </div>
              </td>
              <td className="px-3 py-2.5 text-slate-300">{providerLabel(r.provider)}</td>
              <td className="px-3 py-2.5"><MigrationStatusPill status={r.status} /></td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{formatNumber(r.item_count ?? 0)}</td>
              <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
              <td className="px-3 py-2.5 text-right">
                {r.organization_id && (
                  <Link to={`/companies/${r.organization_id}`} className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 transition">
                    View
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// recent integration connections list
// ────────────────────────────────────────────────────────────────────

function RecentConnectionsTable({ rows, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={36} rounded="rounded-lg" />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return <EmptyState icon={Plug} title="No integrations yet" description="When orgs connect a provider it shows up here." />
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-950/40">
            <th scope="col" className="text-left font-medium px-3 py-2.5">Org</th>
            <th scope="col" className="text-left font-medium px-3 py-2.5">Provider</th>
            <th scope="col" className="text-left font-medium px-3 py-2.5">State</th>
            <th scope="col" className="text-left font-medium px-3 py-2.5">Last sync</th>
            <th scope="col" className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition">
              <td className="px-3 py-2.5">
                <div className="text-slate-100 font-medium truncate max-w-[220px]">
                  {r.org_name || r.organization_id || '—'}
                </div>
              </td>
              <td className="px-3 py-2.5 text-slate-300">{providerLabel(r.provider)}</td>
              <td className="px-3 py-2.5"><ConnectionPill connected={r.is_connected} syncStatus={r.last_sync_status} /></td>
              <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                {r.last_sync_at ? formatDateTime(r.last_sync_at) : formatDateTime(r.updated_at)}
              </td>
              <td className="px-3 py-2.5 text-right">
                {r.organization_id && (
                  <Link to={`/companies/${r.organization_id}`} className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 transition">
                    View
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// data loading
// ────────────────────────────────────────────────────────────────────

const TREND_WEEKS = 10

function weekStart(d) {
  // Monday-anchored week, matching Postgres date_trunc('week').
  const date = new Date(d)
  const day = (date.getUTCDay() + 6) % 7 // 0 = Monday
  date.setUTCDate(date.getUTCDate() - day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

export default function MigrationsIntegrations() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)

  const [migrations, setMigrations] = useState([])
  const [itemsByMigration, setItemsByMigration] = useState({})
  const [integrations, setIntegrations] = useState([])
  const [orgNames, setOrgNames] = useState({})

  // integration_requests is created by a parallel workstream — may not
  // exist yet. We track that separately so we can render an explicit
  // "not enabled yet" empty state rather than failing the whole page.
  const [requests, setRequests] = useState([])
  const [requestsAvailable, setRequestsAvailable] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Migrations + integrations come straight from their tables. The admin
    // session is a super admin, and both tables' RLS policies include
    // `OR is_super_admin()`, so these reads span every org.
    const [migRes, intRes, itemsRes] = await Promise.all([
      supabase
        .from('lark_migrations')
        .select('id, organization_id, provider, status, created_at, started_at, completed_at')
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('integrations')
        .select('id, organization_id, provider, is_connected, last_sync_status, last_sync_at, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(2000),
      // Per-migration item counts. We pull the (migration_id) column and tally
      // client-side — keeps us off any RPC that may not be deployed.
      supabase
        .from('lark_migration_items')
        .select('migration_id')
        .limit(100000),
    ])

    if (migRes.error) {
      setError(migRes.error.message || 'Failed to load migrations')
      setMigrations([])
    } else {
      setMigrations(Array.isArray(migRes.data) ? migRes.data : [])
    }

    if (intRes.error) {
      // Don't gate the whole page on integrations — surface migrations regardless.
      if (!migRes.error) setError(intRes.error.message || 'Failed to load integrations')
      setIntegrations([])
    } else {
      setIntegrations(Array.isArray(intRes.data) ? intRes.data : [])
    }

    if (itemsRes.error || !Array.isArray(itemsRes.data)) {
      setItemsByMigration({})
    } else {
      const tally = {}
      for (const row of itemsRes.data) {
        if (!row.migration_id) continue
        tally[row.migration_id] = (tally[row.migration_id] || 0) + 1
      }
      setItemsByMigration(tally)
    }

    // Org names for the recent tables — separate select, mapped client-side
    // (super-admin can read organizations cross-org).
    const orgIds = new Set()
    for (const m of migRes.data || []) if (m.organization_id) orgIds.add(m.organization_id)
    for (const i of intRes.data || []) if (i.organization_id) orgIds.add(i.organization_id)
    if (orgIds.size > 0) {
      const { data: orgRows } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .in('id', Array.from(orgIds))
      const map = {}
      for (const o of orgRows || []) map[o.id] = o.name || o.slug || o.id
      setOrgNames(map)
    } else {
      setOrgNames({})
    }

    // integration_requests — DEFENSIVE. New table from a parallel workstream;
    // may not exist or may be empty. Never let it error the page.
    try {
      const reqRes = await supabase
        .from('integration_requests')
        .select('id, organization_id, kind, app_name, note, status, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (reqRes.error) {
        // 42P01 = relation does not exist; PGRST205 = table missing from schema cache.
        const code = reqRes.error.code
        const missing =
          code === '42P01' ||
          code === 'PGRST205' ||
          /relation .* does not exist/i.test(reqRes.error.message || '') ||
          /could not find the table/i.test(reqRes.error.message || '')
        setRequestsAvailable(!missing)
        setRequests([])
      } else {
        setRequestsAvailable(true)
        setRequests(Array.isArray(reqRes.data) ? reqRes.data : [])
      }
    } catch {
      setRequestsAvailable(false)
      setRequests([])
    }

    setLoading(false)
    setRefreshedAt(new Date())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // ── derived: migrations
  const migTotal = migrations.length
  const migOrgCount = useMemo(
    () => new Set(migrations.map((m) => m.organization_id).filter(Boolean)).size,
    [migrations],
  )

  const migByProvider = useMemo(() => {
    const m = {}
    for (const r of migrations) {
      const k = providerLabel(r.provider)
      m[k] = (m[k] || 0) + 1
    }
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [migrations])

  const migByStatus = useMemo(() => {
    const order = ['detected', 'reviewing', 'running', 'completed', 'failed']
    const m = {}
    for (const r of migrations) {
      const k = r.status || 'unknown'
      m[k] = (m[k] || 0) + 1
    }
    return Object.entries(m)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => {
        const ai = order.indexOf(a.label); const bi = order.indexOf(b.label)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
  }, [migrations])

  const totalItemsImported = useMemo(
    () => Object.values(itemsByMigration).reduce((s, n) => s + n, 0),
    [itemsByMigration],
  )

  const completedCount = useMemo(
    () => migrations.filter((m) => m.status === 'completed').length,
    [migrations],
  )
  const failedCount = useMemo(
    () => migrations.filter((m) => m.status === 'failed').length,
    [migrations],
  )

  const migTrend = useMemo(() => {
    // Build the last TREND_WEEKS week buckets, anchored on Monday.
    const buckets = []
    const now = weekStart(new Date())
    for (let i = TREND_WEEKS - 1; i >= 0; i--) {
      const start = new Date(now)
      start.setUTCDate(start.getUTCDate() - i * 7)
      buckets.push({ start, count: 0 })
    }
    for (const m of migrations) {
      if (!m.created_at) continue
      const ws = weekStart(m.created_at).getTime()
      const b = buckets.find((x) => x.start.getTime() === ws)
      if (b) b.count += 1
    }
    return buckets.map((b) => ({
      label: b.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: b.count,
    }))
  }, [migrations])

  const recentMigrations = useMemo(() => {
    return migrations.slice(0, 12).map((m) => ({
      ...m,
      org_name: orgNames[m.organization_id],
      item_count: itemsByMigration[m.id] || 0,
    }))
  }, [migrations, orgNames, itemsByMigration])

  // ── derived: integrations
  const intTotal = integrations.length
  const intConnected = useMemo(() => integrations.filter((i) => i.is_connected).length, [integrations])
  const intNotConnected = intTotal - intConnected
  const intErrored = useMemo(
    () => integrations.filter((i) => !i.is_connected && i.last_sync_status && /error|fail/i.test(i.last_sync_status)).length,
    [integrations],
  )

  const intByProvider = useMemo(() => {
    const m = {}
    for (const r of integrations) {
      const k = providerLabel(r.provider)
      m[k] = (m[k] || 0) + 1
    }
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [integrations])

  const recentConnections = useMemo(() => {
    return integrations.slice(0, 12).map((i) => ({ ...i, org_name: orgNames[i.organization_id] }))
  }, [integrations, orgNames])

  // ── derived: integration requests (customer demand)
  const requestsByApp = useMemo(() => {
    const m = {}
    for (const r of requests) {
      const k = r.app_name || 'Unspecified'
      m[k] = (m[k] || 0) + 1
    }
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 12)
  }, [requests])

  const requestsByKind = useMemo(() => {
    const appRequests = requests.filter((r) => r.kind === 'app_request').length
    const migrationCalls = requests.filter((r) => r.kind === 'migration_call').length
    return { appRequests, migrationCalls }
  }, [requests])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageTitle title="Migrations & Integrations" />

      {/* Header */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Layers className="w-6 h-6 text-indigo-300" aria-hidden="true" />
            Migrations &amp; Integrations
          </h1>
          <p className="text-sm text-slate-500">
            Migration and connection activity across every org on the platform.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshedAt && (
            <span className="text-[11px] text-slate-600 hidden md:inline">
              Refreshed{' '}
              <span className="text-slate-400">
                {refreshedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </span>
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <Banner tone="danger" title="Failed to load some data">{error}</Banner>
      )}

      {/* ── Migrations section ─────────────────────────────────────── */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3 flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-indigo-300" />
          Migrations
        </h2>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon={GitBranch}
            label="Total migrations"
            value={formatNumber(migTotal)}
            hint={`Across ${formatNumber(migOrgCount)} ${migOrgCount === 1 ? 'org' : 'orgs'}`}
            accent="from-indigo-500/40 to-indigo-700/40"
            loading={loading}
          />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={formatNumber(completedCount)}
            hint={failedCount > 0 ? `${formatNumber(failedCount)} failed` : 'No failures'}
            accent="from-emerald-500/40 to-emerald-700/40"
            loading={loading}
          />
          <StatTile
            icon={Boxes}
            label="Items imported"
            value={formatNumber(totalItemsImported)}
            hint="Rows written by migrations"
            accent="from-violet-500/40 to-violet-700/40"
            loading={loading}
          />
          <StatTile
            icon={Database}
            label="Providers"
            value={formatNumber(migByProvider.length)}
            hint={migByProvider.map((p) => p.label).join(', ') || '—'}
            accent="from-fuchsia-500/40 to-fuchsia-700/40"
            loading={loading}
          />
        </div>

        {/* charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
          <SectionCard
            title="Migrations by status"
            subtitle="Every migration, grouped by lifecycle state"
            className="lg:col-span-2"
            action={<PieChart className="w-4 h-4 text-slate-500" />}
          >
            {loading ? (
              <Skeleton width="100%" height={200} rounded="rounded-xl" />
            ) : migByStatus.length === 0 ? (
              <EmptyState icon={PieChart} title="No migrations" />
            ) : (
              <DonutChart data={migByStatus} size={200} formatValue={formatNumber} />
            )}
          </SectionCard>

          <SectionCard
            title="Migrations over time"
            subtitle={`Last ${TREND_WEEKS} weeks · count per week`}
            className="lg:col-span-3"
            action={<BarChart3 className="w-4 h-4 text-slate-500" />}
          >
            {loading ? (
              <Skeleton width="100%" height={220} rounded="rounded-xl" />
            ) : (
              <MiniLineChart data={migTrend} height={220} color="#818cf8" formatValue={(v) => formatNumber(Math.round(v))} />
            )}
          </SectionCard>
        </div>

        {/* provider breakdown + recent table */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
          <SectionCard
            title="Migrations by provider"
            subtitle="Lark vs GoHighLevel"
            className="lg:col-span-2"
          >
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} width="100%" height={28} />)}
              </div>
            ) : migByProvider.length === 0 ? (
              <EmptyState icon={BarChart3} title="No provider data" />
            ) : (
              <HBarChart data={migByProvider} formatValue={formatNumber} color="#818cf8" />
            )}
          </SectionCard>

          <SectionCard
            title="Recent migrations"
            subtitle="Most recent across all orgs"
            className="lg:col-span-3"
          >
            <RecentMigrationsTable rows={recentMigrations} loading={loading} />
          </SectionCard>
        </div>
      </div>

      {/* ── Integrations section ───────────────────────────────────── */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3 flex items-center gap-2 pt-2">
          <Plug className="w-3.5 h-3.5 text-emerald-300" />
          Integrations
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon={Plug}
            label="Total integrations"
            value={formatNumber(intTotal)}
            hint="Provider connections created"
            accent="from-indigo-500/40 to-indigo-700/40"
            loading={loading}
          />
          <StatTile
            icon={CheckCircle2}
            label="Connected"
            value={formatNumber(intConnected)}
            hint={`${formatNumber(intNotConnected)} not connected`}
            accent="from-emerald-500/40 to-emerald-700/40"
            loading={loading}
          />
          <StatTile
            icon={XCircle}
            label="Errored"
            value={formatNumber(intErrored)}
            hint="Last sync reported an error"
            accent="from-amber-500/40 to-amber-700/40"
            loading={loading}
          />
          <StatTile
            icon={Database}
            label="Providers"
            value={formatNumber(intByProvider.length)}
            hint={intByProvider.map((p) => p.label).join(', ') || '—'}
            accent="from-fuchsia-500/40 to-fuchsia-700/40"
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
          <SectionCard
            title="Integrations by provider"
            subtitle="How many connections per provider"
            className="lg:col-span-2"
            action={<PieChart className="w-4 h-4 text-slate-500" />}
          >
            {loading ? (
              <Skeleton width="100%" height={200} rounded="rounded-xl" />
            ) : intByProvider.length === 0 ? (
              <EmptyState icon={PieChart} title="No integrations" />
            ) : (
              <DonutChart data={intByProvider} size={200} formatValue={formatNumber} />
            )}
          </SectionCard>

          <SectionCard
            title="Recent connections"
            subtitle="Most recently updated across all orgs"
            className="lg:col-span-3"
          >
            <RecentConnectionsTable rows={recentConnections} loading={loading} />
          </SectionCard>
        </div>
      </div>

      {/* ── Integration requests (customer demand) ─────────────────── */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3 flex items-center gap-2 pt-2">
          <Inbox className="w-3.5 h-3.5 text-sky-300" />
          Customer requests
        </h2>

        {!requestsAvailable ? (
          <SectionCard title="Integration requests" subtitle="What customers are asking us to build or migrate">
            <EmptyState
              icon={Inbox}
              title="Requests not enabled yet"
              description="The integration_requests table is not live on this database yet. Once customers can submit app requests and migration calls, the demand breakdown appears here."
            />
          </SectionCard>
        ) : requests.length === 0 ? (
          <SectionCard title="Integration requests" subtitle="What customers are asking us to build or migrate">
            <EmptyState icon={Inbox} title="No requests yet" description="No customers have requested an app or a migration call yet." />
          </SectionCard>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                icon={Inbox}
                label="Total requests"
                value={formatNumber(requests.length)}
                hint="App requests + migration calls"
                accent="from-sky-500/40 to-sky-700/40"
                loading={loading}
              />
              <StatTile
                icon={Plug}
                label="App requests"
                value={formatNumber(requestsByKind.appRequests)}
                hint="Customers asking for an integration"
                accent="from-indigo-500/40 to-indigo-700/40"
                loading={loading}
              />
              <StatTile
                icon={GitBranch}
                label="Migration calls"
                value={formatNumber(requestsByKind.migrationCalls)}
                hint="Customers requesting a migration call"
                accent="from-violet-500/40 to-violet-700/40"
                loading={loading}
              />
              <StatTile
                icon={Database}
                label="Distinct apps"
                value={formatNumber(requestsByApp.length)}
                hint="Unique apps requested"
                accent="from-fuchsia-500/40 to-fuchsia-700/40"
                loading={loading}
              />
            </div>

            <SectionCard
              title="Most requested apps"
              subtitle="Top apps customers want us to support"
              className="mt-4"
            >
              {requestsByApp.length === 0 ? (
                <EmptyState icon={Inbox} title="No app requests" />
              ) : (
                <HBarChart data={requestsByApp} formatValue={formatNumber} color="#38bdf8" />
              )}
            </SectionCard>
          </>
        )}
      </div>
    </div>
  )
}
