import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Layers,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import StatCard from '../components/ui/StatCard'
import Skeleton from '../components/ui/Skeleton'
import MultiLineChart from '../components/charts/MultiLineChart'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'
import ErrorCard from '../components/ui/ErrorCard'

function fmtCents(c) {
  if (c == null) return '—'
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    maximumFractionDigits: 0,
  }).format(c / 100)
}

function fmtNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

function fmtMonth(s) {
  if (!s) return ''
  try {
    const d = new Date(s)
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  } catch { return s }
}

function pctTone(pct) {
  if (pct == null) return 'neutral'
  if (pct > 0)   return 'positive'
  if (pct < 0)   return 'negative'
  return 'neutral'
}

function deltaText(curr, prev) {
  if (curr == null || prev == null) return null
  if (prev === 0) return curr > 0 ? '+∞' : '0%'
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

// ---- donut helper ----
function Donut({ data, size = 160 }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: size }}>
        <span className="text-xs text-slate-500">No revenue yet.</span>
      </div>
    )
  }
  const r = size / 2 - 8
  const cx = size / 2
  const cy = size / 2
  let acc = 0
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size}>
        {data.map((d, i) => {
          const start = (acc / total) * 2 * Math.PI
          acc += d.value
          const end = (acc / total) * 2 * Math.PI
          const x1 = cx + r * Math.sin(start)
          const y1 = cy - r * Math.cos(start)
          const x2 = cx + r * Math.sin(end)
          const y2 = cy - r * Math.cos(end)
          const largeArc = end - start > Math.PI ? 1 : 0
          const path = total > 0 && d.value > 0
            ? `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
            : ''
          return path ? (
            <path key={i} d={path} fill={d.color} stroke="#0f172a" strokeWidth="1.5" />
          ) : null
        })}
        <circle cx={cx} cy={cy} r={r * 0.5} fill="#0f172a" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" className="fill-slate-300">
          {fmtCents(total)}
        </text>
      </svg>
      <div className="text-xs space-y-1.5 flex-1 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-slate-300 truncate">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="tabular-nums text-slate-400">{fmtCents(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const MODULE_COLORS = [
  '#818cf8', '#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#f472b6',
  '#60a5fa', '#a3e635', '#fb923c', '#f87171', '#c084fc',
]

export default function Revenue() {
  const [now, setNow]       = useState(null)
  const [chart, setChart]   = useState([])
  const [byMod, setByMod]   = useState([])
  const [topOrgs, setTopOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [err, setErr]       = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setMissing(false)

    const [nowRes, chartRes, modRes, orgRes] = await Promise.all([
      supabase.rpc('admin_mrr_now'),
      supabase.rpc('admin_mrr_chart', { p_months: 12 }),
      supabase.rpc('admin_mrr_by_module'),
      supabase.rpc('admin_revenue_by_org', { p_limit: 50 }),
    ])

    let isMissing = false
    if (nowRes.error) {
      if (isMissingFunction(nowRes.error)) isMissing = true
      else setErr(nowRes.error.message)
      setNow(null)
    } else {
      setNow(nowRes.data || null)
    }
    if (chartRes.error) {
      if (isMissingFunction(chartRes.error)) isMissing = true
      setChart([])
    } else {
      setChart(Array.isArray(chartRes.data) ? chartRes.data : [])
    }
    if (modRes.error) {
      if (isMissingFunction(modRes.error)) isMissing = true
      setByMod([])
    } else {
      setByMod(Array.isArray(modRes.data) ? modRes.data : [])
    }
    if (orgRes.error) {
      if (isMissingFunction(orgRes.error)) isMissing = true
      setTopOrgs([])
    } else {
      setTopOrgs(Array.isArray(orgRes.data) ? orgRes.data : [])
    }

    setMissing(isMissing)
    setLoading(false)
    setRefreshedAt(new Date())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const series = useMemo(() => {
    if (!chart || chart.length === 0) return []
    const dates = chart.map((r) => fmtMonth(r.month_start))
    const make = (key) => ({
      data: chart.map((r, i) => ({ date: dates[i], value: Number(r[key] || 0) / 100 })),
    })
    return [
      { name: 'New',         color: '#34d399', ...make('new_cents') },
      { name: 'Expansion',   color: '#818cf8', ...make('expansion_cents') },
      { name: 'Contraction', color: '#fbbf24', ...make('contraction_cents') },
      { name: 'Churn',       color: '#f87171', ...make('churn_cents') },
    ]
  }, [chart])

  const moduleDonut = useMemo(() => {
    if (!byMod || byMod.length === 0) return []
    return byMod.slice(0, 8).map((m, i) => ({
      label: m.module_key,
      value: Number(m.total_paid_cents) || 0,
      color: MODULE_COLORS[i % MODULE_COLORS.length],
    }))
  }, [byMod])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageTitle title="Revenue" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Revenue</h1>
          <p className="text-sm text-slate-500">Live MRR, growth, churn, and where the dollars come from.</p>
        </div>
        <div className="flex items-center gap-3">
          {refreshedAt && (
            <span
              className="text-[11px] text-slate-600 hidden md:inline"
              title={refreshedAt.toISOString()}
            >
              Updated {refreshedAt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}
            </span>
          )}
          <RefreshButton onClick={refresh} loading={loading} label="Refresh revenue stats" />
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 119 not yet applied">
          The MRR / revenue intelligence RPCs aren't on this database. Apply{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">119_billing_intel.sql</code> to enable this page.
        </Banner>
      )}

      {err && !missing && (
        <ErrorCard title="Failed to load revenue" error={err} onRetry={refresh} />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="MRR (live)"
          value={now ? fmtCents(now.mrr_current_cents) : '—'}
          delta={now ? deltaText(now.mrr_current_cents, now.mrr_prev_cents) : null}
          deltaTone={now ? pctTone(now.delta_pct) : 'neutral'}
          icon={TrendingUp}
          accent="from-indigo-500/40 to-violet-500/40"
          loading={loading}
        />
        <StatCard
          label="Net new $ this month"
          value={now ? fmtCents(now.new_cents) : '—'}
          icon={ArrowUpRight}
          accent="from-emerald-500/40 to-teal-500/40"
          loading={loading}
        />
        <StatCard
          label="Churn $ this month"
          value={now ? fmtCents(now.churn_cents) : '—'}
          icon={ArrowDownRight}
          accent="from-rose-500/40 to-red-500/40"
          loading={loading}
        />
        <StatCard
          label="Growth %"
          value={now?.delta_pct != null ? `${now.delta_pct >= 0 ? '+' : ''}${Number(now.delta_pct).toFixed(1)}%` : '—'}
          deltaTone={now ? pctTone(now.delta_pct) : 'neutral'}
          icon={TrendingUp}
          accent="from-sky-500/40 to-cyan-500/40"
          loading={loading}
        />
      </div>

      {/* MRR chart */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">12-month revenue trend</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">New vs expansion vs contraction vs churn ($ recognized)</p>
          </div>
        </div>
        {loading ? (
          <Skeleton width="100%" height={260} rounded="rounded-lg" />
        ) : series.length === 0 || series[0]?.data?.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-500">No revenue data yet.</div>
        ) : (
          <MultiLineChart
            series={series}
            height={260}
            formatValue={(v) => `$${Math.round(v).toLocaleString()}`}
            formatDate={(s) => s}
          />
        )}
      </div>

      {/* Bottom split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top customers */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
          <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-100">Top customers by revenue</h3>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-5 space-y-2">
                {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={28} rounded="rounded" />))}
              </div>
            ) : topOrgs.length === 0 ? (
              <div className="p-8 text-sm text-slate-500 text-center">No paid customers yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                    <th scope="col" className="text-left font-medium px-5 py-2.5">Org</th>
                    <th scope="col" className="text-right font-medium px-3 py-2.5">Lifetime $</th>
                    <th scope="col" className="text-right font-medium px-3 py-2.5">Live MRR</th>
                    <th scope="col" className="text-right font-medium px-5 py-2.5">Last paid</th>
                  </tr>
                </thead>
                <tbody>
                  {topOrgs.slice(0, 25).map((o) => (
                    <tr key={o.organization_id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                      <td className="px-5 py-2 text-slate-200 truncate max-w-[200px]">{o.name || o.slug}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtCents(o.total_paid_cents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmtCents(o.est_mrr_cents)}</td>
                      <td className="px-5 py-2 text-right text-[11px] text-slate-500">
                        {o.last_paid_at ? new Date(o.last_paid_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* By module */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
          <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-100">Revenue by module</h3>
          </div>
          <div className="p-5">
            {loading ? (
              <Skeleton width="100%" height={180} rounded="rounded-lg" />
            ) : moduleDonut.length === 0 || moduleDonut.every((m) => m.value === 0) ? (
              <div className="text-center py-8 text-sm text-slate-500">No module-tied revenue yet.</div>
            ) : (
              <Donut data={moduleDonut} size={180} />
            )}
            {byMod.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800/40 space-y-1.5">
                {byMod.slice(0, 8).map((m) => (
                  <div key={m.module_key} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-300">{m.module_key}</span>
                    <span className="text-slate-500 tabular-nums">
                      {fmtNumber(m.orgs_enabled)} orgs · {fmtCents(m.est_mrr_cents)} MRR
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
