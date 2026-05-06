import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Bell,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import Modal from '../components/ui/Modal'

const TIME_WINDOWS = [
  { key: '1h',  label: 'Last 1h',  hours: 1 },
  { key: '24h', label: 'Last 24h', hours: 24 },
  { key: '7d',  label: 'Last 7d',  hours: 24 * 7 },
  { key: '30d', label: 'Last 30d', hours: 24 * 30 },
]

function StatusPill({ code }) {
  if (code == null) return <span className="text-slate-600 text-[10px]">—</span>
  let cls = 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  if (code >= 500) cls = 'bg-rose-500/15 text-rose-200 border-rose-500/30'
  else if (code >= 400) cls = 'bg-amber-500/15 text-amber-200 border-amber-500/30'
  else if (code >= 200 && code < 300) cls = 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-mono ${cls}`}>{code}</span>
}

// percentile from a sorted array
function pct(sortedArr, q) {
  if (!sortedArr.length) return null
  const idx = Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * q))
  return sortedArr[idx]
}

// Group up to 24 hourly buckets of (p50, p95, p99) durations from the last
// 24h of rows for one fn name.
function bucketHourly(rows, fnName) {
  const now = new Date()
  const buckets = Array.from({ length: 24 }).map((_, i) => {
    const end = new Date(now.getTime() - (i) * 3600 * 1000)
    const start = new Date(end.getTime() - 3600 * 1000)
    return { start, end, durs: [] }
  }).reverse()

  for (const r of rows) {
    if (fnName && r.function_name !== fnName) continue
    const t = new Date(r.called_at).getTime()
    const idx = buckets.findIndex((b) => t >= b.start.getTime() && t < b.end.getTime())
    if (idx === -1) continue
    if (r.duration_ms != null) buckets[idx].durs.push(Number(r.duration_ms))
  }

  return buckets.map((b) => {
    const sorted = b.durs.slice().sort((a, b2) => a - b2)
    return {
      label: b.start.toLocaleTimeString('en-US', { hour: 'numeric' }),
      start: b.start,
      count: b.durs.length,
      p50: pct(sorted, 0.5),
      p95: pct(sorted, 0.95),
      p99: pct(sorted, 0.99),
    }
  })
}

export default function EdgeLogs() {
  const [tab, setTab]           = useState('history') // 'live' | 'history'
  const [windowKey, setWindow]  = useState('24h')
  const [fnFilter, setFnFilter] = useState('')
  const [statusFilter, setStatus] = useState('all')
  const [search, setSearch]     = useState('')
  const [rows, setRows]         = useState([])
  const [chartRows, setChartRows] = useState([])  // Always last-24h for the chart, regardless of windowKey
  const [summary, setSummary]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [missing, setMissing]   = useState(false)
  const [detail, setDetail]     = useState(null)

  const since = useMemo(() => {
    const w = TIME_WINDOWS.find((t) => t.key === windowKey)
    return new Date(Date.now() - (w?.hours || 24) * 3600 * 1000).toISOString()
  }, [windowKey])

  const since24h = useMemo(() =>
    new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    []
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const [logRes, sumRes, chartRes] = await Promise.all([
      supabase.rpc('admin_edge_invocations', {
        p_limit: 200, p_offset: 0,
        p_function_name: fnFilter || null,
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_since: since, p_until: null,
        p_search: search.trim() || null,
      }),
      supabase.rpc('admin_edge_invocations_summary', { p_hours: 24 }),
      // Pull a wider-net 500 rows for the past 24h for the chart only.
      supabase.rpc('admin_edge_invocations', {
        p_limit: 500, p_offset: 0,
        p_function_name: fnFilter || null,
        p_status: null,
        p_since: since24h, p_until: null,
        p_search: null,
      }),
    ])
    if (logRes.error) {
      if (isMissingFunction(logRes.error)) setMissing(true)
      setRows([])
    } else {
      setRows(Array.isArray(logRes.data) ? logRes.data : [])
    }
    if (sumRes.error) {
      if (isMissingFunction(sumRes.error)) setMissing(true)
      setSummary([])
    } else {
      setSummary(Array.isArray(sumRes.data) ? sumRes.data : [])
    }
    if (!chartRes.error) {
      setChartRows(Array.isArray(chartRes.data) ? chartRes.data : [])
    }
    setLoading(false)
  }, [fnFilter, statusFilter, since, search, since24h])

  useEffect(() => { refresh() }, [refresh])

  // Live-tab: poll every 5s
  useEffect(() => {
    if (tab !== 'live') return
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [tab, refresh])

  // Error-rate alert: any function with >5% error rate in last 15min.
  // We compute this client-side from the rows we already fetched (filter to
  // last 15 min). If the global window doesn't include the last 15min we
  // skip the banner.
  const errorRibbon = useMemo(() => {
    const since15 = Date.now() - 15 * 60 * 1000
    const recent = chartRows.filter((r) => new Date(r.called_at).getTime() >= since15)
    if (recent.length < 5) return null
    const byFn = new Map()
    for (const r of recent) {
      const k = r.function_name
      if (!byFn.has(k)) byFn.set(k, { total: 0, errors: 0 })
      byFn.get(k).total++
      if (Number(r.status_code || 0) >= 400) byFn.get(k).errors++
    }
    const offenders = Array.from(byFn.entries())
      .filter(([, v]) => v.total >= 5 && v.errors / v.total > 0.05)
      .map(([k, v]) => ({ fn: k, errors: v.errors, total: v.total, pct: (v.errors / v.total) * 100 }))
    return offenders.length ? offenders : null
  }, [chartRows])

  // Chart: hourly p50/p95/p99 for either the focused fn or aggregate.
  const chartBuckets = useMemo(() => bucketHourly(chartRows, fnFilter || null), [chartRows, fnFilter])
  const chartMax = useMemo(() => {
    const all = []
    for (const b of chartBuckets) {
      if (b.p50 != null) all.push(b.p50)
      if (b.p95 != null) all.push(b.p95)
      if (b.p99 != null) all.push(b.p99)
    }
    return all.length ? Math.max(...all) : 100
  }, [chartBuckets])

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Edge function logs</h1>
          <p className="text-sm text-slate-500">Per-invocation telemetry from the instrument() wrapper.</p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 124 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">124_edgefn_telemetry.sql</code>.
        </Banner>
      )}

      {errorRibbon && errorRibbon.length > 0 && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-start gap-3">
          <Bell className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-rose-100 mb-0.5">
              {errorRibbon.length} function{errorRibbon.length > 1 ? 's' : ''} with &gt;5% error rate (last 15 min)
            </div>
            <div className="flex flex-wrap gap-1">
              {errorRibbon.map((o) => (
                <button key={o.fn} onClick={() => { setFnFilter(o.fn); setStatus('errors') }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] font-mono text-rose-100">
                  {o.fn} · {o.pct.toFixed(1)}% ({o.errors}/{o.total})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-fn summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {loading && summary.length === 0 ? (
          Array.from({length:4}).map((_,i)=>(<Skeleton key={i} width="100%" height={92} rounded="rounded-xl" />))
        ) : summary.length === 0 ? (
          <div className="col-span-full text-sm text-slate-500 text-center py-6">No invocations recorded in the last 24h yet.</div>
        ) : (
          summary.map((s) => {
            const errPct = s.invocations > 0 ? (s.errors / s.invocations) * 100 : 0
            return (
              <button key={s.function_name}
                onClick={() => setFnFilter(s.function_name)}
                className={[
                  'rounded-xl border bg-slate-900/40 backdrop-blur p-3 text-left hover:bg-slate-800/40 transition',
                  fnFilter === s.function_name ? 'border-indigo-500/50' : 'border-slate-800/60',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[11px] text-indigo-200 truncate">{s.function_name}</span>
                  {s.errors > 0 ? <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="text-xl font-semibold tabular-nums">{Number(s.invocations).toLocaleString()}</div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5">
                  <span>p50 {s.p50_ms != null ? `${Number(s.p50_ms).toFixed(0)}ms` : '—'}</span>
                  <span>p95 {s.p95_ms != null ? `${Number(s.p95_ms).toFixed(0)}ms` : '—'}</span>
                  <span className={s.errors > 0 ? 'text-rose-300' : ''}>{s.errors} err ({errPct.toFixed(1)}%)</span>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Hourly p50/p95/p99 chart for the focused function (or all) */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Latency percentiles · last 24h
              {fnFilter && <span className="ml-2 font-mono text-[11px] text-indigo-300">{fnFilter}</span>}
            </h3>
            <p className="text-[11px] text-slate-500">Hourly buckets · p50 / p95 / p99 in ms</p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-1 bg-indigo-400 rounded" /> p50</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-1 bg-amber-400 rounded" /> p95</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-1 bg-rose-400 rounded" /> p99</span>
          </div>
        </div>
        <PercentileChart buckets={chartBuckets} maxMs={chartMax} />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-800 overflow-hidden text-xs">
          {[
            { id: 'history', label: 'History' },
            { id: 'live',    label: 'Live (5s)' },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={[
                'px-3 py-1.5',
                tab === t.id ? 'bg-indigo-500/20 text-indigo-200' : 'bg-slate-900 text-slate-400 hover:text-slate-200',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={windowKey} onChange={(e) => setWindow(e.target.value)}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
          {TIME_WINDOWS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
          <option value="all">All</option>
          <option value="errors">Errors only</option>
          <option value="success">Success only</option>
        </select>
        {fnFilter && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 rounded text-[11px]">
            fn:{fnFilter}
            <button onClick={() => setFnFilter('')}><X className="w-3 h-3" /></button>
          </span>
        )}
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search error / request_id"
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-indigo-500 focus:outline-none" />
        </div>
      </div>

      {/* Logs table */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({length:8}).map((_,i)=>(<Skeleton key={i} width="100%" height={26} rounded="rounded" />))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No invocations match.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium px-5 py-2.5"></th>
                  <th className="text-left font-medium px-3 py-2.5">When</th>
                  <th className="text-left font-medium px-3 py-2.5">Function</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-right font-medium px-3 py-2.5">Duration</th>
                  <th className="text-left font-medium px-3 py-2.5">Error / request_id</th>
                  <th className="text-right font-medium px-5 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ExpandableRow key={r.id} row={r} onOpen={() => setDetail(r)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetailModal row={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

function PercentileChart({ buckets, maxMs }) {
  const W = 800
  const H = 160
  const PAD = { l: 36, r: 12, t: 12, b: 22 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const stepX = innerW / Math.max(buckets.length - 1, 1)
  const yFor = (v) => PAD.t + innerH - (Math.min(v, maxMs) / Math.max(maxMs, 1)) * innerH

  // Three lines + bars for "count" overlay at the bottom.
  const lineFor = (key, color) => {
    const pts = []
    for (let i = 0; i < buckets.length; i++) {
      const v = buckets[i][key]
      if (v == null) continue
      pts.push(`${PAD.l + i * stepX},${yFor(v)}`)
    }
    if (!pts.length) return null
    return <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
  }
  const dotsFor = (key, color) => buckets.map((b, i) => b[key] != null
    ? <circle key={`${key}-${i}`} cx={PAD.l + i * stepX} cy={yFor(b[key])} r={2} fill={color} />
    : null
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[180px]" preserveAspectRatio="none">
      {/* axes */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + innerH} stroke="rgba(148,163,184,0.2)" />
      <line x1={PAD.l} y1={PAD.t + innerH} x2={PAD.l + innerW} y2={PAD.t + innerH} stroke="rgba(148,163,184,0.2)" />
      {/* y-axis ticks */}
      {[0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.t + innerH - innerH * t
        return (
          <g key={t}>
            <line x1={PAD.l} x2={PAD.l + innerW} y1={y} y2={y} stroke="rgba(148,163,184,0.07)" />
            <text x={PAD.l - 4} y={y + 3} textAnchor="end" fontSize="9" fill="rgb(148,163,184)">
              {Math.round(maxMs * t)}ms
            </text>
          </g>
        )
      })}
      {/* x-axis labels: every 4th hour */}
      {buckets.map((b, i) => i % 4 === 0 ? (
        <text key={i}
          x={PAD.l + i * stepX} y={PAD.t + innerH + 14}
          fontSize="9" fill="rgb(148,163,184)" textAnchor="middle">{b.label}</text>
      ) : null)}
      {/* lines */}
      {lineFor('p50', '#818cf8')}
      {lineFor('p95', '#fbbf24')}
      {lineFor('p99', '#fb7185')}
      {dotsFor('p50', '#818cf8')}
      {dotsFor('p95', '#fbbf24')}
      {dotsFor('p99', '#fb7185')}
    </svg>
  )
}

function ExpandableRow({ row, onOpen }) {
  const [open, setOpen] = useState(false)
  const dur = row.duration_ms != null ? `${row.duration_ms}ms` : '—'
  return (
    <>
      <tr className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer">
        <td className="px-3 py-2 w-7" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
        </td>
        <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap" onClick={onOpen}>
          {new Date(row.called_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', second:'2-digit' })}
          <span className="text-slate-600 ml-2">{new Date(row.called_at).toLocaleDateString()}</span>
        </td>
        <td className="px-3 py-2 font-mono text-[11px] text-indigo-200" onClick={onOpen}>{row.function_name}</td>
        <td className="px-3 py-2" onClick={onOpen}><StatusPill code={row.status_code} /></td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-400" onClick={onOpen}>{dur}</td>
        <td className="px-3 py-2 text-[11px] text-slate-400 truncate max-w-[400px]" onClick={onOpen}>
          {row.error
            ? <span className="text-rose-300">{row.error.split('\n')[0]}</span>
            : <span className="font-mono text-slate-500">{row.request_id || ''}</span>}
        </td>
        <td className="px-5 py-2 text-right text-[11px] text-slate-500 font-mono" onClick={onOpen}>{row.ip_address || '—'}</td>
      </tr>
      {open && (
        <tr className="bg-slate-950/40 border-b border-slate-800/40">
          <td></td>
          <td colSpan={6} className="px-3 py-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">request_id</div>
                <code className="font-mono text-slate-200 break-all">{row.request_id || '—'}</code>
                <div className="text-[10px] text-slate-500 mt-1">grep this in the Supabase fn dashboard logs.</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Org / user</div>
                <div className="font-mono text-[10px] text-slate-300 break-all">
                  {row.organization_id ? <Link to={`/companies/${row.organization_id}`} className="text-indigo-300 hover:underline">{row.organization_id}</Link> : '—'}
                </div>
                <div className="font-mono text-[10px] text-slate-500 break-all">{row.user_id || ''}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Stages</div>
                <div className="text-slate-300">
                  Total {dur}
                </div>
                {row.metadata?.stages && (
                  <div className="font-mono text-[10px] text-slate-400 mt-1">
                    {Object.entries(row.metadata.stages).map(([k, v]) => (
                      <div key={k}>{k}: {String(v)}ms</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {row.error && (
              <div className="mt-3">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Error</div>
                <pre className="p-2 rounded-md bg-slate-950 border border-rose-500/30 text-[11px] text-rose-200 overflow-auto max-h-40 whitespace-pre-wrap">{row.error}</pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function DetailModal({ row, onClose }) {
  if (!row) return null
  return (
    <Modal open={!!row} onClose={onClose} title={`Invocation: ${row.function_name}`} size="lg">
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-slate-500 text-[10px] uppercase tracking-wider">Status</dt>
          <dd className="text-slate-200 font-mono mt-0.5">{row.status_code ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 text-[10px] uppercase tracking-wider">Duration</dt>
          <dd className="text-slate-200 mt-0.5">{row.duration_ms != null ? `${row.duration_ms}ms` : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 text-[10px] uppercase tracking-wider">When</dt>
          <dd className="text-slate-200 mt-0.5">{new Date(row.called_at).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500 text-[10px] uppercase tracking-wider">request_id</dt>
          <dd className="text-slate-200 font-mono mt-0.5 break-all">{row.request_id || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 text-[10px] uppercase tracking-wider">IP</dt>
          <dd className="text-slate-200 font-mono mt-0.5">{row.ip_address || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 text-[10px] uppercase tracking-wider">Org / user</dt>
          <dd className="text-slate-200 font-mono text-[10px] mt-0.5 break-all">
            {row.organization_id || row.user_id || '—'}
          </dd>
        </div>
      </dl>
      {row.error && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Error</div>
          <pre className="p-3 rounded-lg bg-slate-950 border border-rose-500/30 text-[11px] text-rose-200 overflow-auto max-h-64 whitespace-pre-wrap">{row.error}</pre>
        </div>
      )}
      {row.metadata && Object.keys(row.metadata).length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Metadata</div>
          <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 overflow-auto max-h-64">{JSON.stringify(row.metadata, null, 2)}</pre>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Close</button>
      </div>
    </Modal>
  )
}
