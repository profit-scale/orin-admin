import { useEffect, useMemo, useState } from 'react'
import {
  KeyRound, Search, RefreshCcw, ShieldOff, Activity, AlertCircle,
  Trash2, Eye, ExternalLink, Building2, Flame,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Tabs from '../components/ui/Tabs'
import { toast } from '../components/ui/Toast'

function fmt(s)  { return s ? new Date(s).toLocaleString() : '—' }
function timeAgo(s) {
  if (!s) return 'Never'
  const d = new Date(s).getTime()
  const diff = Date.now() - d
  if (diff < 60_000)     return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function ApiKeys() {
  const [tab, setTab] = useState('keys')
  const [missing, setMissing] = useState(false)

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-300" />
            Customer API
          </h1>
          <p className="text-sm text-slate-500">
            Every key across every org. Usage charts, top consumers, force-revoke.
          </p>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 144 / 146 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">144_api_keys.sql</code> and <code className="px-1 py-0.5 bg-black/30 rounded">146_api_admin_rpcs.sql</code> before this page works.
        </Banner>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'keys',     label: 'API keys'      },
          { id: 'usage',    label: 'Usage'         },
          { id: 'top',      label: 'Top consumers' },
          { id: 'requests', label: 'Recent requests' },
        ]}
      />

      {tab === 'keys'     && <KeysTab     onMissing={() => setMissing(true)} />}
      {tab === 'usage'    && <UsageTab    onMissing={() => setMissing(true)} />}
      {tab === 'top'      && <TopTab      onMissing={() => setMissing(true)} />}
      {tab === 'requests' && <RequestsTab onMissing={() => setMissing(true)} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Keys tab
// ════════════════════════════════════════════════════════════════

function KeysTab({ onMissing }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState(null)
  const [confirmRevokeOrg, setConfirmRevokeOrg] = useState(null)

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_api_keys_list', {
      p_search: search || null,
      p_org_id: null,
      p_status: statusFilter || null,
      p_limit:  500,
    })
    if (error) {
      if (isMissingFunction(error)) onMissing?.()
      else toast.error('Failed to load keys', { description: error.message })
    } else {
      setList(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const handleRevoke = async (id, reason) => {
    const { error } = await supabase.rpc('admin_api_keys_revoke', { p_id: id, p_reason: reason || null })
    if (error) { toast.error('Revoke failed', { description: error.message }); return }
    toast.success('Key revoked')
    setConfirmRevoke(null)
    refresh()
  }

  const handleRevokeForOrg = async (orgId, reason) => {
    const { data, error } = await supabase.rpc('admin_api_keys_revoke_for_org', { p_org_id: orgId, p_reason: reason || null })
    if (error) { toast.error('Revoke failed', { description: error.message }); return }
    toast.success(`Revoked ${data ?? 0} keys for this org`)
    setConfirmRevokeOrg(null)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by key name, prefix, org…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') refresh() }}
            className="w-full h-9 pl-9 pr-3 rounded-md bg-slate-900/50 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setTimeout(refresh, 0) }}
          className="h-9 px-2 rounded-md bg-slate-900/50 border border-slate-800 text-sm text-slate-100"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-800 hover:bg-slate-800/50 text-sm text-slate-200"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys yet"
          description="When customers create keys from Settings → API, they'll appear here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 bg-slate-900/40">
                <th className="px-3 py-2 font-medium">Org</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Prefix</th>
                <th className="px-3 py-2 font-medium">Scopes</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last used</th>
                <th className="px-3 py-2 font-medium">30d req / err</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((k) => {
                const expired = k.expires_at && new Date(k.expires_at) <= new Date()
                const status = k.revoked_at ? 'revoked' : (expired ? 'expired' : 'active')
                return (
                  <tr key={k.id} className="border-t border-slate-800 hover:bg-slate-900/30">
                    <td className="px-3 py-2 text-slate-200">{k.organization_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-100 font-medium">{k.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{k.prefix}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {(k.scopes || []).slice(0, 3).map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{s}</span>
                        ))}
                        {(k.scopes || []).length > 3 && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">+{k.scopes.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {status === 'active'  && <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">Active</span>}
                      {status === 'revoked' && <span className="px-2 py-0.5 rounded text-xs bg-rose-500/15 text-rose-200 border border-rose-500/30">Revoked</span>}
                      {status === 'expired' && <span className="px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-200 border border-amber-500/30">Expired</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{timeAgo(k.last_used_at)}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {Number(k.request_count_30d || 0).toLocaleString()}
                      {' / '}
                      <span className={Number(k.error_count_30d) > 0 ? 'text-rose-300' : 'text-slate-400'}>
                        {Number(k.error_count_30d || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!k.revoked_at && (
                        <button
                          onClick={() => setConfirmRevoke(k)}
                          className="inline-flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200"
                        >
                          <ShieldOff className="h-3 w-3" /> Revoke
                        </button>
                      )}
                      {k.organization_id && (
                        <button
                          onClick={() => setConfirmRevokeOrg({ id: k.organization_id, name: k.organization_name })}
                          className="ml-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                          title="Revoke ALL keys for this org"
                        >
                          <Trash2 className="h-3 w-3" /> Revoke all
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

      {/* Confirm revoke single */}
      <Modal open={!!confirmRevoke} onClose={() => setConfirmRevoke(null)} title="Revoke this API key?">
        <RevokeForm
          target={confirmRevoke?.name}
          onCancel={() => setConfirmRevoke(null)}
          onConfirm={(reason) => handleRevoke(confirmRevoke.id, reason)}
        />
      </Modal>

      {/* Confirm revoke org-wide */}
      <Modal open={!!confirmRevokeOrg} onClose={() => setConfirmRevokeOrg(null)} title="Revoke ALL keys for this org?">
        <RevokeForm
          target={`every active API key for ${confirmRevokeOrg?.name}`}
          danger
          onCancel={() => setConfirmRevokeOrg(null)}
          onConfirm={(reason) => handleRevokeForOrg(confirmRevokeOrg.id, reason)}
        />
      </Modal>
    </div>
  )
}

function RevokeForm({ target, danger = false, onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        You&apos;re about to revoke <strong className="text-slate-100">{target}</strong>. Any
        integrations using {danger ? 'these keys' : 'this key'} will stop working immediately.
        This is audited.
      </p>
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional but recommended)"
        className="w-full px-3 py-2 rounded-md bg-slate-900/50 border border-slate-800 text-sm text-slate-100"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:text-slate-200">Cancel</button>
        <button
          onClick={() => onConfirm(reason)}
          className={`px-3 py-1.5 rounded-md text-sm text-white ${danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-rose-700 hover:bg-rose-600'}`}
        >
          Revoke
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Usage tab
// ════════════════════════════════════════════════════════════════

function UsageTab({ onMissing }) {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.rpc('admin_api_usage_summary', { p_days: 30 })
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) onMissing?.()
        else toast.error('Failed to load usage', { description: error.message })
        setDays([])
      } else {
        setDays(data || [])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const totals = useMemo(() => {
    let req = 0, err = 0, lat = 0
    for (const d of days) {
      req += Number(d.request_count || 0)
      err += Number(d.error_count   || 0)
      lat += Number(d.avg_duration_ms || 0)
    }
    return { req, err, lat: days.length > 0 ? Math.round(lat / days.length) : 0 }
  }, [days])

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Requests · 30d" value={totals.req.toLocaleString()} />
        <Stat label="Errors · 30d" value={`${totals.err.toLocaleString()} (${totals.req ? Math.round((totals.err * 1000) / totals.req) / 10 : 0}%)`} />
        <Stat label="Avg latency" value={`${totals.lat} ms`} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500 bg-slate-900/40">
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 font-medium">Requests</th>
              <th className="px-3 py-2 font-medium">Errors</th>
              <th className="px-3 py-2 font-medium">Unique keys</th>
              <th className="px-3 py-2 font-medium">Avg latency</th>
            </tr>
          </thead>
          <tbody>
            {days.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No requests in the last 30 days.</td></tr>
            ) : days.map((d) => (
              <tr key={d.day} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-300">{d.day}</td>
                <td className="px-3 py-2 text-slate-100">{Number(d.request_count).toLocaleString()}</td>
                <td className="px-3 py-2 text-slate-300">{Number(d.error_count).toLocaleString()}</td>
                <td className="px-3 py-2 text-slate-300">{Number(d.unique_keys).toLocaleString()}</td>
                <td className="px-3 py-2 text-slate-300">{Number(d.avg_duration_ms || 0).toFixed(0)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-100 mt-1">{value}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Top consumers tab
// ════════════════════════════════════════════════════════════════

function TopTab({ onMissing }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.rpc('admin_api_top_consumers', { p_days: 7, p_limit: 25 })
      if (cancelled) return
      if (error) {
        if (isMissingFunction(error)) onMissing?.()
        else toast.error('Failed', { description: error.message })
      } else {
        setRows(data || [])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 bg-slate-900/40">
            <th className="px-3 py-2 font-medium">Org</th>
            <th className="px-3 py-2 font-medium">Requests · 7d</th>
            <th className="px-3 py-2 font-medium">Rate-limited</th>
            <th className="px-3 py-2 font-medium">Avg latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No customers using the API yet.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.organization_id} className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-100 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-500" />
                {r.organization_name || '—'}
              </td>
              <td className="px-3 py-2 text-slate-200">{Number(r.request_count).toLocaleString()}</td>
              <td className="px-3 py-2">
                {Number(r.rate_limited_count) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Flame className="h-3.5 w-3.5" />
                    {Number(r.rate_limited_count).toLocaleString()}
                  </span>
                ) : <span className="text-slate-500">0</span>}
              </td>
              <td className="px-3 py-2 text-slate-300">{Number(r.avg_duration_ms || 0).toFixed(0)} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Recent requests tab
// ════════════════════════════════════════════════════════════════

function RequestsTab({ onMissing }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_api_recent_requests', { p_limit: 200 })
    if (error) {
      if (isMissingFunction(error)) onMissing?.()
      else toast.error('Failed', { description: error.message })
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={refresh} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-800 hover:bg-slate-800/50 text-sm text-slate-200">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500 bg-slate-900/40">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Path</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Latency</th>
              <th className="px-3 py-2 font-medium">Request ID</th>
              <th className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No recent requests.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-400">{timeAgo(r.created_at)}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  <span className={`px-1.5 py-0.5 rounded ${methodColor(r.method)}`}>{r.method}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-200">{r.path}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${statusColor(r.status_code)}`}>{r.status_code}</span>
                </td>
                <td className="px-3 py-2 text-slate-300">{r.duration_ms} ms</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.request_id}</td>
                <td className="px-3 py-2 text-slate-400">{r.ip_address || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function methodColor(m) {
  switch (m) {
    case 'GET':    return 'bg-emerald-500/15 text-emerald-200'
    case 'POST':   return 'bg-indigo-500/15 text-indigo-200'
    case 'PATCH':
    case 'PUT':    return 'bg-amber-500/15 text-amber-200'
    case 'DELETE': return 'bg-rose-500/15 text-rose-200'
    default:       return 'bg-slate-500/15 text-slate-200'
  }
}
function statusColor(c) {
  if (c >= 500) return 'bg-rose-500/15 text-rose-200'
  if (c >= 400) return 'bg-amber-500/15 text-amber-200'
  if (c >= 300) return 'bg-blue-500/15 text-blue-200'
  return 'bg-emerald-500/15 text-emerald-200'
}
