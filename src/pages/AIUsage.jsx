import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Coins,
  DollarSign,
  Gauge,
  PieChart,
  RefreshCcw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import MiniLineChart from '../components/charts/MiniLineChart'
import AIUsageLive from '../components/admin/AIUsageLive'
import PageTitle from '../components/ui/PageTitle'

// ────────────────────────────────────────────────────────────────────
// formatters
// ────────────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

function formatCents(cents) {
  if (cents == null) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((cents || 0) / 100)
}

function formatCentsShort(cents) {
  if (cents == null) return '$0'
  const usd = (cents || 0) / 100
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}k`
  if (usd >= 10) return `$${usd.toFixed(0)}`
  return `$${usd.toFixed(2)}`
}

// ────────────────────────────────────────────────────────────────────
// reusable bits
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

// ────────────────────────────────────────────────────────────────────
// pure-SVG horizontal bar chart for category breakdowns
// ────────────────────────────────────────────────────────────────────

function HBarChart({ data, height = 260, formatValue, color = '#a78bfa' }) {
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

// ────────────────────────────────────────────────────────────────────
// pure-SVG donut chart for surface breakdown
// ────────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#22d3ee', '#34d399', '#fbbf24']

function DonutChart({ data, size = 200, formatValue }) {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0)
  if (!data || data.length === 0 || total <= 0) return null

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 12
  const innerR = r - 26

  // Pre-compute cumulative offsets without mutating across render — one pass
  // to build offsets, then a second to derive paths. Keeps the lint rule
  // against post-render reassignment happy.
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
          <path
            key={s.label}
            d={s.path}
            fill={s.color}
            stroke="#0f172a"
            strokeWidth="1.5"
          >
            <title>{`${s.label}: ${formatValue ? formatValue(s.value) : s.value}`}</title>
          </path>
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-slate-300"
          fontSize="11"
        >
          Total
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-slate-100"
          fontSize="16"
          fontWeight="600"
        >
          {formatValue ? formatValue(total) : total}
        </text>
      </svg>
      <ul className="space-y-1.5 flex-1 min-w-[180px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-slate-200 font-mono truncate flex-1" title={s.label}>{s.label}</span>
            <span className="text-slate-400 tabular-nums">
              {formatValue ? formatValue(s.value) : s.value}
            </span>
            <span className="text-slate-600 text-[10px] tabular-nums w-10 text-right">
              {(s.pct * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// inline sparkline (very small line chart)
// ────────────────────────────────────────────────────────────────────

function Sparkline({ data, width = 120, height = 28, color = '#818cf8' }) {
  if (!data || data.length === 0) return null
  const values = data.map((d) => Number(d.value) || 0)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const xStep = data.length > 1 ? width / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = i * xStep
    const y = height - ((Number(d.value) - min) / span) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────
// per-org table
// ────────────────────────────────────────────────────────────────────

function OrgUsageTable({ rows, loading }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('cost_cents')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rows || []
    if (q) {
      list = list.filter((r) =>
        [r.org_name, r.org_slug, r.plan]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q))
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = a[sortBy]
      const bv = b[sortBy]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, search, sortBy, sortDir])

  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir('desc') }
  }

  const sortIndicator = (col) =>
    sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : null

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={36} rounded="rounded-lg" />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No AI usage yet"
        description="Once orgs start making AI calls, the top consumers will appear here."
      />
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orgs"
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <span className="text-[11px] text-slate-500">
          {sorted.length} of {rows.length} orgs
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-950/40">
              <th
                onClick={() => toggleSort('org_name')}
                className="text-left font-medium px-3 py-2.5 cursor-pointer select-none hover:text-slate-200 transition"
              >
                <span className="inline-flex items-center gap-1">
                  Org{' '}
                  {sortIndicator('org_name') && (
                    <span className="text-indigo-300">{sortIndicator('org_name')}</span>
                  )}
                </span>
              </th>
              <th
                onClick={() => toggleSort('plan')}
                className="text-left font-medium px-3 py-2.5 cursor-pointer select-none hover:text-slate-200 transition"
              >
                <span className="inline-flex items-center gap-1">
                  Plan{' '}
                  {sortIndicator('plan') && (
                    <span className="text-indigo-300">{sortIndicator('plan')}</span>
                  )}
                </span>
              </th>
              <th
                onClick={() => toggleSort('calls_used')}
                className="text-right font-medium px-3 py-2.5 cursor-pointer select-none hover:text-slate-200 transition"
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Calls used / limit{' '}
                  {sortIndicator('calls_used') && (
                    <span className="text-indigo-300">{sortIndicator('calls_used')}</span>
                  )}
                </span>
              </th>
              <th
                onClick={() => toggleSort('tokens_used')}
                className="text-right font-medium px-3 py-2.5 cursor-pointer select-none hover:text-slate-200 transition"
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Tokens used / limit{' '}
                  {sortIndicator('tokens_used') && (
                    <span className="text-indigo-300">{sortIndicator('tokens_used')}</span>
                  )}
                </span>
              </th>
              <th
                onClick={() => toggleSort('cost_cents')}
                className="text-right font-medium px-3 py-2.5 cursor-pointer select-none hover:text-slate-200 transition"
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Cost{' '}
                  {sortIndicator('cost_cents') && (
                    <span className="text-indigo-300">{sortIndicator('cost_cents')}</span>
                  )}
                </span>
              </th>
              <th scope="col" className="text-left font-medium px-3 py-2.5">Throttled</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const callPct = r.pct_of_call_limit
              const isAtRisk = callPct != null && callPct >= 80
              return (
                <tr
                  key={r.organization_id}
                  className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition"
                >
                  <td className="px-3 py-2.5">
                    <div className="text-slate-100 font-medium truncate max-w-[220px]">
                      {r.org_name || r.org_slug || r.organization_id}
                    </div>
                    {r.org_slug && r.org_name && (
                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-[220px]">{r.org_slug}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300 capitalize">{r.plan || 'trial'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="tabular-nums text-slate-100">
                      {formatNumber(r.calls_used)}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {' / '}
                      {r.monthly_call_limit == null ? '∞' : formatNumber(r.monthly_call_limit)}
                    </span>
                    {callPct != null && (
                      <div className="mt-1 h-1 bg-slate-800/60 rounded-full overflow-hidden ml-auto w-24">
                        <div
                          className={`h-full rounded-full ${isAtRisk ? 'bg-amber-400' : 'bg-indigo-400'}`}
                          style={{ width: `${Math.min(100, callPct)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="text-slate-100">{formatNumber(r.tokens_used)}</span>
                    <span className="text-slate-500">
                      {' / '}
                      {r.monthly_token_limit == null ? '∞' : formatNumber(r.monthly_token_limit)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">
                    {formatCents(r.cost_cents)}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.is_throttled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-500/15 border border-red-500/30 text-red-200">
                        Throttled
                      </span>
                    ) : isAtRisk ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-200">
                        At risk
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[11px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      to={`/companies/${r.organization_id}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 transition"
                    >
                      View
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// spend vs caps — per-org cost against the monthly cap (the hard limit)
// ────────────────────────────────────────────────────────────────────

function capState(row) {
  const pct = row.pct_of_cost_cap == null ? null : Number(row.pct_of_cost_cap)
  const alertAt = row.alert_at_pct == null ? 80 : Number(row.alert_at_pct)
  if (row.is_throttled || (pct != null && pct >= 100)) return 'over'
  if (pct != null && pct >= alertAt) return 'alert'
  return 'ok'
}

function SpendVsCapsTable({ rows, loading }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rows || []
    if (q) list = list.filter((r) => String(r.organization || '').toLowerCase().includes(q))
    return list // RPC already sorts: throttled first, then closest to cap
  }, [rows, search])

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
    return (
      <EmptyState
        icon={Gauge}
        title="No organizations yet"
        description="Per-org spend against the monthly cost cap will appear here."
      />
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orgs"
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <span className="text-[11px] text-slate-500">{filtered.length} of {rows.length} orgs</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-950/40">
              <th scope="col" className="text-left font-medium px-3 py-2.5">Org</th>
              <th scope="col" className="text-right font-medium px-3 py-2.5">AI spend / cap</th>
              <th scope="col" className="text-left font-medium px-3 py-2.5 w-48">% of cap</th>
              <th scope="col" className="text-right font-medium px-3 py-2.5">Daily req limit</th>
              <th scope="col" className="text-left font-medium px-3 py-2.5">State</th>
              <th scope="col" className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const pct = r.pct_of_cost_cap == null ? null : Number(r.pct_of_cost_cap)
              const state = capState(r)
              const barColor = state === 'over' ? 'bg-red-400' : state === 'alert' ? 'bg-amber-400' : 'bg-emerald-400'
              const rowTint = state === 'over' ? 'bg-red-500/[0.04]' : state === 'alert' ? 'bg-amber-500/[0.04]' : ''
              return (
                <tr key={r.organization_id} className={`border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition ${rowTint}`}>
                  <td className="px-3 py-2.5">
                    <div className="text-slate-100 font-medium truncate max-w-[220px]">
                      {r.organization || r.organization_id}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">{formatNumber(r.ai_calls_used)} calls used</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="text-slate-100">{formatCents(r.ai_cost_cents_used)}</span>
                    <span className="text-slate-500">{' / '}{r.ai_cost_cap_cents ? formatCents(r.ai_cost_cap_cents) : '∞'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden flex-1 min-w-[80px]">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct == null ? 0 : Math.min(100, pct)}%` }} />
                      </div>
                      <span className="text-xs text-slate-300 tabular-nums w-12 text-right">{pct == null ? '—' : `${pct.toFixed(0)}%`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{formatNumber(r.daily_request_limit)}</td>
                  <td className="px-3 py-2.5">
                    {state === 'over' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-500/15 border border-red-500/30 text-red-200">
                        {r.is_throttled ? `Stopped · ${r.throttled_reason || 'cap'}` : 'Over cap'}
                      </span>
                    ) : state === 'alert' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-200">
                        Near cap
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300/80">
                        OK
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link to={`/companies/${r.organization_id}`} className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 transition">
                      View
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RecentBudgetAlerts({ rows, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={28} />
        ))}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No budget alerts"
        description="When an org crosses its budget alert threshold, it shows up here."
      />
    )
  }
  return (
    <ul className="divide-y divide-slate-800/40">
      {rows.map((e) => {
        const pct = e.payload?.pct
        return (
          <li key={e.id} className="flex items-center gap-3 py-2.5">
            <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-200 truncate">
                <span className="font-medium">{e.organization || 'Unknown org'}</span>
                {pct != null && <span className="text-amber-300"> · {Number(pct).toFixed(0)}% of budget</span>}
              </div>
              <div className="text-[11px] text-slate-500">
                {e.created_at ? new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
              </div>
            </div>
            {e.organization_id && (
              <Link to={`/companies/${e.organization_id}`} className="text-xs text-indigo-300 hover:text-indigo-200 shrink-0">View</Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ────────────────────────────────────────────────────────────────────
// page
// ────────────────────────────────────────────────────────────────────

export default function AIUsage() {
  const [period, setPeriod] = useState('month') // 'today' | 'week' | 'month'

  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [orgs, setOrgs] = useState([])
  const [orgsLoading, setOrgsLoading] = useState(true)

  const [bySurface, setBySurface] = useState([])
  const [bySurfaceLoading, setBySurfaceLoading] = useState(true)

  const [trend, setTrend] = useState([])
  const [trendLoading, setTrendLoading] = useState(true)

  const [byModel, setByModel] = useState([])
  const [byModelLoading, setByModelLoading] = useState(true)

  const [perMinute, setPerMinute] = useState([])
  const [perMinuteLoading, setPerMinuteLoading] = useState(true)

  const [caps, setCaps] = useState([])
  const [capsLoading, setCapsLoading] = useState(true)

  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(true)

  const [missingMigrations, setMissingMigrations] = useState(false)
  const [error, setError] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)

  const refresh = useCallback(async () => {
    setError(null)
    setSummaryLoading(true)
    setOrgsLoading(true)
    setBySurfaceLoading(true)
    setTrendLoading(true)
    setByModelLoading(true)
    setPerMinuteLoading(true)
    setCapsLoading(true)
    setAlertsLoading(true)

    const [sumRes, orgRes, surfRes, trendRes, modelRes, perMinRes, capsRes, alertsRes] = await Promise.all([
      supabase.rpc('admin_ai_usage_summary',     { p_period: period }),
      supabase.rpc('admin_ai_usage_by_org',      { p_period: period, p_limit: 50 }),
      supabase.rpc('admin_ai_usage_by_surface',  { p_days: 30 }),
      supabase.rpc('admin_ai_usage_daily_trend', { p_days: 90 }),
      supabase.rpc('admin_ai_usage_by_model',    { p_days: 30 }),
      supabase.rpc('admin_ai_calls_per_minute',  { p_minutes: 60 }),
      supabase.rpc('admin_org_usage_overview',   { p_limit: 500 }),
      supabase.rpc('admin_recent_observe_events', { p_kind: 'ai_budget_alert', p_limit: 8 }),
    ])

    let anyMissing = false

    // summary
    if (sumRes.error) {
      if (isMissingFunction(sumRes.error)) anyMissing = true
      else setError(sumRes.error.message || 'Failed to load summary')
      setSummary(null)
    } else {
      const row = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data
      setSummary(row || null)
    }
    setSummaryLoading(false)

    // orgs
    if (orgRes.error) {
      if (isMissingFunction(orgRes.error)) anyMissing = true
      setOrgs([])
    } else {
      setOrgs(Array.isArray(orgRes.data) ? orgRes.data : [])
    }
    setOrgsLoading(false)

    // surfaces
    if (surfRes.error) {
      if (isMissingFunction(surfRes.error)) anyMissing = true
      setBySurface([])
    } else {
      setBySurface(Array.isArray(surfRes.data) ? surfRes.data : [])
    }
    setBySurfaceLoading(false)

    // trend
    if (trendRes.error) {
      if (isMissingFunction(trendRes.error)) anyMissing = true
      setTrend([])
    } else {
      setTrend(Array.isArray(trendRes.data) ? trendRes.data : [])
    }
    setTrendLoading(false)

    // model
    if (modelRes.error) {
      if (isMissingFunction(modelRes.error)) anyMissing = true
      setByModel([])
    } else {
      setByModel(Array.isArray(modelRes.data) ? modelRes.data : [])
    }
    setByModelLoading(false)

    // per minute
    if (perMinRes.error) {
      if (isMissingFunction(perMinRes.error)) anyMissing = true
      setPerMinute([])
    } else {
      setPerMinute(Array.isArray(perMinRes.data) ? perMinRes.data : [])
    }
    setPerMinuteLoading(false)

    // spend vs caps
    if (capsRes.error) {
      if (isMissingFunction(capsRes.error)) anyMissing = true
      setCaps([])
    } else {
      setCaps(Array.isArray(capsRes.data) ? capsRes.data : [])
    }
    setCapsLoading(false)

    // recent budget alerts (best-effort — never gate the page on it)
    if (alertsRes.error) {
      setAlerts([])
    } else {
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : [])
    }
    setAlertsLoading(false)

    setMissingMigrations(anyMissing)
    setRefreshedAt(new Date())
  }, [period])

  useEffect(() => { refresh() }, [refresh])

  // ── derived chart data
  const trendChartData = useMemo(() => {
    return (trend || []).map((row) => {
      const day = row.day || row.date
      const label = day
        ? new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '—'
      return { label, value: Number(row.cost_cents || 0) }
    })
  }, [trend])

  const surfaceChartData = useMemo(() => {
    return (bySurface || []).map((s) => ({
      label: s.surface,
      value: Number(s.cost_cents || 0),
      pct_of_total: s.pct_of_total,
      call_count: s.call_count,
    }))
  }, [bySurface])

  const modelChartData = useMemo(() => {
    return (byModel || []).map((m) => ({
      label: `${m.provider}/${m.model}`,
      value: Number(m.cost_cents || 0),
      call_count: m.call_count,
      tokens: m.tokens,
    }))
  }, [byModel])

  const perMinuteChartData = useMemo(() => {
    return (perMinute || []).map((row) => {
      const minute = row.minute
      const label = minute
        ? new Date(minute).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : ''
      return { label, value: Number(row.call_count || 0) }
    })
  }, [perMinute])

  const capsOver = useMemo(() => (caps || []).filter((r) => capState(r) === 'over').length, [caps])
  const capsAlert = useMemo(() => (caps || []).filter((r) => capState(r) === 'alert').length, [caps])

  const isLoading = summaryLoading || orgsLoading || bySurfaceLoading || trendLoading || capsLoading

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageTitle title="AI Usage" />
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-indigo-300" aria-hidden="true" />
            AI Usage
          </h1>
          <p className="text-sm text-slate-500">
            Cost and consumption analytics across all customer orgs.
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
          {/* Period selector */}
          <div className="inline-flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            {[
              { id: 'today', label: 'Today' },
              { id: 'week',  label: 'This week' },
              { id: 'month', label: 'This month' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={[
                  'px-2.5 py-1 rounded-md transition',
                  period === p.id
                    ? 'bg-indigo-500/20 text-indigo-200'
                    : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {missingMigrations && (
        <Banner tone="warning" title="Migrations 083/084 not yet applied">
          The AI usage analytics RPCs (
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_ai_usage_summary</code>,{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">admin_ai_usage_by_org</code>, …)
          are missing. Apply migrations <code className="px-1 py-0.5 bg-black/30 rounded">083_*</code>{' '}
          and <code className="px-1 py-0.5 bg-black/30 rounded">084_admin_ai_usage_rpcs.sql</code>.
        </Banner>
      )}

      {error && !missingMigrations && (
        <Banner tone="danger" title="Failed to load AI usage data">{error}</Banner>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={Activity}
          label={
            period === 'today' ? 'Calls today' :
            period === 'week'  ? 'Calls this week' :
            'Calls this month'
          }
          value={formatNumber(summary?.total_calls)}
          hint={`Period: ${period}`}
          accent="from-indigo-500/40 to-indigo-700/40"
          loading={summaryLoading}
        />
        <StatTile
          icon={DollarSign}
          label={
            period === 'today' ? 'Cost today' :
            period === 'week'  ? 'Cost this week' :
            'Cost this month'
          }
          value={formatCents(summary?.total_cost_cents)}
          hint="Inferred from input + output token usage"
          accent="from-emerald-500/40 to-emerald-700/40"
          loading={summaryLoading}
        />
        <StatTile
          icon={Zap}
          label="Calls per minute"
          value={summary?.calls_per_minute != null ? Number(summary.calls_per_minute).toFixed(2) : '—'}
          hint="Average over last hour"
          accent="from-violet-500/40 to-violet-700/40"
          loading={summaryLoading || perMinuteLoading}
        >
          {!perMinuteLoading && perMinuteChartData.length > 0 && (
            <div className="mt-2">
              <Sparkline data={perMinuteChartData} width={200} height={28} color="#a78bfa" />
            </div>
          )}
        </StatTile>
        <StatTile
          icon={Gauge}
          label="At-risk orgs"
          value={formatNumber(summary?.at_risk_org_count)}
          hint="≥80% of monthly cost cap"
          accent="from-amber-500/40 to-amber-700/40"
          loading={summaryLoading}
        />
      </div>

      {/* Spend vs caps — the hard-limit monitor (cost cap is the binding limit) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <SectionCard
          title="Spend vs monthly cap"
          subtitle="Per-org AI cost against the hard cost cap · closest to the limit first"
          className="lg:col-span-3"
          action={
            <span className="inline-flex items-center gap-1.5 text-[11px]">
              {capsOver > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-200">{capsOver} stopped</span>
              )}
              {capsAlert > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200">{capsAlert} near cap</span>
              )}
              {capsOver === 0 && capsAlert === 0 && !capsLoading && (
                <span className="text-slate-500">all within budget</span>
              )}
            </span>
          }
        >
          <SpendVsCapsTable rows={caps} loading={capsLoading} />
        </SectionCard>

        <SectionCard
          title="Recent budget alerts"
          subtitle="Orgs that crossed their alert threshold"
          className="lg:col-span-2"
          action={<AlertTriangle className="w-4 h-4 text-amber-400" />}
        >
          <RecentBudgetAlerts rows={alerts} loading={alertsLoading} />
        </SectionCard>
      </div>

      {/* Per-org table */}
      <SectionCard
        title="Top 50 orgs by cost this month"
        subtitle="Click an org to drill into per-org usage detail"
        action={
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <Coins className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">{period}</span>
          </span>
        }
      >
        <OrgUsageTable rows={orgs} loading={orgsLoading} />
      </SectionCard>

      {/* Live feed — realtime ai_usage stream */}
      <AIUsageLive />

      {/* Two-column: surface breakdown + cost trend */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <SectionCard
          title="Cost by surface"
          subtitle="Last 30 days · which surface costs the most?"
          className="lg:col-span-2"
          action={<PieChart className="w-4 h-4 text-slate-500" />}
        >
          {bySurfaceLoading ? (
            <Skeleton width="100%" height={220} rounded="rounded-xl" />
          ) : surfaceChartData.length === 0 ? (
            <EmptyState icon={PieChart} title="No surface data" description="No AI calls recorded in the last 30 days." />
          ) : (
            <DonutChart
              data={surfaceChartData}
              size={200}
              formatValue={formatCents}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Daily cost trend"
          subtitle="Last 90 days · total spend per day"
          className="lg:col-span-3"
        >
          {trendLoading ? (
            <Skeleton width="100%" height={240} rounded="rounded-xl" />
          ) : trendChartData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No trend data" />
          ) : (
            <MiniLineChart
              data={trendChartData}
              height={240}
              color="#34d399"
              formatValue={formatCentsShort}
            />
          )}
        </SectionCard>
      </div>

      {/* Provider/model breakdown */}
      <SectionCard
        title="Cost by provider/model"
        subtitle="Last 30 days · spend grouped by model used"
      >
        {byModelLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={28} />
            ))}
          </div>
        ) : modelChartData.length === 0 ? (
          <EmptyState icon={BarChart3} title="No model data" />
        ) : (
          <HBarChart
            data={modelChartData}
            formatValue={formatCents}
            color="#a78bfa"
          />
        )}
      </SectionCard>
    </div>
  )
}
