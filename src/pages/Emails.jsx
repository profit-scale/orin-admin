import { useCallback, useEffect, useMemo, useState } from 'react'
import { Send, Filter, AlertTriangle } from 'lucide-react'
import { supabase } from '../services/supabase'
import EmptyState from '../components/ui/EmptyState'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'
import ErrorCard from '../components/ui/ErrorCard'

const STATUSES = [
  { id: '',           label: 'All statuses' },
  { id: 'sent',       label: 'sent' },
  { id: 'delivered',  label: 'delivered' },
  { id: 'bounced',    label: 'bounced' },
  { id: 'complained', label: 'complained' },
  { id: 'delayed',    label: 'delayed' },
  { id: 'failed',     label: 'failed' },
  { id: 'skipped',    label: 'skipped' },
]

const SINCE_OPTIONS = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d',  label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '',    label: 'All time' },
]

function sinceToDate(id) {
  if (!id) return null
  const m = id.match(/^(\d+)([hd])$/); if (!m) return null
  const n = Number(m[1]) || 0
  const unit = m[2] === 'h' ? 3600_000 : 86_400_000
  return new Date(Date.now() - n * unit).toISOString()
}

function formatRelative(s) {
  if (!s) return '—'
  try {
    const diff = Math.max(0, Date.now() - new Date(s).getTime())
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    return new Date(s).toLocaleDateString()
  } catch { return s }
}

function StatusPill({ status }) {
  const tone =
    status === 'delivered'  ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' :
    status === 'sent'       ? 'bg-sky-500/15 text-sky-200 border-sky-500/30' :
    status === 'bounced'    ? 'bg-rose-500/15 text-rose-200 border-rose-500/30' :
    status === 'failed'     ? 'bg-rose-500/15 text-rose-200 border-rose-500/30' :
    status === 'complained' ? 'bg-amber-500/15 text-amber-200 border-amber-500/30' :
    status === 'delayed'    ? 'bg-amber-500/15 text-amber-200 border-amber-500/30' :
    status === 'skipped'    ? 'bg-slate-700/30 text-slate-300 border-slate-700/60' :
                              'bg-slate-700/30 text-slate-200 border-slate-700/60'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-mono ${tone}`}>
      {status || 'unknown'}
    </span>
  )
}

export default function Emails() {
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('7d')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from('email_log')
        .select('id, sent_at, email_type, recipient, subject, status, from_address, error_message, organization_id, organizations(name)')
        .order('sent_at', { ascending: false })
        .limit(500)
      if (statusFilter) q = q.eq('status', statusFilter)
      if (typeFilter.trim()) q = q.ilike('email_type', `%${typeFilter.trim()}%`)
      const since = sinceToDate(sinceFilter)
      if (since) q = q.gte('sent_at', since)
      if (search.trim()) q = q.ilike('recipient', `%${search.trim()}%`)
      const { data, error: err } = await q
      if (err) throw err
      setRows(data || [])
    } catch (e) {
      setError(e?.message || 'Failed to load email log')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter, sinceFilter, search])

  useEffect(() => { load() }, [load])

  // Bounce / failure roll-up for the current window.
  const problems = useMemo(() => {
    const bad = (rows || []).filter((r) => r.status === 'bounced' || r.status === 'failed' || r.status === 'complained')
    return bad.slice(0, 12)
  }, [rows])

  const counts = useMemo(() => {
    const c = {}
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [rows])

  return (
    <div className="space-y-6 max-w-[1300px]">
      <PageTitle title="Email log" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Send className="w-6 h-6 text-indigo-300" aria-hidden="true" />
            Email log
          </h1>
          <p className="text-sm text-slate-500">
            Every transactional email Orin has sent — invites, reminders, resets — with the real delivery outcome from Resend.
          </p>
        </div>
        <RefreshButton onClick={load} loading={loading} label="Refresh email log" />
      </div>

      {/* Status roll-up */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${statusFilter === s ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/40'}`}
          >
            <StatusPill status={s} />
            <span className="tabular-nums text-slate-300">{n}</span>
          </button>
        ))}
      </div>

      {problems.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2 text-rose-200 text-sm font-medium mb-2">
            <AlertTriangle className="w-4 h-4" /> Delivery problems in this window
          </div>
          <ul className="space-y-1 text-xs text-slate-300">
            {problems.map((r) => (
              <li key={r.id} className="font-mono">
                <span className="text-rose-200">{r.status}</span> · {r.recipient}
                {r.organizations?.name ? <span className="text-slate-500"> · {r.organizations.name}</span> : null}
                {r.error_message ? <span className="text-slate-500"> — {r.error_message}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
            {STATUSES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select value={sinceFilter} onChange={(e) => setSinceFilter(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
            {SINCE_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <input
            type="search"
            aria-label="Filter by email type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            placeholder="type (e.g. org_invite)"
            className="px-2.5 py-1.5 w-48 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <input
            type="search"
            data-primary-search
            aria-label="Filter by recipient"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter by recipient"
            className="px-2.5 py-1.5 w-64 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-[11px] text-slate-500 ml-auto tabular-nums">
            {loading ? 'Loading…' : `${rows.length} email${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {error && <ErrorCard title="Couldn't load email log" error={error} onRetry={load} />}

      {!loading && rows.length === 0 && !error ? (
        <EmptyState icon={Send} title="No emails" description="No emails were sent in this window, or none match your filters." />
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
          <div className="max-h-[640px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-medium px-4 py-3">When</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Type</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Recipient</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Subject</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Org</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap" title={r.sent_at}>
                      {formatRelative(r.sent_at)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-xs whitespace-nowrap">{r.email_type || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-300 truncate max-w-[220px]" title={r.recipient}>{r.recipient || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400 truncate max-w-[260px]" title={r.subject || ''}>{r.subject || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-300 truncate max-w-[160px]">{r.organizations?.name || '—'}</td>
                    <td className="px-3 py-2.5" title={r.error_message || ''}>
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
