import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Eye,
  ArrowUpDown,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'

const PAGE_SIZE = 25

const SORT_OPTIONS = [
  { id: 'newest',       label: 'Newest',                arg: 'created_at_desc' },
  { id: 'most_active',  label: 'Most Active',           arg: 'last_activity_desc' },
  { id: 'mrr_desc',     label: 'MRR (high → low)',      arg: 'mrr_desc' },
  { id: 'members_desc', label: 'Members (high → low)',  arg: 'member_count_desc' },
]

// ────────────────────────────────────────────────────────────────────
// formatters
// ────────────────────────────────────────────────────────────────────

function formatDate(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return s
  }
}

function formatRelative(s) {
  if (!s) return '—'
  try {
    const diff = Math.max(0, Date.now() - new Date(s).getTime())
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return formatDate(s)
  } catch {
    return s
  }
}

function formatCurrency(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function StatusPill({ status }) {
  const map = {
    active:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    trialing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    paused:   'bg-slate-500/15 text-slate-300 border-slate-500/30',
    canceled: 'bg-red-500/15 text-red-300 border-red-500/30',
  }
  const classes = map[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] capitalize ${classes}`}>
      {status || 'unknown'}
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────
// debounced value hook
// ────────────────────────────────────────────────────────────────────

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ────────────────────────────────────────────────────────────────────
// sort dropdown
// ────────────────────────────────────────────────────────────────────

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = SORT_OPTIONS.find((s) => s.id === value) || SORT_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 text-sm text-slate-200 transition"
      >
        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
        <span>{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-52 rounded-lg border border-slate-800 bg-slate-900/95 backdrop-blur shadow-xl shadow-black/40 py-1 z-20">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm transition ${
                opt.id === value
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// page
// ────────────────────────────────────────────────────────────────────

export default function Companies() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)

  const [orgs, setOrgs] = useState([])
  const [totalCount, setTotalCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [missingMigrations, setMissingMigrations] = useState(false)
  const [error, setError] = useState(null)

  // reset page when search/sort changes
  useEffect(() => { setPage(0) }, [debouncedSearch, sort])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const sortArg = (SORT_OPTIONS.find((s) => s.id === sort) || SORT_OPTIONS[0]).arg
      const { data, error } = await supabase.rpc('admin_orgs_list', {
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_search: debouncedSearch || null,
        p_sort: sortArg,
      })
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) {
          setMissingMigrations(true)
        } else {
          setError(error.message || 'Failed to load companies')
        }
      } else {
        const rows = Array.isArray(data) ? data : []
        setOrgs(rows)
        // RPC may return total_count on each row (common pattern); fall back to inferred count
        if (rows.length && rows[0].total_count != null) {
          setTotalCount(Number(rows[0].total_count))
        } else if (page === 0 && rows.length < PAGE_SIZE) {
          setTotalCount(rows.length)
        } else {
          // unknown total — leave as null and let the UI hide the total
          setTotalCount(null)
        }
        setMissingMigrations(false)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [debouncedSearch, sort, page])

  const showingFrom = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = page * PAGE_SIZE + orgs.length
  const hasNextPage = useMemo(() => {
    if (totalCount != null) return showingTo < totalCount
    // if we don't know total, assume there's a next page only if we got a full page
    return orgs.length === PAGE_SIZE
  }, [totalCount, showingTo, orgs.length])

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Companies</h1>
          <p className="text-sm text-slate-500">
            All organizations on the Orin platform.
          </p>
        </div>
        {!loading && !missingMigrations && (
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {totalCount != null
              ? `${totalCount} ${totalCount === 1 ? 'company' : 'companies'}`
              : `${orgs.length}+ companies`}
          </span>
        )}
      </div>

      {missingMigrations && (
        <Banner tone="warning" className="mb-6" title="Migrations not yet applied">
          The <code className="px-1 py-0.5 bg-black/30 rounded">admin_orgs_list</code> RPC is missing.
          Apply the admin migrations (067-077) to your Supabase project to enable this page.
        </Banner>
      )}

      {error && !missingMigrations && (
        <Banner tone="danger" className="mb-6" title="Failed to load companies">
          {error}
        </Banner>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-slate-900/60 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-100 placeholder-slate-600 outline-none transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <SortDropdown value={sort} onChange={setSort} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-medium px-4 py-3">Company</th>
                <th className="text-left font-medium px-4 py-3">Plan</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Members</th>
                <th className="text-right font-medium px-4 py-3">MRR</th>
                <th className="text-left font-medium px-4 py-3">Created</th>
                <th className="text-left font-medium px-4 py-3">Last activity</th>
                <th className="text-right font-medium px-4 py-3 w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-800/40">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton width="100%" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {!loading && !missingMigrations && orgs.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    {debouncedSearch ? (
                      <EmptyState
                        icon={Search}
                        title={`No matches for "${debouncedSearch}"`}
                        description="Try a different name or clear the search to see all companies."
                        action={
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition"
                          >
                            <X className="w-3 h-3" />
                            Clear search
                          </button>
                        }
                      />
                    ) : (
                      <EmptyState
                        icon={Building2}
                        title="No companies yet"
                        description="Once tenants sign up to Orin, they will appear here."
                      />
                    )}
                  </td>
                </tr>
              )}

              {!loading && orgs.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/companies/${o.id}`)}
                  className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/companies/${o.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-100 font-medium group-hover:text-indigo-300 transition"
                    >
                      {o.name || o.slug || o.id}
                    </Link>
                    {o.slug && o.name && (
                      <div className="text-[11px] text-slate-500">{o.slug}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300 capitalize">{o.plan || '—'}</td>
                  <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                    {o.member_count ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                    {formatCurrency(o.mrr)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {formatDate(o.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {formatRelative(o.last_activity_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/companies/${o.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800/60 hover:bg-indigo-500/20 border border-slate-700 hover:border-indigo-500/40 text-[11px] text-slate-300 hover:text-indigo-200 transition"
                    >
                      <Eye className="w-3 h-3" />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && !missingMigrations && orgs.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/60 text-xs text-slate-500">
            <span>
              {totalCount != null
                ? <>Showing <span className="text-slate-300 tabular-nums">{showingFrom}-{showingTo}</span> of <span className="text-slate-300 tabular-nums">{totalCount}</span></>
                : <>Showing <span className="text-slate-300 tabular-nums">{showingFrom}-{showingTo}</span></>
              }
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900/60 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <span className="px-2 text-slate-500 tabular-nums">
                Page {page + 1}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900/60 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
