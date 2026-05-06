import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react'
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

export default function EdgeLogs() {
  const [tab, setTab]           = useState('history') // 'live' | 'history'
  const [windowKey, setWindow]  = useState('24h')
  const [fnFilter, setFnFilter] = useState('')
  const [statusFilter, setStatus] = useState('all')   // 'all' | 'errors' | 'success'
  const [search, setSearch]     = useState('')
  const [rows, setRows]         = useState([])
  const [summary, setSummary]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [missing, setMissing]   = useState(false)
  const [detail, setDetail]     = useState(null)

  const since = useMemo(() => {
    const w = TIME_WINDOWS.find((t) => t.key === windowKey)
    return new Date(Date.now() - (w?.hours || 24) * 3600 * 1000).toISOString()
  }, [windowKey])

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const [logRes, sumRes] = await Promise.all([
      supabase.rpc('admin_edge_invocations', {
        p_limit: 200, p_offset: 0,
        p_function_name: fnFilter || null,
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_since: since, p_until: null,
        p_search: search.trim() || null,
      }),
      supabase.rpc('admin_edge_invocations_summary', { p_hours: 24 }),
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
    setLoading(false)
  }, [fnFilter, statusFilter, since, search])

  useEffect(() => { refresh() }, [refresh])

  // Live-tab: poll every 5s
  useEffect(() => {
    if (tab !== 'live') return
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [tab, refresh])

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
                  <th className="text-left font-medium px-5 py-2.5">When</th>
                  <th className="text-left font-medium px-3 py-2.5">Function</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-right font-medium px-3 py-2.5">Duration</th>
                  <th className="text-left font-medium px-3 py-2.5">Error / request_id</th>
                  <th className="text-right font-medium px-5 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setDetail(r)}
                    className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 cursor-pointer">
                    <td className="px-5 py-2 text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(r.called_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', second:'2-digit' })}
                      <span className="text-slate-600 ml-2">{new Date(r.called_at).toLocaleDateString()}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-indigo-200">{r.function_name}</td>
                    <td className="px-3 py-2"><StatusPill code={r.status_code} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{r.duration_ms != null ? `${r.duration_ms}ms` : '—'}</td>
                    <td className="px-3 py-2 text-[11px] text-slate-400 truncate max-w-[400px]">
                      {r.error
                        ? <span className="text-rose-300">{r.error.split('\n')[0]}</span>
                        : <span className="font-mono text-slate-500">{r.request_id || ''}</span>}
                    </td>
                    <td className="px-5 py-2 text-right text-[11px] text-slate-500 font-mono">{r.ip_address || '—'}</td>
                  </tr>
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
