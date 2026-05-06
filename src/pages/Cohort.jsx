import { useEffect, useMemo, useState } from 'react'
import { Grid3x3, RefreshCcw } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'

const METRICS = [
  { key: 'any_activity', label: 'Any activity (contacts/deals/messages/invoices)' },
  { key: 'ai_calls',     label: 'AI calls' },
  { key: 'paid_invoice', label: 'Paid invoice' },
]
const MONTHS_OPTS = [6, 12, 18, 24]

function fmtMonth(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// Color the cell by retention %. We blend transparency over indigo so
// 0% is a faint dot and 100% is bright. Below 1% just empty.
function cellStyle(pct) {
  if (pct == null || isNaN(pct) || pct < 1) {
    return { background: 'rgba(15,23,42,0.4)', color: 'rgb(100,116,139)' }
  }
  const ratio = Math.min(Math.max(Number(pct) / 100, 0.05), 1)
  return {
    background: `rgba(99,102,241,${0.10 + ratio * 0.55})`,
    color: ratio > 0.5 ? 'white' : 'rgb(199,210,254)',
  }
}

export default function Cohort() {
  const [months, setMonths]   = useState(12)
  const [metric, setMetric]   = useState('any_activity')
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [err, setErr]         = useState(null)

  const refresh = async () => {
    setLoading(true); setErr(null); setMissing(false)
    const { data, error } = await supabase.rpc('admin_cohort_retention', {
      p_months: months, p_metric: metric,
    })
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      else setErr(error.message)
      setRows([])
    } else {
      setRows(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [months, metric])

  // Reshape into a grid: rows = cohort_month (DESC), columns = month_index (0..maxIdx)
  const grid = useMemo(() => {
    const byCohort = new Map()
    let maxIdx = 0
    for (const r of rows) {
      const key = r.cohort_month
      if (!byCohort.has(key)) byCohort.set(key, { cohort_month: key, cohort_size: r.cohort_size, cells: {} })
      byCohort.get(key).cells[r.month_index] = {
        active_count: r.active_count,
        retention_pct: Number(r.retention_pct),
      }
      maxIdx = Math.max(maxIdx, Number(r.month_index))
    }
    // Sorted: newest cohort first
    const cohorts = Array.from(byCohort.values()).sort((a, b) =>
      String(b.cohort_month).localeCompare(String(a.cohort_month))
    )
    return { cohorts, maxIdx }
  }, [rows])

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Grid3x3 className="w-5 h-5 text-indigo-300" />
            Cohort retention
          </h1>
          <p className="text-sm text-slate-500">
            Of orgs that signed up in month X, what fraction were still active in month X+N?
          </p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 130 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">130_cohort_analysis.sql</code>.
        </Banner>
      )}
      {err && <Banner tone="danger" title="Failed to load">{err}</Banner>}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-3 flex flex-wrap items-center gap-3">
        <label className="text-[11px] text-slate-500 uppercase tracking-wider">Definition of active</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 max-w-md flex-1">
          {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <label className="text-[11px] text-slate-500 uppercase tracking-wider ml-2">Months</label>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
          {MONTHS_OPTS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <Skeleton width="100%" height={420} rounded="rounded-2xl" />
      ) : grid.cohorts.length === 0 ? (
        <EmptyState icon={Grid3x3}
          title="No cohort data"
          description="No organizations have signed up in this window yet." />
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-900/40 backdrop-blur px-2 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">Cohort</th>
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">Size</th>
                {Array.from({length: grid.maxIdx + 1}).map((_, i) => (
                  <th key={i} className="px-2 py-2 text-center text-[10px] uppercase tracking-wider text-slate-500 font-medium min-w-[60px]">M+{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.cohorts.map((c) => (
                <tr key={c.cohort_month}>
                  <td className="sticky left-0 bg-slate-900/40 backdrop-blur px-2 py-1.5 text-slate-300 font-medium">{fmtMonth(c.cohort_month)}</td>
                  <td className="px-2 py-1.5 text-slate-400 tabular-nums">{c.cohort_size}</td>
                  {Array.from({length: grid.maxIdx + 1}).map((_, i) => {
                    const cell = c.cells[i]
                    if (!cell) return (
                      <td key={i} className="text-center text-[10px] text-slate-700">—</td>
                    )
                    return (
                      <td key={i} className="text-center"
                        style={{...cellStyle(cell.retention_pct), borderRadius: 4, padding: '4px 6px', minWidth: 60}}
                        title={`${cell.active_count}/${c.cohort_size} active in M+${i}`}>
                        <div className="text-[11px] tabular-nums leading-tight font-medium">
                          {Number(cell.retention_pct).toFixed(0)}%
                        </div>
                        <div className="text-[9px] tabular-nums opacity-70">
                          {cell.active_count}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{background: 'rgba(99,102,241,0.10)'}} />
              0%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{background: 'rgba(99,102,241,0.40)'}} />
              ~50%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{background: 'rgba(99,102,241,0.65)'}} />
              100%
            </span>
            <span className="ml-auto">
              Cell shows retention % and active count. Hover for ratio.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
