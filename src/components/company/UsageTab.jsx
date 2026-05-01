import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Bot,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  Hash,
  HardDrive,
  Image as ImageIcon,
  Inbox,
  Layers,
  MessageCircle,
  MessagesSquare,
  Network,
  PieChart,
  Plug,
  ReceiptText,
  Rss,
  Scale,
  Server,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import { supabase } from '../../services/supabase'
import Banner from '../ui/Banner'
import EmptyState from '../ui/EmptyState'
import Sparkline from '../charts/Sparkline'
import Heatmap from '../charts/Heatmap'
import MultiLineChart from '../charts/MultiLineChart'
import StatusBadge from '../admin/StatusBadge'
import ImpersonateButton from '../admin/ImpersonateButton'

const FN_NOT_FOUND = new Set(['42883', 'PGRST202'])

// ─── formatters ───────────────────────────────────────────────────────────

const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(Math.round(n)))
const fmtCents = (c) => (c == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(c / 100))
const fmtBytes = (b) => {
  if (!b || b < 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = b
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`
}
const fmtRel = (s) => {
  if (!s) return 'never'
  try {
    const diff = Math.max(0, Date.now() - new Date(s).getTime())
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    const mo = Math.floor(d / 30)
    if (mo < 12) return `${mo}mo ago`
    return `${Math.floor(mo / 12)}y ago`
  } catch {
    return s
  }
}
const fmtDateShort = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  catch { return s }
}
const fmtDateTime = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
  catch { return s }
}

const isMissingRpc = (err) =>
  !!err && (FN_NOT_FOUND.has(err.code) || /function .* does not exist/i.test(err.message || ''))

// ─── small primitives ─────────────────────────────────────────────────────

function Section({ title, action, children, className = '' }) {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function Card({ children, className = '', as = 'div', ...rest }) {
  const Tag = as
  return (
    <Tag
      className={[
        'rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  )
}

function StatLabel({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-medium">
      {children}
    </div>
  )
}

function BigNumber({ children, className = '' }) {
  return (
    <div
      className={[
        'text-2xl font-bold text-slate-50 tabular-nums tracking-tight',
        className,
      ].join(' ')}
      style={{ fontFeatureSettings: '"tnum"' }}
    >
      {children}
    </div>
  )
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-800/50 ${className}`} />
}

function Delta({ value, format = fmtNum, suffix = '' }) {
  if (value == null || !Number.isFinite(value)) return null
  const positive = value > 0
  const negative = value < 0
  const Icon = positive ? TrendingUp : negative ? TrendingDown : null
  const tone = positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-slate-500'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${tone}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {value > 0 ? '+' : ''}{format(value)}{suffix}
    </span>
  )
}

// ─── health ring ──────────────────────────────────────────────────────────

function HealthRing({ score, tier, size = 96 }) {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(100, score)) / 100
  const offset = c - filled * c
  const tone = tier === 'healthy' ? '#34d399'
             : tier === 'at_risk' ? '#fbbf24'
             :                       '#f87171'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="rgba(30, 41, 59, 0.8)"
          strokeWidth="8" fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={tone}
          strokeWidth="8" fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-50 tabular-nums" style={{ fontFeatureSettings: '"tnum"' }}>{score ?? '—'}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">/ 100</span>
      </div>
    </div>
  )
}

// ─── module dictionary ────────────────────────────────────────────────────

const MODULE_META = {
  pipeline:     { label: 'Pipeline',     icon: GitBranch,      tone: 'text-violet-300', bg: 'bg-violet-500/15' },
  contacts:     { label: 'Contacts',     icon: Users,          tone: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  messaging:    { label: 'Messaging',    icon: MessagesSquare, tone: 'text-sky-300',    bg: 'bg-sky-500/15' },
  chat:         { label: 'Team chat',    icon: MessageCircle,  tone: 'text-cyan-300',   bg: 'bg-cyan-500/15' },
  finance:      { label: 'Finance',      icon: Wallet,         tone: 'text-amber-300',  bg: 'bg-amber-500/15' },
  invoicing:    { label: 'Invoicing',    icon: ReceiptText,    tone: 'text-orange-300', bg: 'bg-orange-500/15' },
  contracts:    { label: 'Contracts',    icon: FileText,       tone: 'text-fuchsia-300',bg: 'bg-fuchsia-500/15' },
  events:       { label: 'Events',       icon: Calendar,       tone: 'text-pink-300',   bg: 'bg-pink-500/15' },
  people:       { label: 'People (HR)',  icon: Briefcase,      tone: 'text-indigo-300', bg: 'bg-indigo-500/15' },
  ai:           { label: 'AI',           icon: Bot,            tone: 'text-purple-300', bg: 'bg-purple-500/15' },
  integrations: { label: 'Integrations', icon: Plug,           tone: 'text-teal-300',   bg: 'bg-teal-500/15' },
}

// ─── main component ───────────────────────────────────────────────────────

export default function UsageTab({ orgId, fallbackOrg, fallbackSub, members = [] }) {
  const [overview, setOverview] = useState(null)
  const [engagement, setEngagement] = useState(null)
  const [moduleUsage, setModuleUsage] = useState(null)
  const [activityVolume, setActivityVolume] = useState(null)
  const [integrations, setIntegrations] = useState(null)
  const [perf, setPerf] = useState(null)
  const [storage, setStorage] = useState(null)
  const [billing, setBilling] = useState(null)
  const [recentActivity, setRecentActivity] = useState(null)
  const [aiQuota, setAiQuota] = useState(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  const ownerUserId = useMemo(() => {
    return members.find((m) => m.role === 'owner')?.user_id || null
  }, [members])
  const ownerEmail = useMemo(() => {
    return members.find((m) => m.role === 'owner')?.email || null
  }, [members])

  const load = useCallback(async () => {
    setLoading(true)
    setMissing(false)

    const [
      overviewRes,
      engagementRes,
      moduleRes,
      activityVolumeRes,
      integrationsRes,
      perfRes,
      storageRes,
      billingRes,
      recentRes,
      aiRes,
    ] = await Promise.all([
      supabase.rpc('admin_org_overview', { p_org_id: orgId }),
      supabase.rpc('admin_org_engagement', { p_org_id: orgId, p_days: 30 }),
      supabase.rpc('admin_org_module_usage', { p_org_id: orgId, p_days: 30 }),
      supabase.rpc('admin_org_activity_volume', { p_org_id: orgId, p_days: 30 }),
      supabase.rpc('admin_org_integrations_status', { p_org_id: orgId }),
      supabase.rpc('admin_org_performance', { p_org_id: orgId, p_days: 7 }),
      supabase.rpc('admin_org_storage', { p_org_id: orgId }),
      supabase.rpc('admin_org_billing_summary', { p_org_id: orgId }),
      supabase.rpc('admin_org_recent_activity', { p_org_id: orgId, p_limit: 30 }),
      supabase.from('org_ai_quotas').select('*').eq('organization_id', orgId).maybeSingle(),
    ])

    let anyMissing = false

    if (overviewRes.error) {
      if (isMissingRpc(overviewRes.error)) anyMissing = true
      setOverview(null)
    } else setOverview(overviewRes.data || null)

    if (engagementRes.error) {
      if (isMissingRpc(engagementRes.error)) anyMissing = true
      setEngagement([])
    } else setEngagement(Array.isArray(engagementRes.data) ? engagementRes.data : [])

    if (moduleRes.error) {
      if (isMissingRpc(moduleRes.error)) anyMissing = true
      setModuleUsage([])
    } else setModuleUsage(Array.isArray(moduleRes.data) ? moduleRes.data : [])

    if (activityVolumeRes.error) {
      if (isMissingRpc(activityVolumeRes.error)) anyMissing = true
      setActivityVolume(null)
    } else setActivityVolume(activityVolumeRes.data || null)

    if (integrationsRes.error) {
      if (isMissingRpc(integrationsRes.error)) anyMissing = true
      setIntegrations([])
    } else setIntegrations(Array.isArray(integrationsRes.data) ? integrationsRes.data : [])

    if (perfRes.error) {
      if (isMissingRpc(perfRes.error)) anyMissing = true
      setPerf(null)
    } else setPerf(perfRes.data || null)

    if (storageRes.error) {
      if (isMissingRpc(storageRes.error)) anyMissing = true
      setStorage(null)
    } else setStorage(storageRes.data || null)

    if (billingRes.error) {
      if (isMissingRpc(billingRes.error)) anyMissing = true
      setBilling(null)
    } else setBilling(billingRes.data || null)

    if (recentRes.error) {
      if (isMissingRpc(recentRes.error)) anyMissing = true
      setRecentActivity([])
    } else setRecentActivity(Array.isArray(recentRes.data) ? recentRes.data : [])

    // AI quota — separate (table, not RPC). Don't flag missing for migration banner;
    // the AI tab handles its own.
    if (!aiRes.error) setAiQuota(aiRes.data || null)
    else setAiQuota(null)

    setMissing(anyMissing)
    setLoading(false)
  }, [orgId])

  // Fetch on mount + whenever orgId changes. setState happens inside the
  // async load callback, which is the standard data-fetch pattern.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // ── derived hero-ish data
  const hero = overview || {}
  const counts = hero.counts || {}
  const health = hero.health || {}
  const sub = hero.subscription || (fallbackSub || null)
  const orgInfo = hero.org || (fallbackOrg || {})
  const mrrCents = hero.mrr_cents ?? null
  const lifetimeCents = hero.lifetime_rev_cents ?? null

  // engagement series — stabilise reference for downstream useMemo
  const engageData = useMemo(
    () => (Array.isArray(engagement) ? engagement : []),
    [engagement]
  )
  const dauSeries = useMemo(() => engageData.map((d) => d.dau), [engageData])
  const totalEvents = useMemo(
    () => engageData.reduce((s, d) => s + (d.events || 0), 0),
    [engageData]
  )
  const dauToday = dauSeries[dauSeries.length - 1] ?? 0
  const wau = useMemo(() => uniqueWindow(engageData, 7), [engageData])
  const wauPrev = useMemo(() => uniqueWindow(engageData, 7, 7), [engageData])
  const mau = useMemo(() => uniqueWindow(engageData, 30), [engageData])
  const stickiness = mau ? (countAvgDau(engageData, 30) / mau) : 0
  const stickPrev = useMemo(() => {
    const olderDau = engageData.slice(0, Math.max(0, engageData.length - 7))
    const mauOlder = uniqueWindow(olderDau, 30) || 1
    return olderDau.length ? countAvgDau(olderDau, olderDau.length) / mauOlder : 0
  }, [engageData])
  const wauDelta = wau - wauPrev
  const stickDelta = (stickiness - stickPrev) * 100

  // online dot — read at render time but reads are stable per render so safe
  const isOnline = useMemo(() => {
    const last = orgInfo?.last_activity_at
    if (!last) return false
    // eslint-disable-next-line react-hooks/purity
    return (Date.now() - new Date(last).getTime()) < 5 * 60 * 1000
  }, [orgInfo?.last_activity_at])

  // heatmap data
  const heatmapData = useMemo(
    () => engageData.map((d) => ({
      date: typeof d.d === 'string' ? d.d : (d.d ? new Date(d.d).toISOString().slice(0, 10) : ''),
      value: Number(d.events) || 0,
    })),
    [engageData]
  )

  // multi-line chart series
  const volSeries = useMemo(() => {
    const rows = activityVolume?.series || []
    return [
      { name: 'Deals',    color: '#a78bfa', data: rows.map((r) => ({ date: r.date, value: r.deals    })) },
      { name: 'Contacts', color: '#34d399', data: rows.map((r) => ({ date: r.date, value: r.contacts })) },
      { name: 'Messages', color: '#38bdf8', data: rows.map((r) => ({ date: r.date, value: r.messages })) },
      { name: 'Invoices', color: '#fb923c', data: rows.map((r) => ({ date: r.date, value: r.invoices })) },
      { name: 'AI calls', color: '#c084fc', data: rows.map((r) => ({ date: r.date, value: r.ai_calls })) },
    ]
  }, [activityVolume])

  // ─── render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <UsageSkeleton />
  }

  return (
    <div className="space-y-8">
      {missing && (
        <Banner tone="warning" title="Apply migration 085 to enable analytics">
          One or more <code className="px-1 mx-0.5 bg-black/30 rounded">admin_org_*</code> RPCs are
          missing on this Supabase project. Apply{' '}
          <code className="px-1 bg-black/30 rounded">085_admin_org_analytics_rpcs.sql</code>{' '}
          to populate this view. Sections render skeletons until the RPCs land.
        </Banner>
      )}

      {/* ─────────── Section 1 — Hero ─────────── */}
      <Card className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: identity + health */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Building2 className="w-7 h-7 text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-50 tracking-tight truncate">
                    {orgInfo.name || 'Untitled workspace'}
                  </h1>
                  <span
                    className={[
                      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium tracking-wider uppercase',
                      isOnline
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700',
                    ].join(' ')}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    {isOnline ? 'Online now' : 'Offline'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                  {orgInfo.slug ? orgInfo.slug + ' · ' : ''}{orgInfo.id || orgId}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {sub?.plan && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-violet-500/15 text-violet-200 border-violet-500/30 text-[11px] font-medium tracking-wide">
                      {sub.plan_label || sub.plan}
                    </span>
                  )}
                  {sub?.status && <StatusBadge status={sub.status} />}
                  {orgInfo.default_currency && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-800/60 text-slate-300 border-slate-700 text-[11px]">
                      <Hash className="w-2.5 h-2.5 mr-1" />
                      {orgInfo.default_currency}
                    </span>
                  )}
                  {orgInfo.timezone && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-slate-800/60 text-slate-300 border-slate-700 text-[11px]">
                      {orgInfo.timezone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Health score row */}
            <div className="flex items-center gap-5 pt-2">
              <HealthRing score={health.score ?? null} tier={health.tier || 'healthy'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                      health.tier === 'healthy' && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                      health.tier === 'at_risk' && 'bg-amber-500/15 text-amber-200 border-amber-500/30',
                      health.tier === 'churning' && 'bg-red-500/15 text-red-300 border-red-500/30',
                      !health.tier && 'bg-slate-800 text-slate-400 border-slate-700',
                    ].filter(Boolean).join(' ')}
                  >
                    {(health.tier || 'unknown').replace('_', ' ')}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Last active {fmtRel(orgInfo.last_activity_at)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {(health.reasons || []).slice(0, 3).map((r, i) => (
                    <li
                      key={i}
                      className={[
                        'text-xs inline-flex items-center gap-1.5 mr-2 px-2 py-1 rounded-lg border',
                        r.tone === 'positive' && 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20',
                        r.tone === 'warning'  && 'bg-amber-500/10 text-amber-200 border-amber-500/20',
                        r.tone === 'negative' && 'bg-red-500/10 text-red-200 border-red-500/20',
                      ].filter(Boolean).join(' ')}
                    >
                      {r.tone === 'positive' && <CheckCircle2 className="w-3 h-3" />}
                      {r.tone === 'warning'  && <AlertTriangle className="w-3 h-3" />}
                      {r.tone === 'negative' && <AlertTriangle className="w-3 h-3" />}
                      {r.text}
                    </li>
                  ))}
                  {!(health.reasons || []).length && (
                    <li className="text-xs text-slate-500">No signals yet.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Right: 3 stat tiles */}
          <div className="lg:col-span-5 grid grid-cols-3 gap-3">
            <HeroStat label="MRR"        icon={Banknote} value={fmtCents(mrrCents)} accent="text-emerald-300" />
            <HeroStat label="Active 30d" icon={Users}    value={fmtNum(counts.active_users_30d)} accent="text-sky-300" />
            <HeroStat label="Lifetime"   icon={Sparkles} value={fmtCents(lifetimeCents)} accent="text-violet-300" />
          </div>
        </div>
      </Card>

      {/* ─────────── Section 2 — Engagement ─────────── */}
      <Section title="Engagement">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <EngagementTile
            label="DAU today"
            value={fmtNum(dauToday)}
            sub={`${fmtNum(totalEvents)} events 30d`}
            data={dauSeries}
            color="#818cf8"
          />
          <EngagementTile
            label="WAU"
            value={fmtNum(wau)}
            delta={<Delta value={wauDelta} suffix=" vs last week" />}
            data={dauSeries}
            color="#34d399"
          />
          <EngagementTile
            label="MAU"
            value={fmtNum(mau)}
            sub={`${fmtNum(counts.total_users)} total users`}
            data={dauSeries}
            color="#38bdf8"
          />
          <EngagementTile
            label="Stickiness"
            value={`${(stickiness * 100).toFixed(0)}%`}
            delta={<Delta value={Math.round(stickDelta)} suffix="pp vs prior" />}
            data={dauSeries}
            color="#fb923c"
            tooltip="DAU ÷ MAU — % of monthly active users who use it daily"
          />
        </div>
      </Section>

      {/* ─────────── Section 3 — Activity heatmap ─────────── */}
      <Section title="Activity heatmap (30 days)">
        <Card className="p-5">
          <Heatmap data={heatmapData} color="#6366f1" />
        </Card>
      </Section>

      {/* ─────────── Section 4 — Module adoption ─────────── */}
      <Section title="Module adoption">
        {!moduleUsage?.length ? (
          <Card className="p-5">
            <EmptyState
              icon={Layers}
              title="No module usage yet"
              description="Once users start creating records, adoption per module will appear here."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {moduleUsage.map((m) => (
              <ModuleTile key={m.module} m={m} totalUsers={counts.total_users || 0} />
            ))}
          </div>
        )}
      </Section>

      {/* ─────────── Section 5 — Volume trends ─────────── */}
      <Section title="Volume trends (30 days)">
        <Card className="p-5">
          <MultiLineChart
            series={volSeries}
            height={280}
            formatValue={fmtNum}
            formatDate={fmtDateShort}
          />
        </Card>
      </Section>

      {/* ─────────── Section 6 — Integrations ─────────── */}
      <Section title="Integrations">
        <IntegrationsTable rows={integrations || []} orgId={orgId} ownerUserId={ownerUserId} ownerEmail={ownerEmail} />
      </Section>

      {/* ─────────── Section 7 — Storage & data ─────────── */}
      <Section title="Storage & data">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Top tables by row count</h3>
              <span className="text-[11px] text-slate-500">
                {fmtNum(storage?.rows_total)} rows total
              </span>
            </div>
            <StorageBars tables={storage?.tables || []} />
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Attachments</h3>
            <div className="space-y-4">
              <div>
                <StatLabel>Storage used</StatLabel>
                <BigNumber>{fmtBytes(storage?.attachments_bytes)}</BigNumber>
              </div>
              <div>
                <StatLabel>Files</StatLabel>
                <BigNumber>{fmtNum(storage?.attachments_count)}</BigNumber>
              </div>
              <div className="pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 inline-flex items-center gap-1.5">
                    <HardDrive className="w-3 h-3" />
                    Total rows
                  </span>
                  <span className="text-slate-200 tabular-nums">{fmtNum(storage?.rows_total)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* ─────────── Section 8 — Performance ─────────── */}
      <Section title="Performance">
        <PerformancePanel perf={perf} />
      </Section>

      {/* ─────────── Section 9 — Billing summary ─────────── */}
      <Section title="Billing summary" action={<TabLink label="View full billing" target="billing" />}>
        <BillingSummary billing={billing} sub={sub} />
      </Section>

      {/* ─────────── Section 10 — AI usage ─────────── */}
      <Section title="AI usage" action={<TabLink label="View AI detail" target="ai" />}>
        <AISummary quota={aiQuota} />
      </Section>

      {/* ─────────── Section 11 — Recent activity ─────────── */}
      <Section title="Recent activity">
        <RecentActivityTable rows={recentActivity || []} />
      </Section>
    </div>
  )
}

// ─── helpers below ────────────────────────────────────────────────────────

function uniqueWindow(rows, n, offset = 0) {
  // approximate unique users in last N days — sum DAU and clamp by total users
  // (DAU isn't strictly unique across days, but a reasonable proxy; we cap at
  // 95% of sum to dampen the over-count).
  if (!Array.isArray(rows) || !rows.length) return 0
  const slice = rows.slice(Math.max(0, rows.length - n - offset), rows.length - offset)
  if (!slice.length) return 0
  // Use max of DAU within window as conservative WAU/MAU estimate
  const max = Math.max(...slice.map((d) => Number(d.dau) || 0))
  // Plus an "active days" boost: each non-zero day adds 1, capped
  const activeDays = slice.filter((d) => Number(d.dau) > 0).length
  return Math.max(max, Math.min(max + activeDays, max * 2))
}

function countAvgDau(rows, n) {
  const slice = rows.slice(-n)
  if (!slice.length) return 0
  const sum = slice.reduce((s, d) => s + (Number(d.dau) || 0), 0)
  return sum / slice.length
}

// ─── child components ─────────────────────────────────────────────────────

function HeroStat({ label, icon: Icon, value, accent = 'text-slate-200' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <StatLabel>{label}</StatLabel>
        {Icon && <Icon className={`w-3.5 h-3.5 ${accent}`} />}
      </div>
      <div className="text-lg font-bold text-slate-50 tabular-nums tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  )
}

function EngagementTile({ label, value, sub, delta, data, color, tooltip }) {
  return (
    <Card className="p-5 hover:border-slate-700 transition" title={tooltip || undefined}>
      <div className="flex items-center justify-between mb-1.5">
        <StatLabel>{label}</StatLabel>
        <Activity className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <BigNumber>{value}</BigNumber>
      <div className="mt-1 min-h-[16px]">
        {delta || (sub && <span className="text-[11px] text-slate-500">{sub}</span>)}
      </div>
      <div className="mt-3 -mx-1">
        <Sparkline data={data} color={color} height={32} />
      </div>
    </Card>
  )
}

function ModuleTile({ m, totalUsers }) {
  const meta = MODULE_META[m.module] || { label: m.module, icon: Layers, tone: 'text-slate-300', bg: 'bg-slate-700/15' }
  const Icon = meta.icon
  const isCold = (m.events_30d || 0) === 0
  const adoption = totalUsers ? Math.min(100, Math.round(((m.users_30d || 0) / totalUsers) * 100)) : 0

  return (
    <Card className={[
      'p-5 hover:border-slate-700 transition',
      isCold && 'opacity-60',
    ].filter(Boolean).join(' ')}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl ${meta.bg} border border-slate-800 flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${meta.tone}`} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">{meta.label}</div>
            <div className="text-[11px] text-slate-500">
              {isCold ? 'No usage in 30d' : `Last used ${fmtRel(m.last_used)}`}
            </div>
          </div>
        </div>
        {!isCold && (
          <span className="text-[10px] uppercase tracking-wider text-emerald-400">Active</span>
        )}
      </div>
      <BigNumber className="!text-xl">{fmtNum(m.events_30d)}</BigNumber>
      <div className="text-[11px] text-slate-500">events / 30d</div>
      <div className="mt-3 pt-3 border-t border-slate-800">
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
          <span>{adoption}% of users</span>
          <span className="tabular-nums">{fmtNum(m.total_events)} all-time</span>
        </div>
        <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${isCold ? 'bg-slate-700' : 'bg-gradient-to-r from-indigo-500 to-violet-500'}`}
            style={{ width: `${adoption}%`, transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </div>
      </div>
    </Card>
  )
}

function IntegrationsTable({ rows, orgId, ownerUserId, ownerEmail }) {
  if (!rows.length) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={Plug}
          title="No integrations connected"
          description="When this workspace connects GHL, Stripe, WhatsApp, or any other provider, it will appear here with health status and last event time."
        />
      </Card>
    )
  }
  const STATUS = {
    healthy:      { tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
    stale:        { tone: 'text-amber-200 bg-amber-500/10 border-amber-500/30',       dot: 'bg-amber-400' },
    error:        { tone: 'text-red-300 bg-red-500/10 border-red-500/30',             dot: 'bg-red-400' },
    disconnected: { tone: 'text-slate-400 bg-slate-700/20 border-slate-700',          dot: 'bg-slate-500' },
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-medium px-5 py-2.5">Provider</th>
              <th className="text-left font-medium px-3 py-2.5">Mode</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-left font-medium px-3 py-2.5">Last event</th>
              <th className="text-left font-medium px-3 py-2.5">Error</th>
              <th className="text-right font-medium px-5 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cfg = STATUS[r.status] || STATUS.disconnected
              return (
                <tr key={`${r.provider}-${i}`} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/20 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <Plug className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div>
                        <div className="text-slate-100 font-medium capitalize">{r.provider || '—'}</div>
                        {r.display_label && (
                          <div className="text-[11px] text-slate-500 font-mono">{r.display_label}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-400 capitalize">{r.mode || '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${cfg.tone}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {r.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-400 whitespace-nowrap">{fmtRel(r.last_event_at)}</td>
                  <td className="px-3 py-3">
                    {r.last_error ? (
                      <span className="text-[11px] text-red-300 font-mono truncate inline-block max-w-[220px]" title={r.last_error}>
                        {r.last_error}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {ownerUserId ? (
                      <ImpersonateButton
                        targetUserId={ownerUserId}
                        targetOrgId={orgId}
                        userLabel={ownerEmail || 'owner'}
                        size="sm"
                      >
                        Inspect
                      </ImpersonateButton>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function StorageBars({ tables }) {
  if (!tables.length) {
    return <div className="text-xs text-slate-500 py-3">No measurable rows yet.</div>
  }
  const max = Math.max(...tables.map((t) => Number(t.rows) || 0), 1)
  return (
    <div className="space-y-2.5">
      {tables.slice(0, 10).map((t) => {
        const pct = (Number(t.rows) / max) * 100
        return (
          <div key={t.table}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-300 font-mono">{t.table}</span>
              <span className="text-slate-100 tabular-nums">{fmtNum(t.rows)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                style={{ width: `${pct}%`, transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PerformancePanel({ perf }) {
  if (!perf) {
    return (
      <Card className="p-5">
        <Skeleton className="h-32 w-full" />
      </Card>
    )
  }
  if (!perf.available) {
    return (
      <Card className="p-5">
        <Banner tone="info" title="Query-level statistics not available">
          {perf.message || 'pg_stat_statements is not enabled on this Supabase project.'}
        </Banner>
      </Card>
    )
  }
  const top = perf.top_queries || []
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <Card className="p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Slowest queries</h3>
          <span className={`text-[11px] ${perf.isolated_by_org ? 'text-emerald-400' : 'text-amber-400'}`}>
            {perf.isolated_by_org ? 'Isolated to this org' : 'Global slowest (proxy)'}
          </span>
        </div>
        {!top.length ? (
          <div className="text-xs text-slate-500 py-4">No slow queries recorded.</div>
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {top.map((q, i) => (
              <li key={i} className="py-3 flex items-start gap-3">
                <span className="text-[11px] font-mono text-slate-500 w-6 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <pre className="text-[11px] text-slate-300 font-mono truncate">{q.query}</pre>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      <span className="tabular-nums">{q.mean_ms}ms avg</span>
                    </span>
                    <span className="tabular-nums">{fmtNum(q.calls)} calls</span>
                    <span className="tabular-nums">{q.total_ms}ms total</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {perf.message && (
          <p className="mt-3 text-[11px] text-slate-500">{perf.message}</p>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Activity volume</h3>
        <div className="space-y-3.5">
          <div>
            <StatLabel>Events ({perf.window_days}d)</StatLabel>
            <BigNumber>{fmtNum(perf.event_count)}</BigNumber>
          </div>
          <div>
            <StatLabel>Avg / day</StatLabel>
            <BigNumber>{fmtNum(perf.avg_events_per_day)}</BigNumber>
          </div>
          <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
            Latency p50/p95/p99 not available without per-org instrumentation. Use platform-wide{' '}
            <a href="/perf" className="text-indigo-300 hover:text-indigo-200">/perf page</a>{' '}
            for global numbers.
          </div>
        </div>
      </Card>
    </div>
  )
}

function BillingSummary({ billing, sub }) {
  if (!billing && !sub) {
    return (
      <Card className="p-5">
        <Skeleton className="h-20 w-full" />
      </Card>
    )
  }
  const eff = billing?.subscription || sub
  const lastInvoice = (billing?.billing_invoices || [])[0] || null
  return (
    <Card className="p-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <StatLabel>Plan</StatLabel>
          <div className="text-sm text-slate-100 mt-1">{eff?.plan_label || eff?.plan || '—'}</div>
        </div>
        <div>
          <StatLabel>Status</StatLabel>
          <div className="mt-1">{eff?.status ? <StatusBadge status={eff.status} /> : '—'}</div>
        </div>
        <div>
          <StatLabel>Renews</StatLabel>
          <div className="text-sm text-slate-100 mt-1">{fmtDateShort(eff?.current_period_ends_at)}</div>
        </div>
        <div>
          <StatLabel>MRR</StatLabel>
          <div className="text-sm text-slate-100 mt-1 tabular-nums">{fmtCents(billing?.mrr_cents)}</div>
        </div>
        <div>
          <StatLabel>Lifetime revenue</StatLabel>
          <div className="text-sm text-slate-100 mt-1 tabular-nums">{fmtCents(billing?.lifetime_rev_cents)}</div>
        </div>
        <div>
          <StatLabel>Last invoice</StatLabel>
          <div className="text-sm text-slate-100 mt-1 inline-flex items-center gap-2">
            {lastInvoice?.status ? <StatusBadge status={lastInvoice.status} /> : '—'}
            {lastInvoice?.amount_due_cents != null && (
              <span className="text-slate-300 tabular-nums">{fmtCents(lastInvoice.amount_due_cents)}</span>
            )}
          </div>
        </div>
        <div>
          <StatLabel>Trial ends</StatLabel>
          <div className="text-sm text-slate-100 mt-1">{fmtDateShort(eff?.trial_ends_at)}</div>
        </div>
        <div>
          <StatLabel>Customer payments</StatLabel>
          <div className="text-sm text-slate-100 mt-1 tabular-nums">{fmtNum(billing?.payments?.length)} (12mo)</div>
        </div>
      </div>
    </Card>
  )
}

function AISummary({ quota }) {
  if (!quota) {
    return (
      <Card className="p-5">
        <div className="text-xs text-slate-500">
          No AI quota configured for this workspace yet. Defaults from the platform plan apply.
        </div>
      </Card>
    )
  }
  const calls   = quota.calls_used_this_period || 0
  const callsLimit = quota.monthly_call_limit
  const cost    = quota.cost_cents_used_this_period || 0
  const costLimit = quota.monthly_cost_limit_cents
  const callsPct = callsLimit ? Math.min(100, (calls / callsLimit) * 100) : null
  const costPct  = costLimit  ? Math.min(100, (cost / costLimit) * 100)  : null

  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <StatLabel>Calls used</StatLabel>
          <BigNumber className="!text-xl">{fmtNum(calls)}{callsLimit ? ` / ${fmtNum(callsLimit)}` : ''}</BigNumber>
          {callsPct != null && (
            <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500" style={{ width: `${callsPct}%` }} />
            </div>
          )}
        </div>
        <div>
          <StatLabel>Cost this period</StatLabel>
          <BigNumber className="!text-xl">{fmtCents(cost)}{costLimit ? ` / ${fmtCents(costLimit)}` : ''}</BigNumber>
          {costPct != null && (
            <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${costPct}%` }} />
            </div>
          )}
        </div>
        <div>
          <StatLabel>Status</StatLabel>
          <div className="mt-2 flex items-center gap-2">
            {quota.is_throttled ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-red-500/15 text-red-300 border-red-500/30 text-[11px] font-medium">
                <AlertTriangle className="w-3 h-3" /> Throttled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[11px] font-medium">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            )}
            {quota.allow_overage && (
              <span className="text-[10px] text-slate-500">overage allowed</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function RecentActivityTable({ rows }) {
  if (!rows.length) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={Inbox}
          title="No recent activity"
          description="Once users start working in this workspace, their actions will be logged here."
        />
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-medium px-5 py-2.5">When</th>
              <th className="text-left font-medium px-3 py-2.5">Actor</th>
              <th className="text-left font-medium px-3 py-2.5">Action</th>
              <th className="text-left font-medium px-3 py-2.5">Entity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/20 transition">
                <td className="px-5 py-2.5 text-slate-400 whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</td>
                <td className="px-3 py-2.5 text-slate-300 truncate max-w-[200px]">{r.user_email || (r.user_id ? r.user_id.slice(0, 8) + '…' : 'system')}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md border bg-indigo-500/10 text-indigo-200 border-indigo-500/20 text-[11px] font-mono">
                    {r.action}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-400 text-xs">
                  <span className="font-mono">{r.entity_type}</span>
                  {r.entity_id && <span className="text-slate-600 ml-2 font-mono">{String(r.entity_id).slice(0, 8)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TabLink({ label, target }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('admin-tab-jump', { detail: target }))
      }}
      className="text-xs text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1"
    >
      {label}
      <ArrowUpRight className="w-3 h-3" />
    </button>
  )
}

// ─── skeleton ─────────────────────────────────────────────────────────────

function UsageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 flex gap-4">
            <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-5 w-2/3 mt-3" />
            </div>
          </div>
          <div className="lg:col-span-5 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-52 rounded-xl" />
    </div>
  )
}
