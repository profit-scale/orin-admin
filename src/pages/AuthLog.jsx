import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Filter, AlertTriangle } from 'lucide-react'
import { supabase } from '../services/supabase'
import Banner from '../components/ui/Banner'
import EmptyState from '../components/ui/EmptyState'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'
import ErrorCard from '../components/ui/ErrorCard'

const EVENTS = [
  { id: '',                         label: 'All events' },
  { id: 'signin_success',           label: 'signin_success' },
  { id: 'signin_fail',              label: 'signin_fail' },
  { id: 'signup',                   label: 'signup' },
  { id: 'password_reset_request',   label: 'password_reset_request' },
  { id: 'password_reset_complete',  label: 'password_reset_complete' },
  { id: 'mfa_challenge',            label: 'mfa_challenge' },
  { id: 'signout',                  label: 'signout' },
  { id: 'session_refresh',          label: 'session_refresh' },
  { id: 'impersonation_signin',     label: 'impersonation_signin' },
]

const SINCE_OPTIONS = [
  { id: '',     label: 'All time' },
  { id: '1h',  label: 'Last hour' },
  { id: '24h', label: 'Last 24h' },
  { id: '7d',  label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
]

function sinceToDate(id) {
  if (!id) return null
  const m = id.match(/^(\d+)([hd])$/); if (!m) return null
  const n = Number(m[1]) || 0
  const unit = m[2] === 'h' ? 3600_000 : 86_400_000
  return new Date(Date.now() - n * unit).toISOString()
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

function EventPill({ type }) {
  const tone =
    type === 'signin_success'  ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' :
    type === 'signin_fail'     ? 'bg-rose-500/15 text-rose-200 border-rose-500/30' :
    type === 'signup'          ? 'bg-violet-500/15 text-violet-200 border-violet-500/30' :
    type === 'impersonation_signin' ? 'bg-amber-500/15 text-amber-200 border-amber-500/30' :
    /password/.test(type)      ? 'bg-sky-500/15 text-sky-200 border-sky-500/30' :
                                 'bg-slate-700/30 text-slate-200 border-slate-700/60'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-mono ${tone}`}>
      {type}
    </span>
  )
}

export default function AuthLog() {
  const [eventFilter, setEventFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('24h')
  const [emailFilter, setEmailFilter] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('admin_auth_events_list', {
        p_limit: 500,
        p_offset: 0,
        p_event_type: eventFilter || null,
        p_email: emailFilter.trim() || null,
        p_org_id: null,
        p_since: sinceToDate(sinceFilter),
      })
      if (err) {
        if (err.code === 'PGRST202' || err.code === '42883' || /function .* does not exist/i.test(err.message || '')) {
          setMissing(true)
          setRows([])
          return
        }
        throw err
      }
      setRows(data || [])
      setTotal(data?.[0]?.total_count || 0)
    } catch (e) {
      setError(e?.message || 'Failed to load auth events')
    } finally {
      setLoading(false)
    }
  }, [eventFilter, emailFilter, sinceFilter])

  useEffect(() => { load() }, [load])

  // Spike detection — count signin_fail per email in window.
  const failSpikes = useMemo(() => {
    const fails = (rows || []).filter((r) => r.event_type === 'signin_fail')
    const byEmail = new Map()
    for (const f of fails) {
      const key = f.email_attempted || 'unknown'
      byEmail.set(key, (byEmail.get(key) || 0) + 1)
    }
    return Array.from(byEmail.entries())
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
  }, [rows])

  return (
    <div className="space-y-6 max-w-[1300px]">
      <PageTitle title="Auth log" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-indigo-300" aria-hidden="true" />
            Auth events
          </h1>
          <p className="text-sm text-slate-500">
            Best-effort auth telemetry — signins, signups, password resets, MFA challenges. Helpful for spotting credential-stuffing.
          </p>
        </div>
        <RefreshButton onClick={load} loading={loading} label="Refresh auth events" />
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 116 not applied">
          The <code className="px-1 bg-black/30 rounded">auth_events</code> table is missing.
          Apply migration 116 to enable.
        </Banner>
      )}

      {failSpikes.length > 0 && (
        <Banner tone="warning" title="Failed-signin spikes in this window">
          <ul className="space-y-1">
            {failSpikes.map(([email, n]) => (
              <li key={email}>
                <code className="text-amber-100 font-mono">{email}</code> · <strong>{n}</strong> failed attempts
              </li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500" />
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
            {EVENTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select value={sinceFilter} onChange={(e) => setSinceFilter(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none">
            {SINCE_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <input
            type="search"
            data-primary-search
            aria-label="Filter auth events by email"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            placeholder="filter by email"
            className="px-2.5 py-1.5 w-64 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-[11px] text-slate-500 ml-auto tabular-nums">
            {loading ? 'Loading…' : `${rows.length} of ${total || rows.length}`}
          </span>
        </div>
      </div>

      {error && <ErrorCard title="Couldn't load auth events" error={error} onRetry={load} />}

      {!loading && rows.length === 0 && !error ? (
        <EmptyState icon={ShieldAlert} title="No auth events" description="Either no events fired in this window, or the record-auth-event hook hasn't been wired in the main app yet." />
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
          <div className="max-h-[640px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-medium px-4 py-3">When</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Event</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Email</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">Org</th>
                  <th scope="col" className="text-left font-medium px-3 py-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap" title={r.created_at}>
                      {formatRelative(r.created_at)}
                    </td>
                    <td className="px-3 py-2.5"><EventPill type={r.event_type} /></td>
                    <td className="px-3 py-2.5 text-slate-300 truncate max-w-[260px]">{r.email_attempted || r.user_email || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-300 truncate max-w-[200px]">{r.organization_name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">{r.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
