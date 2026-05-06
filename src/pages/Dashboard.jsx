import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Activity,
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  Sparkles,
  History,
  Inbox,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import StatCard from '../components/ui/StatCard'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import Banner from '../components/ui/Banner'
import MiniLineChart from '../components/charts/MiniLineChart'

// ────────────────────────────────────────────────────────────────────
// formatters
// ────────────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

function formatCurrencyCents(cents) {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100)
}

function formatCurrencyShort(cents) {
  if (cents == null) return '$0'
  const usd = (cents || 0) / 100
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}k`
  return `$${Math.round(usd)}`
}

function relativeTime(s) {
  if (!s) return ''
  const diff = Math.max(0, Date.now() - new Date(s).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function joinedAgo(s) {
  if (!s) return ''
  const diff = Math.max(0, Date.now() - new Date(s).getTime())
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) return 'joined today'
  if (days === 1) return 'joined yesterday'
  if (days < 30) return `joined ${days} days ago`
  if (days < 365) return `joined ${Math.floor(days / 30)} months ago`
  return `joined ${Math.floor(days / 365)} years ago`
}

const PLAN_ORDER = ['trial', 'starter', 'growth', 'scale', 'enterprise']
const PLAN_STYLE = {
  trial:      { color: 'bg-slate-500',   text: 'text-slate-300',   ring: 'ring-slate-500/30' },
  starter:    { color: 'bg-indigo-500',  text: 'text-indigo-300',  ring: 'ring-indigo-500/30' },
  growth:     { color: 'bg-violet-500',  text: 'text-violet-300',  ring: 'ring-violet-500/30' },
  scale:      { color: 'bg-fuchsia-500', text: 'text-fuchsia-300', ring: 'ring-fuchsia-500/30' },
  enterprise: { color: 'bg-amber-500',   text: 'text-amber-300',   ring: 'ring-amber-500/30' },
}

// ────────────────────────────────────────────────────────────────────
// section card
// ────────────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur ${className}`}>
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// dashboard
// ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(true)

  const [mrrHistory, setMrrHistory] = useState([])
  const [mrrLoading, setMrrLoading] = useState(true)
  const [mrrSkipped, setMrrSkipped] = useState(false)

  const [recentSignups, setRecentSignups] = useState([])
  const [signupsLoading, setSignupsLoading] = useState(true)
  const [signupsSkipped, setSignupsSkipped] = useState(false)

  const [planRows, setPlanRows] = useState([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansSkipped, setPlansSkipped] = useState(false)

  const [auditEntries, setAuditEntries] = useState([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditSkipped, setAuditSkipped] = useState(false)

  const [missingMigrations, setMissingMigrations] = useState(false)
  const [error, setError] = useState(null)

  // ── load overview
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('admin_platform_overview')
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) setMissingMigrations(true)
        else setError(error.message || 'Failed to load overview')
      } else {
        // RPCs in postgres can return a single row as either an object or a 1-element array
        setOverview(Array.isArray(data) ? data[0] : data)
      }
      setOverviewLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // ── load MRR history
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('admin_mrr_history', { p_months: 12 })
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) setMrrSkipped(true)
        else console.warn('[dashboard] admin_mrr_history failed:', error.message)
      } else {
        setMrrHistory(Array.isArray(data) ? data : [])
      }
      setMrrLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // ── load recent signups (direct table query) + realtime updates
  // When a new org gets created we want to (a) prepend it to the list
  // and (b) re-pull the platform overview so the counters update too.
  // The realtime channel auto-cleans on unmount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      if (cancelled) return
      if (error) {
        // 42P01 = relation does not exist
        if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
          setSignupsSkipped(true)
        } else {
          console.warn('[dashboard] recent signups failed:', error.message)
        }
      } else {
        setRecentSignups(Array.isArray(data) ? data : [])
      }
      setSignupsLoading(false)
    })()

    // Realtime — surface new signups instantly. When an org is inserted,
    // refresh BOTH the signup list and the overview MV (best-effort).
    const channel = supabase
      .channel('orin-admin:organizations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'organizations' },
        (payload) => {
          const row = payload?.new
          if (!row || !row.id) return
          setRecentSignups((prev) => {
            // dedupe — skip if we already have it
            if (prev.some((p) => p.id === row.id)) return prev
            return [row, ...prev].slice(0, 10)
          })
          // Bump the platform overview counters by re-fetching after
          // a quick refresh of the materialized view. Best-effort.
          void supabase
            .rpc('admin_refresh_platform_overview')
            .then(() => supabase.rpc('admin_platform_overview'))
            .then(({ data: o, error: rerr }) => {
              if (!rerr && o) setOverview(Array.isArray(o) ? o[0] : o)
            })
            .catch(() => {})
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  // ── load plan distribution
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('subscriptions').select('plan')
      if (cancelled) return
      if (error) {
        if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
          setPlansSkipped(true)
        } else {
          console.warn('[dashboard] plan distribution failed:', error.message)
        }
      } else {
        const counts = new Map(PLAN_ORDER.map((p) => [p, 0]))
        for (const row of data || []) {
          const key = (row.plan || 'trial').toLowerCase()
          if (counts.has(key)) counts.set(key, counts.get(key) + 1)
          else counts.set(key, (counts.get(key) || 0) + 1)
        }
        const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1
        const ordered = PLAN_ORDER.map((plan) => ({
          plan,
          count: counts.get(plan) || 0,
          pct: ((counts.get(plan) || 0) / total) * 100,
        }))
        // append any unknown plan keys we found
        for (const [plan, count] of counts) {
          if (!PLAN_ORDER.includes(plan)) {
            ordered.push({ plan, count, pct: (count / total) * 100 })
          }
        }
        setPlanRows(ordered)
      }
      setPlansLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // ── load admin audit log
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)
      if (cancelled) return
      if (error) {
        if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
          setAuditSkipped(true)
        } else {
          console.warn('[dashboard] audit log failed:', error.message)
        }
      } else {
        setAuditEntries(Array.isArray(data) ? data : [])
      }
      setAuditLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // ── chart data
  // admin_mrr_history returns rows shaped:
  //   { month_start, paid_invoice_cents, new_orgs }
  // We chart paid_invoice_cents — that's the closest to "real money this
  // month" we have until we wire Stripe revenue back into the platform.
  const chartData = useMemo(() => {
    return mrrHistory.map((row) => {
      const dateStr = row.month_start || row.month || row.period || row.label
      const label = dateStr
        ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short' })
        : '—'
      const value = Number(
        row.paid_invoice_cents ?? row.mrr_cents ?? row.mrr ?? row.value ?? 0
      )
      return { label, value }
    })
  }, [mrrHistory])

  // ── derive figures
  // Match the field names admin_platform_overview actually returns
  // (it pulls straight from mv_platform_overview).
  // We accept legacy aliases too in case a future migration renames them.
  const totalOrgs   = overview?.total_organizations     ?? overview?.total_orgs       ?? overview?.total_companies   ?? null
  const activeOrgs  = overview?.active_organizations_30d ?? overview?.active_orgs     ?? overview?.active_companies  ?? null
  const mrrCents    = overview?.mrr_cents               ?? (overview?.mrr != null ? overview.mrr * 100 : null)
  const totalUsers  = overview?.total_users             ?? overview?.active_users     ?? null

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Platform overview across all Orin tenants.
          </p>
        </div>
        <div className="text-[11px] text-slate-600 hidden md:block">
          Refreshed{' '}
          <span className="text-slate-400">
            {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Migrations warning — only shows up if the RPC truly isn't deployed
          yet. After 111 this should never fire on the live stack. */}
      {missingMigrations && (
        <Banner tone="warning" title="Platform RPC not deployed">
          The <code className="px-1 py-0.5 bg-black/30 rounded">admin_platform_overview</code>{' '}
          RPC is missing on this database. Apply the admin migrations
          (now starting at 111) to populate the dashboard.
        </Banner>
      )}

      {error && !missingMigrations && (
        <Banner tone="danger" title="Failed to load dashboard data">
          {error}
        </Banner>
      )}

      {/* Hero stats */}
      {/* TODO(historic-deltas): once we capture day-over-day / week-over-week
          snapshots, replace the static delta strings with real comparisons. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Companies"
          value={formatNumber(totalOrgs)}
          delta="all-time"
          deltaTone="neutral"
          icon={Building2}
          accent="from-indigo-500/40 to-indigo-700/40"
          loading={overviewLoading}
        />
        <StatCard
          label="Active Companies"
          value={formatNumber(activeOrgs)}
          delta="last 30 days"
          deltaTone="neutral"
          icon={Activity}
          accent="from-violet-500/40 to-violet-700/40"
          loading={overviewLoading}
        />
        <StatCard
          label="MRR"
          value={formatCurrencyCents(mrrCents)}
          delta="combined across tenants"
          deltaTone="neutral"
          icon={DollarSign}
          accent="from-emerald-500/40 to-emerald-700/40"
          loading={overviewLoading}
        />
        <StatCard
          label="Total Users"
          value={formatNumber(totalUsers)}
          delta="all roles & tenants"
          deltaTone="neutral"
          icon={Users}
          accent="from-amber-500/40 to-amber-700/40"
          loading={overviewLoading}
        />
      </div>

      {/* MRR chart */}
      <SectionCard
        title="Monthly Recurring Revenue"
        subtitle="Trailing 12 months — combined MRR across all tenants"
        action={
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">12M</span>
          </div>
        }
      >
        {mrrSkipped ? (
          <Banner tone="warning" className="my-2">
            <code className="px-1 py-0.5 bg-black/30 rounded">admin_mrr_history</code> RPC
            not yet available — apply migrations 073-077.
          </Banner>
        ) : mrrLoading ? (
          <div className="h-[220px] flex items-center justify-center">
            <Skeleton className="w-full" height={200} rounded="rounded-xl" />
          </div>
        ) : chartData.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No revenue data yet"
            description="The MRR chart will populate after the first paid invoice is recorded."
          />
        ) : (
          <MiniLineChart
            data={chartData}
            height={240}
            color="#a78bfa"
            formatValue={formatCurrencyShort}
          />
        )}
      </SectionCard>

      {/* Two-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent signups */}
        <SectionCard
          title="Recent signups"
          subtitle="Newest organizations to join the platform"
          action={
            <Link
              to="/companies"
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
            >
              View all →
            </Link>
          }
        >
          {signupsSkipped ? (
            <Banner tone="warning" className="my-2">
              <code className="px-1 py-0.5 bg-black/30 rounded">organizations</code> table
              not yet available.
            </Banner>
          ) : signupsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton width={32} height={32} rounded="rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton width="40%" />
                    <Skeleton width="25%" height={10} />
                  </div>
                </div>
              ))}
            </div>
          ) : recentSignups.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No signups yet"
              description="Organizations will appear here as they sign up."
            />
          ) : (
            <ul className="-mx-2">
              {recentSignups.map((org) => {
                const initial = (org.name || org.slug || '?').charAt(0).toUpperCase()
                return (
                  <li key={org.id}>
                    <Link
                      to={`/companies/${org.id}`}
                      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-800/40 transition group"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/30 ring-1 ring-indigo-500/20 flex items-center justify-center text-xs font-semibold text-indigo-200">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-100 font-medium truncate group-hover:text-indigo-200 transition">
                          {org.name || org.slug || org.id}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {joinedAgo(org.created_at)}{org.slug && org.name ? ` · ${org.slug}` : ''}
                        </div>
                      </div>
                      <span className="text-slate-600 group-hover:text-slate-400 transition text-xs">→</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        {/* Plan distribution */}
        <SectionCard
          title="Plan distribution"
          subtitle="How tenants are split across pricing tiers"
        >
          {plansSkipped ? (
            <Banner tone="warning" className="my-2">
              <code className="px-1 py-0.5 bg-black/30 rounded">subscriptions</code> table
              not yet available.
            </Banner>
          ) : plansLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton width={60} />
                    <Skeleton width={30} />
                  </div>
                  <Skeleton width="100%" height={8} rounded="rounded-full" />
                </div>
              ))}
            </div>
          ) : planRows.every((r) => r.count === 0) ? (
            <EmptyState
              icon={DollarSign}
              title="No subscriptions yet"
              description="Plan distribution will populate as tenants subscribe."
            />
          ) : (
            <ul className="space-y-3.5">
              {planRows.map((row) => {
                const style = PLAN_STYLE[row.plan] || { color: 'bg-slate-500', text: 'text-slate-300', ring: 'ring-slate-500/30' }
                return (
                  <li key={row.plan}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className={`capitalize font-medium ${style.text}`}>
                        {row.plan}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        {row.count}{' '}
                        <span className="text-slate-600">({row.pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden ring-1 ring-inset ring-slate-800/40">
                      <div
                        className={`h-full ${style.color} transition-all duration-500 rounded-full`}
                        style={{ width: `${Math.max(row.pct, row.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Things to action / audit log */}
      <SectionCard
        title="Recent admin activity"
        subtitle="Latest entries from the admin audit log"
        action={
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>Last 5</span>
          </div>
        }
      >
        {auditSkipped ? (
          <Banner tone="warning" className="my-2">
            <code className="px-1 py-0.5 bg-black/30 rounded">admin_audit_log</code> table
            not yet available — apply migrations 067-077.
          </Banner>
        ) : auditLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton width={32} height={32} rounded="rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton width="50%" />
                  <Skeleton width="30%" height={10} />
                </div>
                <Skeleton width={50} height={10} />
              </div>
            ))}
          </div>
        ) : auditEntries.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No admin actions logged yet"
            description="Actions taken in this portal will be recorded here for audit purposes."
          />
        ) : (
          <ul className="-mx-2 divide-y divide-slate-800/40">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="px-2 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/30 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 text-indigo-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 truncate">
                    <span className="font-medium">{entry.actor_email || entry.actor_id || 'system'}</span>{' '}
                    <span className="text-slate-400">{entry.action || entry.event || 'performed an action'}</span>
                    {entry.target_type && (
                      <span className="text-slate-500"> on {entry.target_type}</span>
                    )}
                  </div>
                  {(entry.target_id || entry.metadata) && (
                    <div className="text-[11px] text-slate-500 truncate font-mono">
                      {entry.target_id || JSON.stringify(entry.metadata).slice(0, 80)}
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                  {relativeTime(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
