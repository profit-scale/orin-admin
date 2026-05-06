import { useEffect, useMemo, useState } from 'react'
import {
  Store, Plus, RefreshCcw, ToggleLeft, ToggleRight,
  Mail, FileText, Calendar, BookOpen, Sparkles, LayoutGrid,
  Edit3, Trash2, Eye, Users,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'

const KIND_META = {
  email:           { label: 'Email',          icon: Mail,        tone: 'sky' },
  contract:        { label: 'Contract',       icon: FileText,    tone: 'amber' },
  booking_page:    { label: 'Booking page',   icon: Calendar,    tone: 'emerald' },
  reach_kb:        { label: 'Reach KB',       icon: BookOpen,    tone: 'violet' },
  ai_prompt:       { label: 'AI prompt',      icon: Sparkles,    tone: 'indigo' },
  dashboard_layout:{ label: 'Dashboard',      icon: LayoutGrid,  tone: 'rose' },
}
const KINDS = Object.keys(KIND_META)

const TONE_CLS = {
  sky:     'border-sky-500/30 bg-sky-500/10 text-sky-200',
  amber:   'border-amber-500/30 bg-amber-500/10 text-amber-200',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  violet:  'border-violet-500/30 bg-violet-500/10 text-violet-200',
  indigo:  'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
  rose:    'border-rose-500/30 bg-rose-500/10 text-rose-200',
}

export default function Marketplace() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [filter, setFilter] = useState('all')
  const [composer, setComposer] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [stats, setStats]       = useState(null) // for drawer

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_marketplace_list_templates')
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      else toast.error('Failed to load', { description: error.message })
    } else {
      setList(data || [])
    }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return list
    if (filter === 'published')   return list.filter((t) => t.is_published)
    if (filter === 'unpublished') return list.filter((t) => !t.is_published)
    return list.filter((t) => t.kind === filter)
  }, [list, filter])

  const togglePublish = async (template) => {
    const { error } = await supabase.rpc('admin_marketplace_publish', {
      p_id: template.id,
      p_is_published: !template.is_published,
    })
    if (error) {
      toast.error('Toggle failed', { description: error.message })
      return
    }
    toast.success(template.is_published ? 'Unpublished' : 'Published')
    refresh()
  }

  const remove = async (template) => {
    if (!confirm(`Delete "${template.name}"? This unlinks installs but keeps install rows for history.`)) return
    const { error } = await supabase.rpc('admin_marketplace_delete', { p_id: template.id })
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    toast.success('Template deleted')
    refresh()
  }

  const showStats = async (template) => {
    const { data, error } = await supabase.rpc('admin_marketplace_install_stats', { p_template_id: template.id })
    if (error) {
      toast.error('Failed to load stats', { description: error.message })
      return
    }
    setStats({ template, rows: data || [] })
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Store className="w-5 h-5 text-indigo-300" />
            Marketplace
          </h1>
          <p className="text-sm text-slate-500">
            Templates customer orgs can install. Toggle publish, edit payloads, see install counts.
          </p>
        </div>
        <button onClick={() => setComposer(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white">
          <Plus className="w-3.5 h-3.5" /> New template
        </button>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 139 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">139_marketplace_templates.sql</code>.
        </Banner>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All ({list.length})</FilterChip>
        <FilterChip active={filter === 'published'}   onClick={() => setFilter('published')}>Published</FilterChip>
        <FilterChip active={filter === 'unpublished'} onClick={() => setFilter('unpublished')}>Drafts</FilterChip>
        <span className="w-px h-4 bg-slate-700/60 mx-1" />
        {KINDS.map((k) => (
          <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
            {KIND_META[k].label}
          </FilterChip>
        ))}
        <div className="grow" />
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} width="100%" height={180} rounded="rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Store}
          title="No templates"
          description={filter === 'all'
            ? 'Click "New template" to publish your first one.'
            : 'Nothing in this filter yet.'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => {
            const meta = KIND_META[t.kind] || KIND_META.email
            const Icon = meta.icon
            return (
              <div key={t.id} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-wider ${TONE_CLS[meta.tone]}`}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </div>
                  <button
                    onClick={() => togglePublish(t)}
                    title={t.is_published ? 'Unpublish' : 'Publish'}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${
                      t.is_published
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                        : 'bg-slate-700/30 text-slate-400 border-slate-700/40'
                    }`}>
                    {t.is_published
                      ? <><ToggleRight className="w-3 h-3" /> Published</>
                      : <><ToggleLeft className="w-3 h-3" /> Draft</>}
                  </button>
                </div>

                <h3 className="text-sm font-semibold text-slate-100 mb-1">{t.name}</h3>
                {t.description && <p className="text-xs text-slate-400 mb-3 line-clamp-3">{t.description}</p>}

                <div className="grow" />

                <div className="flex items-center justify-between pt-3 mt-auto border-t border-slate-800/60">
                  <button onClick={() => showStats(t)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-100">
                    <Users className="w-3 h-3" />
                    {Number(t.install_count || 0).toLocaleString()} installs
                  </button>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(t)} title="Edit"
                      className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(t)} title="Delete"
                      className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <TemplateEditor
        open={composer || !!editing}
        template={editing}
        onClose={() => { setComposer(false); setEditing(null) }}
        onSaved={() => { setComposer(false); setEditing(null); refresh() }} />

      <InstallStatsDrawer stats={stats} onClose={() => setStats(null)} />
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] border transition ${
        active
          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
      }`}>
      {children}
    </button>
  )
}

function TemplateEditor({ open, template, onClose, onSaved }) {
  const [kind, setKind]               = useState('email')
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [payloadStr, setPayloadStr]   = useState('{}')
  const [previewUrl, setPreviewUrl]   = useState('')
  const [published, setPublished]     = useState(false)
  const [busy, setBusy]               = useState(false)
  const [err, setErr]                 = useState(null)

  useEffect(() => {
    if (!open) return
    if (template) {
      setKind(template.kind || 'email')
      setName(template.name || '')
      setDescription(template.description || '')
      setPayloadStr(JSON.stringify(template.payload ?? {}, null, 2))
      setPreviewUrl(template.preview_image_url || '')
      setPublished(!!template.is_published)
    } else {
      setKind('email'); setName(''); setDescription(''); setPayloadStr('{}')
      setPreviewUrl(''); setPublished(false)
    }
    setErr(null)
  }, [open, template])

  const submit = async () => {
    setBusy(true); setErr(null)
    let payload
    try {
      payload = JSON.parse(payloadStr || '{}')
    } catch (_e) {
      setBusy(false); setErr('Payload is not valid JSON.'); return
    }
    const { error } = await supabase.rpc('admin_marketplace_publish', {
      p_id: template?.id ?? null,
      p_kind: kind,
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_payload: payload,
      p_preview_image_url: previewUrl.trim() || null,
      p_is_published: published,
    })
    setBusy(false)
    if (error) {
      if (isMissingFunction(error)) setErr('Migration 139 not applied yet.')
      else setErr(error.message)
      return
    }
    toast.success(template ? 'Saved' : 'Created')
    onSaved?.()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={template ? `Edit template — ${template.name}` : 'New template'}
      footer={
        <>
          <button onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">
            Cancel
          </button>
          <button disabled={busy || !name.trim()} onClick={submit}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
            {busy ? 'Saving…' : (template ? 'Save' : 'Create')}
          </button>
        </>
      }>
      <div className="space-y-3">
        {err && <Banner tone="danger">{err}</Banner>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind" required>
            <select value={kind} onChange={(e) => setKind(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
              {KINDS.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
            </select>
          </Field>
          <Field label="Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
        </Field>
        <Field label="Preview image URL (optional)">
          <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200" />
        </Field>
        <Field label="Payload (JSON)" required>
          <textarea value={payloadStr} onChange={(e) => setPayloadStr(e.target.value)} rows={10}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-200" />
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)}
            className="accent-indigo-500" />
          Published (customers can install)
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

function InstallStatsDrawer({ stats, onClose }) {
  return (
    <Modal open={!!stats} onClose={onClose} size="lg"
      title={stats ? `Installs — ${stats.template.name}` : ''}>
      {stats && (
        <div className="space-y-2">
          {stats.rows.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-6 text-center">
              No orgs have installed this template yet.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-2 py-1 text-left">Org</th>
                  <th className="px-2 py-1 text-right">Installs</th>
                  <th className="px-2 py-1 text-right">Last installed</th>
                </tr>
              </thead>
              <tbody>
                {stats.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800/60">
                    <td className="px-2 py-1.5 text-slate-200">{r.organization_name || '—'}</td>
                    <td className="px-2 py-1.5 text-right text-slate-300 tabular-nums">{r.install_count}</td>
                    <td className="px-2 py-1.5 text-right text-slate-400">{r.last_installed_at ? new Date(r.last_installed_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
  )
}
