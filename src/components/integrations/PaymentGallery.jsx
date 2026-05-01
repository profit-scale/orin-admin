import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import usePaymentProcessors from '../../hooks/usePaymentProcessors'
import usePaymentConnections from '../../hooks/usePaymentConnections'
import ProcessorCard from './ProcessorCard'
import ProcessorConnectionDrawer from './ProcessorConnectionDrawer'
import Banner from '../ui/Banner'
import Skeleton from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'

/**
 * Gallery of every supported payment processor for the currently-selected
 * organization. Mirrors the customer app's `PaymentGallery` but re-implemented
 * here so the admin portal can carry its own theme + deploy without a shared
 * package.
 *
 * Props:
 *   organizationId : string — the org we're managing payments for. In the
 *                            admin portal this is the platform org. The
 *                            parent is responsible for handing us the
 *                            currently-selected org id.
 */
export default function PaymentGallery({ organizationId }) {
  // Catalog (processors) and per-org connections — separate hooks so the
  // catalog can be cached/reused even when the user switches orgs (which
  // only requires re-fetching connections).
  const {
    processors,
    loading:      processorsLoading,
    error:        processorsError,
    missingTable: missingProcessorsTable,
  } = usePaymentProcessors()

  const {
    byProcessorId,
    loading:      connectionsLoading,
    error:        connectionsError,
    missingTable: missingConnectionsTable,
    refetch:      refetchConnections,
  } = usePaymentConnections(organizationId)

  // Local UI: search + region filter + drawer state.
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('all')   // 'all' | 'connected' | 'global' | 'sea' | 'malaysia'
  const [drawerState, setDrawerState] = useState({ open: false, processor: null, connection: null })

  // Compute filter chip counts off the catalog (cheap; ≤10 rows).
  const counts = useMemo(() => {
    const c = { all: processors.length, connected: 0, global: 0, sea: 0, malaysia: 0 }
    for (const p of processors) {
      if (byProcessorId.has(p.id)) c.connected++
      if (p.category === 'global')    c.global++
      if (p.category === 'sea')       c.sea++
      if (p.category === 'malaysia')  c.malaysia++
    }
    return c
  }, [processors, byProcessorId])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return processors.filter((p) => {
      if (filter === 'connected' && !byProcessorId.has(p.id)) return false
      if (filter !== 'all' && filter !== 'connected' && p.category !== filter) return false
      if (!q) return true
      const haystack = [
        p.display_name, p.slug, p.tagline, p.description,
        ...(Array.isArray(p.regions) ? p.regions : []),
        ...(Array.isArray(p.supported_methods) ? p.supported_methods : []),
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [processors, byProcessorId, filter, search])

  // Loading skeleton: 6 placeholders so the layout doesn't jump.
  if (processorsLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton width={40} height={40} rounded="rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton width="50%" />
                <Skeleton width="30%" height={10} />
              </div>
            </div>
            <div className="space-y-1.5 mb-3">
              <Skeleton width="100%" height={10} />
              <Skeleton width="85%" height={10} />
              <Skeleton width="60%" height={10} />
            </div>
            <Skeleton width="100%" height={28} rounded="rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  // Migration 078 not applied — page-level message, no gallery.
  if (missingProcessorsTable || missingConnectionsTable) {
    return (
      <Banner tone="warning" title="Payment processor catalog isn't available yet">
        Apply migration 078 to enable this feature. From the customer app repo:
        <pre className="mt-2 px-2 py-1.5 bg-black/40 rounded text-amber-100 font-mono text-[11px] overflow-x-auto">
          supabase db push
        </pre>
      </Banner>
    )
  }

  // Hard error (network, RLS misconfig, etc) — show, but let the user see
  // the chip counts above us so they know it's a partial failure.
  if (processorsError) {
    return (
      <Banner tone="danger" title="Failed to load payment processors">
        {processorsError}
      </Banner>
    )
  }

  if (processors.length === 0) {
    return (
      <EmptyState
        title="No payment processors available"
        description="The catalog is empty. The seed in migration 078 should have inserted seven processors — re-apply if needed."
      />
    )
  }

  // ── render ────────────────────────────────────────────────────────

  const FILTERS = [
    { id: 'all',       label: 'All',         count: counts.all },
    { id: 'connected', label: 'Connected',   count: counts.connected },
    { id: 'global',    label: 'Global',      count: counts.global },
    { id: 'sea',       label: 'SEA',         count: counts.sea },
    { id: 'malaysia',  label: 'Malaysia',    count: counts.malaysia },
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filter chips */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search processors, regions, methods…"
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

        <div className="flex items-center gap-1 p-0.5 bg-slate-900/60 border border-slate-800 rounded-lg">
          {FILTERS.map((f) => {
            const isActive = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={[
                  'px-2.5 py-1 text-[11px] rounded-md transition inline-flex items-center gap-1.5',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-200'
                    : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {f.label}
                <span className={[
                  'tabular-nums text-[10px]',
                  isActive ? 'text-indigo-300/80' : 'text-slate-600',
                ].join(' ')}>
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Inline error from connections — non-fatal; gallery still usable for read */}
      {connectionsError && (
        <Banner tone="danger" title="Couldn't load this org's connections">
          {connectionsError}
        </Banner>
      )}

      {/* Connections still loading shimmer (gallery already visible) */}
      {connectionsLoading && (
        <div className="text-[11px] text-slate-500 italic">Loading your connections…</div>
      )}

      {/* Empty filter result */}
      {visible.length === 0 ? (
        <EmptyState
          title={search ? `No matches for "${search}"` : 'No processors match this filter'}
          description="Try a different search or clear the filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((processor) => (
            <ProcessorCard
              key={processor.id}
              processor={processor}
              connection={byProcessorId.get(processor.id) || null}
              onConnect={(p) => setDrawerState({ open: true, processor: p, connection: null })}
              onManage={(p, c) => setDrawerState({ open: true, processor: p, connection: c })}
            />
          ))}
        </div>
      )}

      {/* Connect / manage drawer */}
      <ProcessorConnectionDrawer
        open={drawerState.open}
        processor={drawerState.processor}
        connection={drawerState.connection}
        organizationId={organizationId}
        onClose={() => setDrawerState({ open: false, processor: null, connection: null })}
        onSaved={() => { refetchConnections() }}
      />
    </div>
  )
}
