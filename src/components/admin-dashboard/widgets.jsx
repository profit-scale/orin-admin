// ─────────────────────────────────────────────────────────────────────
// Admin dashboard widget components.
//
// Every widget is a small self-contained component that fetches its own
// data. They share a uniform card chrome via `WidgetCard` for visual
// consistency.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  Building2,
  Sparkles,
  AlertCircle,
  ShieldAlert,
  CreditCard,
  HardDrive,
  Activity,
  Heart,
} from 'lucide-react'
import { supabase } from '../../services/supabase'
import { isMissingFunction } from '../../lib/rpcErrors'
import Sparkline from '../charts/Sparkline'
import Skeleton from '../ui/Skeleton'

function WidgetCard({ icon: Icon, title, action, children, accentClass = 'text-indigo-300' }) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`w-4 h-4 ${accentClass}`} />}
          <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">{title}</h3>
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function BigNumber({ value, hint, tone = 'default' }) {
  const toneCls = {
    default: 'text-slate-100',
    danger:  'text-rose-200',
    warning: 'text-amber-200',
    success: 'text-emerald-200',
  }[tone] || 'text-slate-100'
  return (
    <div>
      <div className={`text-3xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  )
}

function fmtNum(n)  { return n == null ? '—' : new Intl.NumberFormat('en-US').format(n) }
function fmtUsd(c)  {
  if (c == null) return '$0'
  const v = (c || 0) / 100
  if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v/1_000).toFixed(1)}k`
  return `$${Math.round(v)}`
}

// Generic 1-RPC widget hook
function useRpc(fn, args, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(null)
    ;(async () => {
      const { data: d, error } = await supabase.rpc(fn, args)
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) setErr('migration not applied')
        else setErr(error.message)
      } else {
        setData(d)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, loading, err }
}

// ── Widgets ──────────────────────────────────────────────────────────

export function MrrSparkWidget() {
  const { data, loading, err } = useRpc('admin_mrr_history', { p_months: 12 }, [])
  const points = (data || []).map((r) => Number(r.paid_invoice_cents ?? r.mrr_cents ?? 0))
  const cur = points.length ? points[points.length - 1] : 0
  return (
    <WidgetCard icon={TrendingUp} title="MRR (paid invoices)" accentClass="text-emerald-300">
      {loading ? <Skeleton width="100%" height={72} /> : err ? <span className="text-[11px] text-amber-400">{err}</span> : (
        <>
          <BigNumber value={fmtUsd(cur)} hint={`Trailing 12 months · last point`} tone="success" />
          {points.length > 0 && (
            <div className="mt-2 -mx-1">
              <Sparkline data={points} height={36} color="#34d399" />
            </div>
          )}
        </>
      )}
    </WidgetCard>
  )
}

export function ActiveOrgsWidget() {
  const { data, loading, err } = useRpc('admin_platform_overview', undefined, [])
  const ov = Array.isArray(data) ? data[0] : data
  const total  = ov?.total_organizations ?? ov?.total_orgs ?? null
  const active = ov?.active_organizations_30d ?? ov?.active_orgs ?? null
  return (
    <WidgetCard icon={Building2} title="Active orgs (30d)">
      {loading ? <Skeleton width="100%" height={72} /> : err ? <span className="text-[11px] text-amber-400">{err}</span> : (
        <BigNumber value={fmtNum(active)} hint={`of ${fmtNum(total)} total`} />
      )}
    </WidgetCard>
  )
}

export function AiCostMtdWidget() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const monthStart = new Date()
      monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0)
      const { data: r } = await supabase
        .from('ai_usage')
        .select('cost_cents')
        .gte('created_at', monthStart.toISOString())
      if (cancelled) return
      const total = (r || []).reduce((acc, x) => acc + Number(x.cost_cents || 0), 0)
      setData(total)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <WidgetCard icon={Sparkles} title="AI cost MTD" accentClass="text-violet-300">
      {loading ? <Skeleton width="100%" height={72} /> : (
        <BigNumber value={fmtUsd(data || 0)} hint="Across all orgs · current month" />
      )}
    </WidgetCard>
  )
}

export function ErrorsLast24hWidget() {
  const { data, loading } = useRpc('admin_edge_invocations_summary', { p_hours: 24 }, [])
  const errors = (data || []).reduce((acc, r) => acc + Number(r.errors || 0), 0)
  const calls  = (data || []).reduce((acc, r) => acc + Number(r.invocations || 0), 0)
  const pct = calls > 0 ? (errors / calls) * 100 : 0
  return (
    <WidgetCard icon={AlertCircle} title="Errors 24h"
      accentClass={errors > 0 ? 'text-rose-300' : 'text-emerald-300'}>
      {loading ? <Skeleton width="100%" height={72} /> : (
        <BigNumber
          value={fmtNum(errors)}
          hint={`${pct.toFixed(2)}% of ${fmtNum(calls)} calls`}
          tone={errors > 0 ? 'danger' : 'success'} />
      )}
    </WidgetCard>
  )
}

export function AuthFails24hWidget() {
  const [count, setCount] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const since = new Date(Date.now() - 24*3600*1000).toISOString()
      const { count: c, error } = await supabase
        .from('auth_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'signin_fail')
        .gte('created_at', since)
      if (cancelled) return
      if (!error) setCount(c || 0)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <WidgetCard icon={ShieldAlert} title="Auth fails 24h" accentClass="text-amber-300">
      {loading ? <Skeleton width="100%" height={72} /> : (
        <BigNumber value={fmtNum(count)} hint="Failed signins" tone={(count||0) > 0 ? 'warning' : 'success'} />
      )}
    </WidgetCard>
  )
}

export function FailedPaymentsWidget() {
  const [count, setCount] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const since = new Date(Date.now() - 30*24*3600*1000).toISOString()
      const { count: c, error } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .gt('amount_due', 0)
        .gte('created_at', since)
      if (cancelled) return
      if (!error) setCount(c || 0)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <WidgetCard icon={CreditCard} title="Unpaid invoices" accentClass="text-amber-300">
      {loading ? <Skeleton width="100%" height={72} /> : (
        <BigNumber value={fmtNum(count)} hint="Open invoices · last 30d" />
      )}
    </WidgetCard>
  )
}

export function RecentSignupsWidget() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('organizations')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: false })
        .limit(6)
      if (!cancelled) {
        setRows(data || [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <WidgetCard icon={Building2} title="Recent signups">
      {loading ? <Skeleton width="100%" height={120} /> : rows.length === 0 ? (
        <div className="text-[11px] text-slate-500">No signups yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((o) => (
            <li key={o.id}>
              <Link to={`/companies/${o.id}`}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md hover:bg-slate-800/40 transition">
                <span className="text-slate-200 truncate">{o.name || o.slug}</span>
                <span className="text-[10px] text-slate-500">
                  {new Date(o.created_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

export function TopCostlyOrgsWidget() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const monthStart = new Date()
      monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0)
      const { data } = await supabase
        .from('ai_usage')
        .select('organization_id, cost_cents')
        .gte('created_at', monthStart.toISOString())
      if (cancelled) return
      const map = new Map()
      for (const r of data || []) {
        const k = r.organization_id
        if (!k) continue
        map.set(k, (map.get(k) || 0) + Number(r.cost_cents || 0))
      }
      const top = Array.from(map.entries())
        .map(([id, c]) => ({ id, cents: c }))
        .sort((a, b) => b.cents - a.cents)
        .slice(0, 5)
      // Look up names
      const ids = top.map((t) => t.id)
      const { data: orgs } = ids.length
        ? await supabase.from('organizations').select('id, name, slug').in('id', ids)
        : { data: [] }
      const nameMap = new Map((orgs || []).map((o) => [o.id, o.name || o.slug]))
      setRows(top.map((t) => ({ ...t, name: nameMap.get(t.id) || t.id })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <WidgetCard icon={Sparkles} title="Top AI cost orgs (MTD)" accentClass="text-violet-300">
      {loading ? <Skeleton width="100%" height={120} /> : rows.length === 0 ? (
        <div className="text-[11px] text-slate-500">No usage yet this month.</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/companies/${r.id}`}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md hover:bg-slate-800/40 transition">
                <span className="text-slate-200 truncate">{r.name}</span>
                <span className="text-violet-300 tabular-nums">{fmtUsd(r.cents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

export function StorageGrowthWidget() {
  // Best-effort: try a few RPC names that may exist; fall back to a hint.
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const names = ['admin_storage_overview', 'admin_storage_summary', 'admin_storage_intel']
      for (const n of names) {
        const { data: d, error } = await supabase.rpc(n)
        if (cancelled) return
        if (!error && d != null) { setData(d); break }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])
  const summary = Array.isArray(data) ? data[0] : data
  const totalBytes = summary?.total_bytes ?? summary?.total_size_bytes ?? null
  const totalMb = totalBytes != null ? Number(totalBytes) / (1024*1024) : null
  return (
    <WidgetCard icon={HardDrive} title="Storage used" accentClass="text-sky-300">
      {loading ? <Skeleton width="100%" height={72} /> : (
        <BigNumber
          value={totalMb != null ? `${Number(totalMb).toFixed(1)} MB` : '—'}
          hint={totalMb != null ? 'Across all orgs' : 'admin_storage_* RPC unavailable'}
        />
      )}
    </WidgetCard>
  )
}

export function HealthBucketsWidget() {
  // Compute org counts by health bucket directly from `org_health_scores`.
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('org_health_scores')
        .select('score')
      if (cancelled) return
      if (error) {
        setLoading(false)
        return
      }
      const buckets = { 'Excellent (>=80)': 0, 'Good (60-79)': 0, 'At risk (40-59)': 0, 'Critical (<40)': 0 }
      for (const r of data || []) {
        const s = Number(r.score || 0)
        if (s >= 80) buckets['Excellent (>=80)']++
        else if (s >= 60) buckets['Good (60-79)']++
        else if (s >= 40) buckets['At risk (40-59)']++
        else buckets['Critical (<40)']++
      }
      setRows(Object.entries(buckets).map(([label, count]) => ({ label, count })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <WidgetCard icon={Heart} title="Health-score buckets" accentClass="text-rose-300">
      {loading ? <Skeleton width="100%" height={120} /> : rows.length === 0 ? (
        <div className="text-[11px] text-slate-500">No data.</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between text-xs">
              <span className="text-slate-200">{r.label}</span>
              <span className="text-slate-400 tabular-nums">{fmtNum(r.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
