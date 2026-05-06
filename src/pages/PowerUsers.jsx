import { useEffect, useMemo, useState } from 'react'
import { Flame, RefreshCcw, Users as UsersIcon, MessageSquare, Briefcase, Sparkles, Settings as SettingsIcon } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'

function timeAgo(s) {
  if (!s) return '—'
  const d = new Date(s).getTime()
  const diff = Date.now() - d
  if (diff < 60_000)     return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const SORTS = [
  { id: 'score',     label: 'Activity score' },
  { id: 'last',      label: 'Last active' },
  { id: 'messages',  label: 'Messages' },
  { id: 'ai',        label: 'AI calls' },
]

export default function PowerUsers() {
  const [list, setList]   = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [days, setDays]   = useState(30)
  const [top, setTop]     = useState(50)
  const [orgFilter, setOrgFilter] = useState('')
  const [sort, setSort]   = useState('score')
  const [drawer, setDrawer] = useState(null)

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_user_activity_heatmap', { p_days: days, p_top: top })
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      else toast.error('Failed to load heatmap', { description: error.message })
    } else {
      setList(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [days, top])

  const orgs = useMemo(() => {
    const m = new Map()
    list.forEach((r) => { if (r.organization_id) m.set(r.organization_id, r.organization_name || '—') })
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }))
  }, [list])

  const filtered = useMemo(() => {
    let xs = orgFilter ? list.filter((r) => r.organization_id === orgFilter) : list
    const sortFn = {
      score:    (a, b) => Number(b.activity_score || 0) - Number(a.activity_score || 0),
      last:     (a, b) => new Date(b.last_active || 0) - new Date(a.last_active || 0),
      messages: (a, b) => Number(b.message_count || 0) - Number(a.message_count || 0),
      ai:       (a, b) => Number(b.ai_count || 0) - Number(a.ai_count || 0),
    }[sort] || (() => 0)
    return [...xs].sort(sortFn)
  }, [list, orgFilter, sort])

  const maxBucket = useMemo(() => {
    let m = 0
    list.forEach((r) => { (r.daily_buckets || []).forEach((b) => { if (b > m) m = b }) })
    return m
  }, [list])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-300" />
            Power users
          </h1>
          <p className="text-sm text-slate-500">
            Per-user activity across all orgs. Score weights: 1 message · 2 deal · 3 AI · 5 setting.
          </p>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 138 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">138_power_user_activity.sql</code>.
        </Banner>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Window</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Top N</label>
          <select value={top} onChange={(e) => setTop(Number(e.target.value))}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Org filter</label>
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 min-w-[220px]">
            <option value="">All orgs</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Sort</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="grow" />
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <Skeleton width="100%" height={300} rounded="rounded-2xl" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={UsersIcon}
          title="No activity in this window"
          description="Try widening the window, or pick a different org." />
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Org</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Msgs</th>
                <th className="px-3 py-2 text-right">Deals</th>
                <th className="px-3 py-2 text-right">AI</th>
                <th className="px-3 py-2 text-left">Last active</th>
                <th className="px-3 py-2 text-left">Last {days} days</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={(r.user_id || '') + '-' + (r.organization_id || '')}
                  className="border-t border-slate-800/50 hover:bg-slate-800/20 cursor-pointer"
                  onClick={() => setDrawer(r)}>
                  <td className="px-3 py-2">
                    <div className="text-slate-100 font-medium">{r.full_name || '— no name —'}</div>
                    <div className="text-slate-500 text-[11px]">{r.email}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-[200px]">
                    {r.organization_name || <span className="text-slate-500 italic">platform</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-200 border border-orange-500/30 text-[11px] font-semibold tabular-nums">
                      {Number(r.activity_score || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{Number(r.message_count || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{Number(r.deal_count || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{Number(r.ai_count || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{timeAgo(r.last_active)}</td>
                  <td className="px-3 py-2"><Sparkline buckets={r.daily_buckets || []} max={maxBucket} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserDrawer row={drawer} days={days} onClose={() => setDrawer(null)} />
    </div>
  )
}

function Sparkline({ buckets, max }) {
  if (!buckets.length) return null
  const m = Math.max(1, max || 1)
  const w = 4
  const gap = 1
  const h = 22
  const total = buckets.length * (w + gap) - gap
  return (
    <svg width={total} height={h} className="block" aria-hidden="true">
      {buckets.map((v, i) => {
        const ratio = v / m
        const bh = Math.max(1, Math.round(ratio * h))
        const tone = ratio > 0.66 ? '#fb923c' : ratio > 0.33 ? '#f59e0b' : ratio > 0 ? '#475569' : '#1e293b'
        return (
          <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} fill={tone} rx={1} />
        )
      })}
    </svg>
  )
}

function UserDrawer({ row, days, onClose }) {
  return (
    <Modal open={!!row} onClose={onClose} size="lg"
      title={row ? `${row.full_name || row.email}` : ''}>
      {row && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Kv k="Email" v={row.email || '—'} />
            <Kv k="User id" v={<code className="text-[10px]">{row.user_id}</code>} />
            <Kv k="Organization" v={row.organization_name || <span className="text-slate-500">platform</span>} />
            <Kv k="Last active" v={timeAgo(row.last_active)} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Tile icon={Flame}        tone="orange"  k="Score"    v={Number(row.activity_score || 0).toLocaleString()} />
            <Tile icon={MessageSquare} tone="emerald" k="Messages" v={Number(row.message_count || 0).toLocaleString()} />
            <Tile icon={Briefcase}    tone="indigo"  k="Deals"    v={Number(row.deal_count || 0).toLocaleString()} />
            <Tile icon={Sparkles}     tone="violet"  k="AI calls" v={Number(row.ai_count || 0).toLocaleString()} />
          </div>

          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Activity, last {days} days</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                <SettingsIcon className="w-3 h-3" /> {Number(row.setting_count || 0).toLocaleString()} setting changes
              </span>
            </div>
            <Sparkline buckets={row.daily_buckets || []} max={Math.max(1, ...(row.daily_buckets || [1]))} />
          </div>
        </div>
      )}
    </Modal>
  )
}

function Kv({ k, v }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{k}</div>
      <div className="text-xs text-slate-200">{v}</div>
    </div>
  )
}

function Tile({ icon: Icon, k, v, tone = 'indigo' }) {
  const cls = {
    orange:  'bg-orange-500/10 border-orange-500/30 text-orange-200',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
    indigo:  'bg-indigo-500/10 border-indigo-500/30 text-indigo-200',
    violet:  'bg-violet-500/10 border-violet-500/30 text-violet-200',
  }[tone]
  return (
    <div className={`rounded-lg border ${cls} p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-wider opacity-80">{k}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums">{v}</div>
    </div>
  )
}
