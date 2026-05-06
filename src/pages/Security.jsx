import { useEffect, useMemo, useState } from 'react'
import {
  ShieldAlert,
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Play,
  Search,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'
import { toast } from '../components/ui/Toast'

const SEVERITY_TONE = {
  low:      'bg-slate-500/15 text-slate-300 border-slate-500/30',
  medium:   'bg-amber-500/15 text-amber-200 border-amber-500/30',
  high:     'bg-orange-500/15 text-orange-200 border-orange-500/30',
  critical: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
}
const CATEGORY_ICON = {
  mass_delete:   Ban,
  auth_spike:    ShieldAlert,
  ai_spike:      Activity,
  unusual_geo:   AlertTriangle,
  export_volume: AlertTriangle,
}
const TIME_RANGES = [
  { key: '24h', hours: 24,  label: 'Last 24h' },
  { key: '7d',  hours: 168, label: 'Last 7d' },
  { key: '30d', hours: 720, label: 'Last 30d' },
]

function fmt(s) { return s ? new Date(s).toLocaleString() : '—' }

export default function Security() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [filterSev, setFilterSev]   = useState('all')
  const [filterCat, setFilterCat]   = useState('all')
  const [range, setRange]     = useState('7d')
  const [search, setSearch]   = useState('')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  const refresh = async () => {
    setLoading(true)
    const since = new Date(Date.now() - (TIME_RANGES.find((r) => r.key === range)?.hours || 168) * 3600 * 1000)
    let q = supabase
      .from('suspicious_activity')
      .select('*')
      .gte('detected_at', since.toISOString())
      .order('detected_at', { ascending: false })
      .limit(500)
    const { data, error } = await q
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
        setMissing(true)
      }
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [range])

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const r of rows) {
      if (r.acknowledged_at) continue
      c[r.severity] = (c[r.severity] || 0) + 1
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterSev !== 'all' && r.severity !== filterSev) return false
      if (filterCat !== 'all' && r.category !== filterCat) return false
      if (search) {
        const blob = JSON.stringify(r.payload || {}).toLowerCase()
        if (!blob.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [rows, filterSev, filterCat, search])

  const ack = async (id) => {
    const note = prompt('Acknowledge note (optional)')
    const { error } = await supabase.rpc('admin_ack_threat', { p_id: id, p_note: note || null })
    if (error) toast.error("Couldn't acknowledge", { description: error.message })
    else { toast.success('Threat acknowledged'); refresh() }
  }

  const runDetectors = async () => {
    setRunning(true); setRunResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-detect-threats', { body: {} })
      if (error) throw error
      setRunResult(data?.results || null)
      toast.success('Detectors ran')
      await refresh()
    } catch (e) {
      toast.error('Detector run failed', { description: e?.message || String(e) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6 max-w-[1500px]">
      <PageTitle title="Security" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-300" aria-hidden="true" />
            Security
          </h1>
          <p className="text-sm text-slate-500">Anomaly detectors run every 15 minutes via pg_cron.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runDetectors} disabled={running}
            aria-label="Run anomaly detectors now"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
            <Play className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} aria-hidden="true" />
            Run detectors now
          </button>
          <RefreshButton onClick={refresh} loading={loading} label="Refresh threats" />
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 135 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">135_suspicious_activity.sql</code>.
        </Banner>
      )}

      {runResult && (
        <Banner tone="info">
          Detectors ran. Inserted: auth_spike {runResult.auth_spike}, ai_spike {runResult.ai_spike}, mass_delete {runResult.mass_delete}, export_volume {runResult.export_volume}.
        </Banner>
      )}

      {/* Active threats pill bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {['critical','high','medium','low'].map((sev) => (
          <button key={sev}
            onClick={() => setFilterSev(filterSev === sev ? 'all' : sev)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${SEVERITY_TONE[sev]} ${filterSev === sev ? 'ring-2 ring-current/30' : ''}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{sev}</div>
            <div className="text-2xl font-semibold tabular-nums mt-0.5">{counts[sev] || 0}</div>
            <div className="text-[10px] opacity-70 mt-0.5">unacknowledged</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-3 flex flex-wrap items-center gap-2">
        <select value={range} onChange={(e) => setRange(e.target.value)}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
          {TIME_RANGES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
          <option value="all">All categories</option>
          <option value="auth_spike">Auth spike</option>
          <option value="ai_spike">AI spike</option>
          <option value="mass_delete">Mass delete</option>
          <option value="export_volume">Export volume</option>
          <option value="unusual_geo">Unusual geo</option>
        </select>
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payload"
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({length:6}).map((_,i)=>(<Skeleton key={i} width="100%" height={36} rounded="rounded" />))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12">
            <EmptyState icon={CheckCircle2}
              title="Nothing to see here"
              description="No threats match the current filters." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left px-5 py-2.5 font-medium">When</th>
                  <th scope="col" className="text-left px-3 py-2.5 font-medium">Category</th>
                  <th scope="col" className="text-left px-3 py-2.5 font-medium">Severity</th>
                  <th scope="col" className="text-left px-3 py-2.5 font-medium">Payload</th>
                  <th scope="col" className="text-left px-3 py-2.5 font-medium">Org / user</th>
                  <th scope="col" className="text-right px-5 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const Icon = CATEGORY_ICON[r.category] || AlertTriangle
                  return (
                    <tr key={r.id} className={`border-b border-slate-800/40 last:border-0 ${r.acknowledged_at ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-2 text-[11px] text-slate-400 whitespace-nowrap">{fmt(r.detected_at)}</td>
                      <td className="px-3 py-2 text-xs text-slate-200">
                        <div className="inline-flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-indigo-300" />
                          {r.category}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase ${SEVERITY_TONE[r.severity] || ''}`}>
                          {r.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-400 max-w-md">
                        <code className="font-mono break-all whitespace-normal text-[11px]">
                          {JSON.stringify(r.payload || {}).slice(0, 200)}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-500 font-mono">
                        {r.organization_id ? r.organization_id.slice(0, 8) + '…' : (r.user_id ? r.user_id.slice(0, 8) + '…' : '—')}
                      </td>
                      <td className="px-5 py-2 text-right">
                        {r.acknowledged_at ? (
                          <span className="text-[10px] text-slate-500">acked {fmt(r.acknowledged_at)}</span>
                        ) : (
                          <button onClick={() => ack(r.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800/40">
                            <CheckCircle2 className="w-3 h-3" /> Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
