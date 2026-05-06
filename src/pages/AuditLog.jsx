import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  Filter,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import Banner from '../components/ui/Banner'
import EmptyState from '../components/ui/EmptyState'

// Available event filters. Kept tight — anything not listed shows under
// "all". The dropdown deliberately stays short.
const ACTION_FILTERS = [
  { id: '', label: 'All actions' },
  { id: 'org_freeze', label: 'org_freeze' },
  { id: 'org_unfreeze', label: 'org_unfreeze' },
  { id: 'impersonate_start', label: 'impersonate_start' },
  { id: 'impersonate_end', label: 'impersonate_end' },
  { id: 'ai_key_set', label: 'ai_key_set' },
  { id: 'ai_throttle_org', label: 'ai_throttle_org' },
  { id: 'ai_unthrottle_org', label: 'ai_unthrottle_org' },
  { id: 'ai_budget_set', label: 'ai_budget_set' },
  { id: 'ai_quota_update', label: 'ai_quota_update' },
  { id: 'sql_run', label: 'sql_run' },
  { id: 'force_refresh_tokens', label: 'force_refresh_tokens' },
  { id: 'announcement_create', label: 'announcement_create' },
  { id: 'announcement_archive', label: 'announcement_archive' },
  { id: 'change_plan', label: 'change_plan' },
]

const TARGET_TYPES = [
  { id: '', label: 'Any target' },
  { id: 'organization', label: 'organization' },
  { id: 'user', label: 'user' },
  { id: 'announcement', label: 'announcement' },
  { id: 'sql', label: 'sql' },
  { id: 'platform', label: 'platform' },
  { id: 'ai_quota', label: 'ai_quota' },
]

const SINCE_OPTIONS = [
  { id: '',      label: 'All time' },
  { id: '1h',   label: 'Last hour' },
  { id: '24h',  label: 'Last 24h' },
  { id: '7d',   label: 'Last 7 days' },
  { id: '30d',  label: 'Last 30 days' },
]

function sinceToDate(id) {
  if (!id) return null
  const now = Date.now()
  const m = id.match(/^(\d+)([hd])$/)
  if (!m) return null
  const n = Number(m[1]) || 0
  const unit = m[2] === 'h' ? 3600_000 : 86_400_000
  return new Date(now - n * unit).toISOString()
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

function ActionPill({ action }) {
  const tone =
    /freeze|throttle|delete|hard_/.test(action) ? 'bg-rose-500/15 border-rose-500/30 text-rose-200' :
    /unfreeze|unthrottle|restore/.test(action)  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200' :
    /impersonate|sql_run|force/.test(action)    ? 'bg-amber-500/15 border-amber-500/30 text-amber-200' :
    /budget|throttle|quota/.test(action)        ? 'bg-violet-500/15 border-violet-500/30 text-violet-200' :
                                                  'bg-slate-700/30 border-slate-700/60 text-slate-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-mono ${tone}`}>
      {action || '—'}
    </span>
  )
}

export default function AuditLog() {
  const [actionFilter, setActionFilter] = useState('')
  const [targetTypeFilter, setTargetTypeFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')
  const [adminEmailFilter, setAdminEmailFilter] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [missing, setMissing] = useState(false)
  const [adminId, setAdminId] = useState(null)

  // Resolve email -> user id once when filter changes (debounced via simple useEffect).
  useEffect(() => {
    let cancelled = false
    if (!adminEmailFilter || !adminEmailFilter.includes('@')) { setAdminId(null); return }
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc('find_user_id_by_email', { p_email: adminEmailFilter.trim() })
        if (!cancelled) setAdminId(data || null)
      } catch { if (!cancelled) setAdminId(null) }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [adminEmailFilter])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const since = sinceToDate(sinceFilter)
      const { data, error: err } = await supabase.rpc('admin_audit_log_list', {
        p_limit: 200,
        p_offset: 0,
        p_action: actionFilter || null,
        p_target_type: targetTypeFilter || null,
        p_target_id: null,
        p_admin_id: adminId || null,
        p_since: since,
        p_until: null,
      })
      if (err) {
        if (err.code === 'PGRST202' || err.code === '42883' || /function .* does not exist/i.test(err.message || '')) {
          setMissing(true)
          // Fallback to direct table read
          let q = supabase.from('admin_audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200)
          if (actionFilter) q = q.eq('action', actionFilter)
          if (targetTypeFilter) q = q.eq('target_type', targetTypeFilter)
          if (adminId) q = q.eq('super_admin_id', adminId)
          if (since) q = q.gte('created_at', since)
          const fb = await q
          if (fb.error) throw fb.error
          setRows((fb.data || []).map((r) => ({ ...r, total_count: fb.data.length })))
          setTotal((fb.data || []).length)
          return
        }
        throw err
      }
      setRows(data || [])
      setTotal(data?.[0]?.total_count || 0)
    } catch (e) {
      setError(e?.message || 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [actionFilter, targetTypeFilter, adminId, sinceFilter])

  useEffect(() => { load() }, [load])

  const items = useMemo(() => rows || [], [rows])

  return (
    <div className="space-y-6 max-w-[1300px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-indigo-300" />
            Audit log
          </h1>
          <p className="text-sm text-slate-500">
            Every admin write action is recorded here. Append-only.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {missing && (
        <Banner tone="warning" title="admin_audit_log_list RPC not deployed">
          Showing fallback table read. Apply migration 112 to enable richer
          filtering, paging, and totals.
        </Banner>
      )}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            {ACTION_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            {TARGET_TYPES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select
            value={sinceFilter}
            onChange={(e) => setSinceFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            {SINCE_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={adminEmailFilter}
              onChange={(e) => setAdminEmailFilter(e.target.value)}
              placeholder="filter by admin email"
              className="pl-8 pr-3 py-1.5 w-64 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <span className="text-[11px] text-slate-500 ml-auto tabular-nums">
            {loading ? 'Loading…' : `${items.length} of ${total || items.length}`}
          </span>
        </div>
      </div>

      {error && <Banner tone="danger" title="Couldn't load audit log">{error}</Banner>}

      {!loading && items.length === 0 && !error ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit entries"
          description="Try adjusting filters, or perform an admin action and refresh."
        />
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-medium px-4 py-3">When</th>
                <th className="text-left font-medium px-3 py-3">Action</th>
                <th className="text-left font-medium px-3 py-3">Target</th>
                <th className="text-left font-medium px-3 py-3">Admin</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const isOpen = expanded === r.id
                const target = r.target_type
                  ? `${r.target_type}${r.target_id ? `:${String(r.target_id).slice(0, 8)}` : ''}`
                  : (r.target_org_id ? `organization:${String(r.target_org_id).slice(0, 8)}` :
                     r.target_user_id ? `user:${String(r.target_user_id).slice(0, 8)}` : '—')
                const payload = r.payload || r.metadata || null
                return (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition cursor-pointer"
                    >
                      <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap" title={r.created_at}>
                        {formatRelative(r.created_at)}
                      </td>
                      <td className="px-3 py-2.5"><ActionPill action={r.action} /></td>
                      <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{target}</td>
                      <td className="px-3 py-2.5 text-slate-300">
                        {r.super_admin_email || (r.super_admin_id || '').slice(0, 8) || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={r.id + '-expanded'} className="bg-slate-950/40 border-b border-slate-800/40">
                        <td colSpan={5} className="px-4 py-3">
                          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                            <div>
                              <dt className="text-slate-500">id</dt>
                              <dd className="text-slate-300 font-mono break-all">{r.id}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">created_at</dt>
                              <dd className="text-slate-300">{r.created_at}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">ip_address</dt>
                              <dd className="text-slate-300 font-mono">{r.ip_address || '—'}</dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">user_agent</dt>
                              <dd className="text-slate-300 truncate">{r.user_agent || '—'}</dd>
                            </div>
                          </dl>
                          {payload && Object.keys(payload).length > 0 && (
                            <pre className="mt-3 p-2 bg-slate-950 border border-slate-800/60 rounded text-[11px] text-slate-400 overflow-auto max-h-64">
                              {JSON.stringify(payload, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
