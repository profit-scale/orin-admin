import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Plus, Send, RefreshCcw, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'

const IMPACT_OPTS = ['none', 'minor', 'major', 'critical']
const STATUS_OPTS = ['investigating', 'identified', 'monitoring', 'resolved']
const COMPONENT_OPTS = [
  'API', 'Auth', 'Database', 'Edge functions', 'AI', 'Storage',
  'Realtime', 'Webhooks', 'Email', 'WhatsApp', 'GHL sync',
]

const IMPACT_TONE = {
  none:     'bg-slate-500/15 text-slate-300 border-slate-500/30',
  minor:    'bg-sky-500/15 text-sky-200 border-sky-500/30',
  major:    'bg-amber-500/15 text-amber-200 border-amber-500/30',
  critical: 'bg-rose-500/15 text-rose-200 border-rose-500/30',
}

function fmt(s) { return s ? new Date(s).toLocaleString() : '—' }

export default function Incidents() {
  const [list, setList]     = useState([])
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [composer, setComposer] = useState(false)
  const [updateFor, setUpdateFor] = useState(null)

  const refresh = async () => {
    setLoading(true)
    const [iRes, uRes] = await Promise.all([
      supabase.from('platform_incidents').select('*').order('started_at', { ascending: false }).limit(50),
      supabase.from('platform_incident_updates').select('*').order('posted_at', { ascending: false }).limit(500),
    ])
    if (iRes.error) {
      if (iRes.error.code === '42P01' || /relation .* does not exist/i.test(iRes.error.message || '')) {
        setMissing(true)
      }
    } else {
      setList(iRes.data || [])
    }
    if (!uRes.error) setUpdates(uRes.data || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const updatesByIncident = useMemo(() => {
    const m = new Map()
    for (const u of updates) {
      if (!m.has(u.incident_id)) m.set(u.incident_id, [])
      m.get(u.incident_id).push(u)
    }
    return m
  }, [updates])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-300" />
            Incidents
          </h1>
          <p className="text-sm text-slate-500">Public-facing incidents shown on /status. Every action is audited.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setComposer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white">
            <Plus className="w-3.5 h-3.5" />
            New incident
          </button>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 134 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">134_status_page.sql</code>.
        </Banner>
      )}

      {loading ? (
        <Skeleton width="100%" height={200} rounded="rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={Megaphone}
          title="No incidents"
          description="Create one when something breaks. It will show on the public /status page immediately." />
      ) : (
        <div className="space-y-3">
          {list.map((inc) => (
            <IncidentCard key={inc.id} incident={inc}
              updates={updatesByIncident.get(inc.id) || []}
              onPostUpdate={() => setUpdateFor(inc)} />
          ))}
        </div>
      )}

      <NewIncidentModal open={composer}
        onClose={() => setComposer(false)}
        onCreated={refresh} />
      <PostUpdateModal incident={updateFor}
        onClose={() => setUpdateFor(null)}
        onPosted={refresh} />
    </div>
  )
}

function IncidentCard({ incident, updates, onPostUpdate }) {
  const tone = IMPACT_TONE[incident.impact] || IMPACT_TONE.minor
  const Icon = incident.status === 'resolved' ? CheckCircle2 : (incident.impact === 'critical' ? AlertCircle : AlertTriangle)
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${tone}`}>
              {incident.impact}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400">{incident.status}</span>
            <Icon className={`w-4 h-4 ${incident.status === 'resolved' ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
          <h3 className="text-base font-semibold text-slate-100">{incident.title}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {(incident.affected_components || []).map((c, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
                {c}
              </span>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Started {fmt(incident.started_at)}{incident.resolved_at ? ` · resolved ${fmt(incident.resolved_at)}` : ''}
          </div>
        </div>
        {incident.status !== 'resolved' && (
          <button onClick={onPostUpdate}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-indigo-500 hover:bg-indigo-400 text-white">
            <Send className="w-3 h-3" /> Post update
          </button>
        )}
      </div>
      {updates.length > 0 && (
        <ul className="border-t border-slate-800/60 pt-3 space-y-2">
          {updates.map((u) => (
            <li key={u.id} className="text-xs">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                {u.status} · {fmt(u.posted_at)}
              </div>
              <div className="text-slate-300 leading-relaxed">{u.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewIncidentModal({ open, onClose, onCreated }) {
  const [title, setTitle]     = useState('')
  const [impact, setImpact]   = useState('minor')
  const [components, setComponents] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState(null)

  useEffect(() => {
    if (open) { setTitle(''); setImpact('minor'); setComponents([]); setMessage(''); setErr(null) }
  }, [open])

  const submit = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('admin_incident_create', {
      p_title: title.trim(),
      p_impact: impact,
      p_components: components,
      p_message: message.trim() || null,
    })
    setBusy(false)
    if (error) {
      if (isMissingFunction(error)) setErr('Migration 134 not applied yet.')
      else setErr(error.message)
      return
    }
    onCreated?.()
    onClose?.()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="New incident"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
          <button disabled={busy || !title.trim()} onClick={submit}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }>
      <div className="space-y-3">
        {err && <Banner tone="danger">{err}</Banner>}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
            placeholder="e.g. WhatsApp outbound delays" />
        </div>
        <div className="flex gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Impact</label>
            <select value={impact} onChange={(e) => setImpact(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
              {IMPACT_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Affected components</label>
            <div className="flex flex-wrap gap-1">
              {COMPONENT_OPTS.map((c) => {
                const active = components.includes(c)
                return (
                  <button key={c} type="button"
                    onClick={() => setComponents(active ? components.filter((x) => x !== c) : [...components, c])}
                    className={`px-2 py-1 text-[10px] rounded border ${active ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">First update (optional)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
            placeholder="What we know so far…" />
        </div>
      </div>
    </Modal>
  )
}

function PostUpdateModal({ incident, onClose, onPosted }) {
  const [status, setStatus] = useState('investigating')
  const [message, setMessage] = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState(null)

  useEffect(() => {
    if (incident) { setStatus(incident.status); setMessage(''); setErr(null) }
  }, [incident])

  const submit = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('admin_incident_post_update', {
      p_incident_id: incident.id,
      p_status: status,
      p_message: message.trim(),
    })
    setBusy(false)
    if (error) {
      if (isMissingFunction(error)) setErr('Migration 134 not applied yet.')
      else setErr(error.message)
      return
    }
    onPosted?.()
    onClose?.()
  }

  return (
    <Modal open={!!incident} onClose={onClose} size="lg"
      title={incident ? `Update — ${incident.title}` : 'Update'}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
          <button disabled={busy || !message.trim()} onClick={submit}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
            {busy ? 'Posting…' : 'Post update'}
          </button>
        </>
      }>
      <div className="space-y-3">
        {err && <Banner tone="danger">{err}</Banner>}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">New status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
            {STATUS_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
            placeholder="What's the latest?" />
        </div>
      </div>
    </Modal>
  )
}
