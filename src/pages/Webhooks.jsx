import { useEffect, useMemo, useState } from 'react'
import {
  Webhook, Plus, RefreshCcw, Send, CheckCircle2, XCircle, AlertCircle,
  Clock, Trash2, Edit3, Filter,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Tabs from '../components/ui/Tabs'
import { toast } from '../components/ui/Toast'

function fmt(s) { return s ? new Date(s).toLocaleString() : '—' }
function timeAgo(s) {
  if (!s) return '—'
  const d = new Date(s).getTime()
  const diff = Date.now() - d
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const STATUS_TONE = {
  success:  'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  failed:   'bg-rose-500/15 text-rose-200 border-rose-500/30',
  pending:  'bg-slate-500/15 text-slate-200 border-slate-500/30',
  retrying: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
}
const STATUS_ICON = {
  success:  CheckCircle2,
  failed:   XCircle,
  pending:  Clock,
  retrying: RefreshCcw,
}

export default function Webhooks() {
  const [tab, setTab] = useState('endpoints')
  const [missing, setMissing] = useState(false)

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Webhook className="w-5 h-5 text-indigo-300" />
            Webhooks
          </h1>
          <p className="text-sm text-slate-500">
            Outbound event delivery — endpoints, deliveries, retries. Every retry is audited.
          </p>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 137 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">137_webhook_delivery.sql</code>.
        </Banner>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'endpoints',  label: 'Endpoints'  },
          { id: 'deliveries', label: 'Deliveries' },
        ]}
      />

      {tab === 'endpoints'
        ? <EndpointsTab onMissing={() => setMissing(true)} />
        : <DeliveriesTab onMissing={() => setMissing(true)} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Endpoints tab
// ════════════════════════════════════════════════════════════════

function EndpointsTab({ onMissing }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [composer, setComposer] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [retrying, setRetrying] = useState(null) // endpoint id

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_webhook_endpoints')
    if (error) {
      if (isMissingFunction(error)) onMissing?.()
      else toast.error('Failed to load endpoints', { description: error.message })
    } else {
      setList(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const retryFailed = async (endpointId) => {
    setRetrying(endpointId)
    try {
      const { data, error } = await supabase.rpc('admin_webhook_retry_failed', {
        p_endpoint_id: endpointId,
        p_limit: 500,
      })
      if (error) throw error
      toast.success(`Queued ${data ?? 0} retries`)
      // Fire actual HTTP via edge fn
      await supabase.functions.invoke('admin-webhook-retry', {
        body: { endpoint_id: endpointId, max: 50 },
      })
      refresh()
    } catch (e) {
      toast.error('Retry failed', { description: e.message })
    } finally {
      setRetrying(null)
    }
  }

  const removeEndpoint = async (endpointId) => {
    if (!confirm('Delete this endpoint and ALL its delivery history?')) return
    const { error } = await supabase.rpc('admin_webhook_endpoint_delete', { p_id: endpointId })
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    toast.success('Endpoint deleted')
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button onClick={() => setComposer(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white">
          <Plus className="w-3.5 h-3.5" />
          New endpoint
        </button>
      </div>

      {loading ? (
        <Skeleton width="100%" height={200} rounded="rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={Webhook}
          title="No webhook endpoints yet"
          description="Create one to start receiving event deliveries from the platform." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((e) => (
            <div key={e.id} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider
                      ${e.is_active
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                        : 'bg-slate-700/30 text-slate-400 border-slate-700/40'}`}>
                      {e.is_active ? 'active' : 'paused'}
                    </span>
                    <span className="text-[11px] text-slate-500 truncate">{e.organization_name || '— platform —'}</span>
                  </div>
                  <div className="font-mono text-xs text-slate-100 break-all">{e.url}</div>
                  {e.description && <div className="text-xs text-slate-400 mt-1">{e.description}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditing(e)}
                    title="Edit"
                    className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeEndpoint(e.id)}
                    title="Delete"
                    className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(e.event_filters?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {e.event_filters.map((ev) => (
                    <span key={ev} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
                      {ev}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 gap-2 mt-3 text-[11px]">
                <Stat label="total"   value={e.total_count} />
                <Stat label="success" value={e.success_count} tone="emerald" />
                <Stat label="failed"  value={e.failed_count}  tone="rose" />
                <Stat label="pending" value={e.pending_count} tone="amber" />
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/60">
                <div className="text-[11px] text-slate-500">
                  Last success: {e.last_delivered_at ? timeAgo(e.last_delivered_at) : '—'}
                </div>
                {Number(e.failed_count) > 0 && (
                  <button onClick={() => retryFailed(e.id)} disabled={retrying === e.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-50">
                    <RefreshCcw className={`w-3 h-3 ${retrying === e.id ? 'animate-spin' : ''}`} />
                    Retry {e.failed_count} failed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <EndpointEditor
        open={composer || !!editing}
        endpoint={editing}
        onClose={() => { setComposer(false); setEditing(null) }}
        onSaved={() => { setComposer(false); setEditing(null); refresh() }} />
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }) {
  const toneCls = {
    slate:   'text-slate-200',
    emerald: 'text-emerald-300',
    rose:    'text-rose-300',
    amber:   'text-amber-300',
  }[tone]
  return (
    <div className="rounded-lg bg-slate-950/60 border border-slate-800/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${toneCls}`}>{Number(value || 0).toLocaleString()}</div>
    </div>
  )
}

function EndpointEditor({ open, endpoint, onClose, onSaved }) {
  const [url, setUrl]                 = useState('')
  const [secret, setSecret]           = useState('')
  const [orgId, setOrgId]             = useState('')
  const [description, setDescription] = useState('')
  const [filters, setFilters]         = useState('')
  const [isActive, setIsActive]       = useState(true)
  const [busy, setBusy]               = useState(false)
  const [err, setErr]                 = useState(null)

  useEffect(() => {
    if (!open) return
    if (endpoint) {
      setUrl(endpoint.url || '')
      setSecret('')
      setOrgId(endpoint.organization_id || '')
      setDescription(endpoint.description || '')
      setFilters((endpoint.event_filters || []).join(', '))
      setIsActive(endpoint.is_active ?? true)
    } else {
      setUrl(''); setSecret(''); setOrgId(''); setDescription(''); setFilters(''); setIsActive(true)
    }
    setErr(null)
  }, [open, endpoint])

  const submit = async () => {
    setBusy(true); setErr(null)
    const eventFilters = filters
      .split(',').map((s) => s.trim()).filter(Boolean)
    const payload = {
      p_id: endpoint?.id ?? null,
      p_organization_id: orgId.trim() || null,
      p_url: url.trim(),
      p_secret: secret.trim() || null,
      p_event_filters: eventFilters,
      p_is_active: isActive,
      p_description: description.trim() || null,
    }
    const { error } = await supabase.rpc('admin_webhook_endpoint_upsert', payload)
    setBusy(false)
    if (error) {
      if (isMissingFunction(error)) setErr('Migration 137 not applied yet.')
      else setErr(error.message)
      return
    }
    toast.success(endpoint ? 'Endpoint updated' : 'Endpoint created')
    onSaved?.()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={endpoint ? `Edit endpoint` : 'New endpoint'}
      footer={
        <>
          <button onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
          <button disabled={busy || !url.trim()} onClick={submit}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
            {busy ? 'Saving…' : (endpoint ? 'Save' : 'Create')}
          </button>
        </>
      }>
      <div className="space-y-3">
        {err && <Banner tone="danger">{err}</Banner>}
        <Field label="URL" required>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200" />
        </Field>
        <Field label="Organization id (blank = platform-wide)">
          <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="UUID"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200" />
        </Field>
        <Field label={endpoint ? 'Secret (leave blank to keep current)' : 'HMAC secret (optional)'}>
          <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="signing secret"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200" />
        </Field>
        <Field label="Event filters (comma-separated; empty = all)">
          <input value={filters} onChange={(e) => setFilters(e.target.value)} placeholder="lead.created, deal.closed"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
        </Field>
        <Field label="Description (optional)">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
            className="accent-indigo-500" />
          Active
        </label>
      </div>
    </Modal>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Deliveries tab
// ════════════════════════════════════════════════════════════════

function DeliveriesTab({ onMissing }) {
  const [list, setList] = useState([])
  const [endpoints, setEndpoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filterEndpoint, setFilterEndpoint] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [drawer, setDrawer] = useState(null)

  const refresh = async () => {
    setLoading(true)
    const [dRes, eRes] = await Promise.all([
      supabase.rpc('admin_webhook_deliveries', {
        p_endpoint_id: filterEndpoint || null,
        p_status: filterStatus || null,
        p_event_type: filterEvent || null,
        p_limit: 200,
      }),
      supabase.rpc('admin_webhook_endpoints'),
    ])
    if (dRes.error) {
      if (isMissingFunction(dRes.error)) onMissing?.()
      else toast.error('Failed to load deliveries', { description: dRes.error.message })
    } else {
      setList(dRes.data || [])
    }
    if (!eRes.error) setEndpoints(eRes.data || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [filterEndpoint, filterStatus, filterEvent])

  const retryOne = async (id) => {
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('admin_webhook_retry_delivery', { p_delivery_id: id })
      if (error) throw error
      // Fire it
      await supabase.functions.invoke('admin-webhook-retry', { body: { delivery_id: data } })
      toast.success('Retry sent')
      refresh()
    } catch (e) {
      toast.error('Retry failed', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  const retryAllFailed = async () => {
    if (!confirm('Retry every failed delivery (filtered set)?')) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('admin_webhook_retry_failed', {
        p_endpoint_id: filterEndpoint || null,
        p_limit: 500,
      })
      if (error) throw error
      toast.success(`Queued ${data ?? 0} retries`)
      // Best-effort: fire whatever endpoint is filtered (if specified).
      if (filterEndpoint) {
        await supabase.functions.invoke('admin-webhook-retry', {
          body: { endpoint_id: filterEndpoint, max: 50 },
        })
      }
      refresh()
    } catch (e) {
      toast.error('Bulk retry failed', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  const eventTypes = useMemo(() => {
    const set = new Set()
    list.forEach((d) => set.add(d.event_type))
    return Array.from(set).sort()
  }, [list])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Endpoint</label>
          <select value={filterEndpoint} onChange={(e) => setFilterEndpoint(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 min-w-[260px]">
            <option value="">All endpoints</option>
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {(e.organization_name || 'platform') + ' — ' + e.url.slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
            <option value="">All</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="pending">pending</option>
            <option value="retrying">retrying</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Event</label>
          <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 min-w-[180px]">
            <option value="">All events</option>
            {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="grow" />
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button onClick={retryAllFailed} disabled={busy || loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 disabled:opacity-50">
          <Send className="w-3.5 h-3.5" /> Retry all failed
        </button>
      </div>

      {loading ? (
        <Skeleton width="100%" height={300} rounded="rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={Filter}
          title="No deliveries match"
          description="Try clearing the filters." />
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Event</th>
                <th className="px-3 py-2 text-left">Endpoint</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Code</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2 text-right">Attempt</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const Icon = STATUS_ICON[d.status] || AlertCircle
                return (
                  <tr key={d.id}
                    className="border-t border-slate-800/50 hover:bg-slate-800/20 cursor-pointer"
                    onClick={() => setDrawer(d)}>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{timeAgo(d.created_at)}</td>
                    <td className="px-3 py-2 text-slate-200 font-mono">{d.event_type}</td>
                    <td className="px-3 py-2 text-slate-300 truncate max-w-[280px]">{d.endpoint_url}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${STATUS_TONE[d.status] || ''}`}>
                        <Icon className={`w-3 h-3 ${d.status === 'retrying' ? 'animate-spin' : ''}`} />
                        {d.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{d.status_code ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{d.duration_ms != null ? `${d.duration_ms}ms` : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{d.attempt}</td>
                    <td className="px-3 py-2 text-right">
                      {(d.status === 'failed' || d.status === 'pending') && (
                        <button onClick={(e) => { e.stopPropagation(); retryOne(d.id) }}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-50">
                          <RefreshCcw className="w-3 h-3" /> Retry
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

      <DeliveryDrawer delivery={drawer} onClose={() => setDrawer(null)} />
    </div>
  )
}

function DeliveryDrawer({ delivery, onClose }) {
  return (
    <Modal open={!!delivery} onClose={onClose} size="lg"
      title={delivery ? `Delivery — ${delivery.event_type}` : ''}>
      {delivery && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Kv k="Status"   v={delivery.status} />
            <Kv k="Code"     v={delivery.status_code ?? '—'} />
            <Kv k="Duration" v={delivery.duration_ms != null ? `${delivery.duration_ms}ms` : '—'} />
            <Kv k="Attempt"  v={delivery.attempt} />
            <Kv k="Created"  v={fmt(delivery.created_at)} />
            <Kv k="Delivered" v={fmt(delivery.delivered_at)} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Endpoint URL</div>
            <div className="font-mono text-xs text-slate-200 break-all">{delivery.endpoint_url}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Payload</div>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-300 overflow-auto max-h-72">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>
          {delivery.response_body && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Response</div>
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-300 overflow-auto max-h-44">
                {delivery.response_body}
              </pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Kv({ k, v }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{k}</div>
      <div className="text-xs text-slate-200">{v ?? '—'}</div>
    </div>
  )
}
