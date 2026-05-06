import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search as SearchIcon,
  Building2,
  UserCircle2,
  ContactRound,
  Briefcase,
  Hash,
  MessageSquare,
  Bot,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import Banner from '../components/ui/Banner'
import EmptyState from '../components/ui/EmptyState'
import PageTitle from '../components/ui/PageTitle'
import Skeleton from '../components/ui/Skeleton'
import ErrorCard from '../components/ui/ErrorCard'

const TYPE_META = {
  organization:    { label: 'Organizations', icon: Building2,    tone: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30' },
  user:            { label: 'Users',         icon: UserCircle2,  tone: 'bg-violet-500/15 text-violet-200 border-violet-500/30' },
  contact:         { label: 'Contacts',      icon: ContactRound, tone: 'bg-sky-500/15 text-sky-200 border-sky-500/30' },
  deal:            { label: 'Deals',         icon: Briefcase,    tone: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' },
  channel:         { label: 'Channels',      icon: Hash,         tone: 'bg-amber-500/15 text-amber-200 border-amber-500/30' },
  channel_message: { label: 'Channel msgs',  icon: MessageSquare,tone: 'bg-amber-500/15 text-amber-200 border-amber-500/30' },
  widget_message:  { label: 'Widget msgs',   icon: Bot,          tone: 'bg-rose-500/15 text-rose-200 border-rose-500/30' },
}

function formatRelative(s) {
  if (!s) return ''
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
  } catch { return '' }
}

function ResultRow({ row }) {
  const meta = TYPE_META[row.type] || { label: row.type, icon: Hash, tone: 'bg-slate-700/30 text-slate-200 border-slate-700/60' }
  const Icon = meta.icon
  const target =
    row.type === 'organization' ? `/companies/${row.id}` :
    row.type === 'contact' && row.organization_id ? `/companies/${row.organization_id}` :
    row.type === 'deal' && row.organization_id ? `/companies/${row.organization_id}` :
    row.organization_id ? `/companies/${row.organization_id}` : null

  const Body = (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${meta.tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-100 truncate">{row.title || row.id}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {row.snippet}
          {row.organization_name ? <span className="text-slate-400"> · {row.organization_name}</span> : null}
        </div>
      </div>
      <div className="text-[11px] text-slate-500 shrink-0">{formatRelative(row.matched_at)}</div>
    </div>
  )

  return target ? (
    <Link to={target} className="block hover:bg-slate-800/40 transition border-b border-slate-800/40 last:border-0">
      {Body}
    </Link>
  ) : (
    <div className="block border-b border-slate-800/40 last:border-0">{Body}</div>
  )
}

export default function CrossSearch() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const run = useCallback(async () => {
    if (!debouncedQ || debouncedQ.length < 2) { setRows([]); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('admin_cross_search', {
        p_query: debouncedQ,
        p_limit: 80,
      })
      if (err) throw err
      setRows(data || [])

      // Best-effort audit
      supabase.rpc('record_admin_action', {
        p_action: 'cross_search',
        p_target_type: 'platform',
        p_payload: { query: debouncedQ, hits: (data || []).length },
      }).catch(() => {})
    } catch (e) {
      setError(e?.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [debouncedQ])

  useEffect(() => { run() }, [run])

  const grouped = useMemo(() => {
    const groups = {}
    for (const r of rows) {
      const t = r.type || 'unknown'
      if (!groups[t]) groups[t] = []
      groups[t].push(r)
    }
    return groups
  }, [rows])

  const totalCount = rows.length
  const order = ['organization', 'user', 'contact', 'deal', 'channel', 'channel_message', 'widget_message']

  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageTitle title="Search" />
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
          <SearchIcon className="w-6 h-6 text-indigo-300" aria-hidden="true" />
          Cross-org search
        </h1>
        <p className="text-sm text-slate-500">
          Search organizations, users, contacts, deals, channels, channel messages, and widget messages across the entire platform.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-3">
        <div className="relative">
          <SearchIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            data-primary-search
            aria-label="Cross-org search query"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try: customer email, org slug, deal title, message text…"
            className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {error && <ErrorCard title="Search failed" error={error} onRetry={run} />}

      {!debouncedQ ? (
        <EmptyState icon={SearchIcon} title="Type at least 2 characters" description="Search uses ILIKE matching against the most useful customer-facing tables." />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={64} rounded="rounded-2xl" />
          ))}
        </div>
      ) : totalCount === 0 ? (
        <EmptyState icon={AlertTriangle} title="No matches" description={`Nothing matched "${debouncedQ}".`} />
      ) : (
        <div className="space-y-4">
          <div className="text-[11px] text-slate-500 tabular-nums">{totalCount} results</div>
          {order.filter((t) => grouped[t]?.length).map((t) => {
            const meta = TYPE_META[t]
            const Icon = meta.icon
            return (
              <div key={t} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-800/60 flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">{meta.label}</span>
                  <span className="text-[10px] text-slate-600 tabular-nums">({grouped[t].length})</span>
                </div>
                <div>
                  {grouped[t].map((r) => <ResultRow key={`${r.type}:${r.id}`} row={r} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
