import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Megaphone,
  Plus,
  Archive,
  AlertTriangle,
  Info,
  Zap,
  RefreshCw,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import Modal from '../components/ui/Modal'
import Banner from '../components/ui/Banner'
import EmptyState from '../components/ui/EmptyState'

const LEVELS = [
  { id: 'info',     label: 'Info',     tone: 'bg-sky-500/15 border-sky-500/30 text-sky-200',         Icon: Info },
  { id: 'warning',  label: 'Warning',  tone: 'bg-amber-500/15 border-amber-500/30 text-amber-200',   Icon: AlertTriangle },
  { id: 'critical', label: 'Critical', tone: 'bg-rose-500/15 border-rose-500/30 text-rose-200',      Icon: Zap },
]

function levelMeta(level) {
  return LEVELS.find((l) => l.id === level) || LEVELS[0]
}

function formatDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString() } catch { return s }
}

export default function Announcements() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('admin_announcements_list')
      if (err) {
        if (err.code === 'PGRST202' || err.code === '42883' || /function .* does not exist/i.test(err.message || '')) {
          setMissing(true)
          setRows([])
          return
        }
        throw err
      }
      setRows(data || [])
    } catch (e) {
      setError(e?.message || 'Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const archive = useCallback(async (id) => {
    if (!window.confirm('Archive this announcement? It will stop showing in customer apps.')) return
    try {
      await supabase.rpc('admin_archive_announcement', { p_id: id })
      load()
    } catch (e) {
      alert(e?.message || 'Failed to archive')
    }
  }, [load])

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Megaphone className="w-6 h-6 text-indigo-300" />
            Announcements
          </h1>
          <p className="text-sm text-slate-500">
            Cross-org banners shown inside customer apps. Target everyone or specific orgs; schedule a window; allow dismissal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition"
          >
            <Plus className="w-3.5 h-3.5" />
            New announcement
          </button>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 117 not applied">
          The <code className="px-1 bg-black/30 rounded">platform_announcements</code> table is missing.
          Apply migration 117 to enable.
        </Banner>
      )}

      {error && <Banner tone="danger" title="Couldn't load">{error}</Banner>}

      {loading ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 px-4 py-12 text-center text-slate-500 text-sm">
          Loading…
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Click 'New announcement' to broadcast a banner across customer apps."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const meta = levelMeta(r.level)
            const I = meta.Icon
            return (
              <div
                key={r.id}
                className={`rounded-2xl border ${meta.tone} px-5 py-4 ${r.archived_at ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <I className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-slate-100">{r.title}</h3>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-current/30 bg-black/20">
                        {r.level}
                      </span>
                      {r.is_active ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
                          live
                        </span>
                      ) : r.archived_at ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-slate-600/60 bg-slate-700/40 text-slate-300">
                          archived
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-slate-600/60 bg-slate-700/40 text-slate-300">
                          inactive
                        </span>
                      )}
                      {r.dismissible ? (
                        <span className="text-[10px] text-slate-400">dismissible</span>
                      ) : (
                        <span className="text-[10px] text-rose-300">non-dismissible</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{r.body}</p>
                    {(r.cta_label || r.cta_url) && (
                      <div className="mt-2 text-[11px] text-slate-400">
                        CTA: <span className="text-slate-200">{r.cta_label || '(no label)'}</span>
                        {r.cta_url && <> → <code className="text-slate-300 font-mono">{r.cta_url}</code></>}
                      </div>
                    )}
                    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-slate-400 mt-3">
                      <div>
                        <dt className="text-slate-500 uppercase tracking-wider text-[9px]">Targets</dt>
                        <dd>{r.targets?.all ? 'All orgs' : `${(r.targets?.org_ids || []).length} specific orgs`}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 uppercase tracking-wider text-[9px]">Window</dt>
                        <dd>{formatDate(r.starts_at)} → {formatDate(r.ends_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 uppercase tracking-wider text-[9px]">Dismissed</dt>
                        <dd>{r.dismissal_count} {r.dismissal_count === 1 ? 'user' : 'users'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 uppercase tracking-wider text-[9px]">Created</dt>
                        <dd>{formatDate(r.created_at)} {r.created_by_email && <span className="text-slate-500">· by {r.created_by_email}</span>}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!r.archived_at && (
                      <button
                        onClick={() => archive(r.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"
                      >
                        <Archive className="w-3 h-3" />
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateAnnouncementModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => { setCreating(false); load() }}
      />
    </div>
  )
}

function CreateAnnouncementModal({ open, onClose, onCreated }) {
  const [level, setLevel] = useState('info')
  const [title, setTitle] = useState('')
  const [body, setBody]   = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl,   setCtaUrl] = useState('')
  const [targetMode, setTargetMode] = useState('all') // 'all' | 'specific'
  const [orgList, setOrgList] = useState([])
  const [orgSearch, setOrgSearch] = useState('')
  const [allOrgs, setAllOrgs] = useState([])
  const [endsAt, setEndsAt] = useState('')
  const [dismissible, setDismissible] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Reset on open and load orgs.
  useEffect(() => {
    if (!open) return
    setLevel('info')
    setTitle('')
    setBody('')
    setCtaLabel('')
    setCtaUrl('')
    setTargetMode('all')
    setOrgList([])
    setOrgSearch('')
    setEndsAt('')
    setDismissible(true)
    setError(null)
    ;(async () => {
      const { data } = await supabase.rpc('admin_orgs_list', { p_limit: 200, p_offset: 0, p_search: null, p_sort: 'created_at_desc' })
      setAllOrgs(data || [])
    })()
  }, [open])

  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase()
    if (!q) return allOrgs.slice(0, 50)
    return allOrgs.filter((o) => (o.name || '').toLowerCase().includes(q) || (o.slug || '').toLowerCase().includes(q)).slice(0, 50)
  }, [allOrgs, orgSearch])

  function toggleOrg(id) {
    setOrgList((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const targets = targetMode === 'all'
        ? { all: true }
        : { all: false, org_ids: orgList }
      const { data, error: err } = await supabase.rpc('admin_create_announcement', {
        p_level: level,
        p_title: title.trim(),
        p_body: body.trim(),
        p_cta_label: ctaLabel.trim() || null,
        p_cta_url: ctaUrl.trim() || null,
        p_targets: targets,
        p_starts_at: new Date().toISOString(),
        p_ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        p_dismissible: dismissible,
      })
      if (err) throw err
      onCreated?.(data)
    } catch (e) {
      setError(e?.message || 'Failed to create')
    } finally {
      setSubmitting(false)
    }
  }

  const valid = title.trim() && body.trim() && (targetMode === 'all' || orgList.length > 0)

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose?.()}
      title="New announcement"
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!valid || submitting}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none">
              {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Ends at (optional)</span>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none" />
          </label>
        </div>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1000} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">CTA label (optional)</span>
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">CTA URL (optional)</span>
            <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none" />
          </label>
        </div>
        <div className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Targets</span>
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={() => setTargetMode('all')} className={`px-3 py-1 text-xs rounded-full border transition ${targetMode === 'all' ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'}`}>All orgs</button>
            <button type="button" onClick={() => setTargetMode('specific')} className={`px-3 py-1 text-xs rounded-full border transition ${targetMode === 'specific' ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'}`}>Specific orgs</button>
          </div>
          {targetMode === 'specific' && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 max-h-48 overflow-y-auto">
              <input value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)} placeholder="Filter orgs…" className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-100 mb-2" />
              {filteredOrgs.length === 0 ? (
                <p className="text-xs text-slate-500 px-2 py-3">No orgs match.</p>
              ) : filteredOrgs.map((o) => (
                <label key={o.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/40 cursor-pointer text-xs text-slate-200">
                  <input type="checkbox" checked={orgList.includes(o.id)} onChange={() => toggleOrg(o.id)} />
                  <span className="font-medium">{o.name || o.slug}</span>
                  <span className="text-slate-500 font-mono ml-auto">{o.slug}</span>
                </label>
              ))}
              <p className="text-[10px] text-slate-500 mt-1 px-2">{orgList.length} selected</p>
            </div>
          )}
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={dismissible} onChange={(e) => setDismissible(e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-950" />
          <span className="text-sm text-slate-200">Allow customers to dismiss</span>
        </label>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
        )}
      </div>
    </Modal>
  )
}
