import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  Plus,
  Archive,
  Edit3,
  Eye,
  EyeOff,
  ExternalLink,
  Mail,
  MapPin,
  Tag,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Modal from '../components/ui/Modal'
import Banner from '../components/ui/Banner'
import EmptyState from '../components/ui/EmptyState'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'
import ErrorCard from '../components/ui/ErrorCard'
import Skeleton from '../components/ui/Skeleton'
import { toast } from '../components/ui/Toast'

const EMPLOYMENT_TYPES = [
  { id: 'full_time', label: 'Full-time' },
  { id: 'part_time', label: 'Part-time' },
  { id: 'contract',  label: 'Contract' },
  { id: 'intern',    label: 'Intern' },
]

function fmt(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString() } catch { return s }
}

function statusOf(row) {
  if (row.archived_at) return 'archived'
  if (row.is_published) return 'published'
  return 'draft'
}

function statusPill(row) {
  const s = statusOf(row)
  if (s === 'published') {
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">published</span>
  }
  if (s === 'archived') {
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-slate-600/60 bg-slate-700/40 text-slate-300">archived</span>
  }
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-200">draft</span>
}

function employmentLabel(id) {
  return EMPLOYMENT_TYPES.find((e) => e.id === id)?.label || id
}

export default function CareersAdmin() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(null)        // row or 'new' or null
  const [archiveTarget, setArchiveTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('careers_postings')
        .select('id, slug, title, department, location, employment_type, level, summary, description, apply_url, apply_email, salary_range, sort_order, is_published, published_at, archived_at, created_at, updated_at')
        .order('sort_order', { ascending: false })
        .order('updated_at', { ascending: false })
      if (err) {
        if (err.code === '42P01' || /relation .* does not exist/i.test(err.message || '')) {
          setMissing(true)
          setRows([])
          return
        }
        throw err
      }
      setRows(data || [])
    } catch (e) {
      setError(e?.message || 'Failed to load postings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime — list updates when another super-admin edits.
  useEffect(() => {
    const channel = supabase
      .channel('careers_postings_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'careers_postings' },
        () => { load() },
      )
      .subscribe()
    return () => {
      try { supabase.removeChannel(channel) } catch { /* noop */ }
    }
  }, [load])

  const onTogglePublish = useCallback(async (row) => {
    const goingLive = !row.is_published
    try {
      const { error: err } = await supabase.rpc('admin_careers_update', {
        p_id: row.id,
        p_payload: { is_published: goingLive },
      })
      if (err) throw err
      toast.success(goingLive ? 'Published' : 'Unpublished')
      load()
    } catch (e) {
      if (isMissingFunction(e)) {
        setMissing(true)
        toast.error("Migration 151 not applied")
      } else {
        toast.error("Couldn't update", { description: e?.message })
      }
    }
  }, [load])

  const onArchive = useCallback(async (id) => {
    try {
      const { error: err } = await supabase.rpc('admin_careers_archive', { p_id: id })
      if (err) throw err
      toast.success('Archived')
      setArchiveTarget(null)
      load()
    } catch (e) {
      toast.error("Couldn't archive", { description: e?.message })
    }
  }, [load])

  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageTitle title="Job postings" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Briefcase className="w-6 h-6 text-indigo-300" aria-hidden="true" />
            Job postings
          </h1>
          <p className="text-sm text-slate-500">
            Postings shown on orinsuite.com/careers. Drafts stay private; publish to put them live. Every action is audited.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={load} loading={loading} label="Refresh postings" />
          <button
            onClick={() => setEditing('new')}
            aria-label="Create new posting"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New posting
          </button>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 151 not applied">
          The <code className="px-1 bg-black/30 rounded">careers_postings</code> table is missing.
          Apply <code className="px-1 bg-black/30 rounded">151_careers_postings.sql</code> to enable.
        </Banner>
      )}

      {error && <ErrorCard title="Couldn't load postings" error={error} onRetry={load} />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={96} rounded="rounded-2xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={Briefcase}
          title="No postings yet"
          description="Click 'New posting' to write the first one. Drafts stay private until you publish them."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`rounded-2xl border border-slate-800/60 bg-slate-900/30 px-5 py-4 ${r.archived_at ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-slate-100">{r.title}</h3>
                    {statusPill(r)}
                    {r.department && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-indigo-500/30 bg-indigo-500/10 text-indigo-200">
                        {r.department}
                      </span>
                    )}
                  </div>
                  {r.summary && (
                    <p className="text-xs text-slate-300 leading-relaxed">{r.summary}</p>
                  )}
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px] text-slate-400 mt-3">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span>{r.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-slate-500" />
                      <span>{employmentLabel(r.employment_type)}{r.level ? ` · ${r.level}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      {r.apply_url ? (
                        <><ExternalLink className="w-3 h-3 text-slate-500" /> <span className="truncate">{r.apply_url}</span></>
                      ) : r.apply_email ? (
                        <><Mail className="w-3 h-3 text-slate-500" /> <span className="truncate">{r.apply_email}</span></>
                      ) : (
                        <span className="text-slate-600">No apply route</span>
                      )}
                    </div>
                    <div className="text-slate-500">
                      Updated {fmt(r.updated_at)}
                    </div>
                  </dl>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditing(r)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>
                  {!r.archived_at && (
                    <button
                      onClick={() => onTogglePublish(r)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border transition ${
                        r.is_published
                          ? 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10'
                          : 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10'
                      }`}
                    >
                      {r.is_published ? <><EyeOff className="w-3 h-3" />Unpublish</> : <><Eye className="w-3 h-3" />Publish</>}
                    </button>
                  )}
                  {!r.archived_at && (
                    <button
                      onClick={() => setArchiveTarget(r)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-rose-500/30 text-rose-200 hover:bg-rose-500/10 transition"
                    >
                      <Archive className="w-3 h-3" />
                      Archive
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      <PostingEditor
        open={!!editing}
        row={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }}
        onMissing={() => setMissing(true)}
      />

      {/* Archive confirmation */}
      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive posting?"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setArchiveTarget(null)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => archiveTarget && onArchive(archiveTarget.id)}
              className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition"
            >
              Archive
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-300 leading-relaxed">
          This hides the posting from the public site and stops it being editable. You can still see it in this list, but it counts as closed.
        </p>
        {archiveTarget && (
          <p className="text-xs text-slate-500 mt-2">
            <span className="text-slate-300 font-medium">{archiveTarget.title}</span> · {archiveTarget.location}
          </p>
        )}
      </Modal>
    </div>
  )
}

/* ---------------------------------------------------------------- */

function PostingEditor({ open, row, onClose, onSaved, onMissing }) {
  const isNew = !row
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [location, setLocation] = useState('')
  const [employmentType, setEmploymentType] = useState('full_time')
  const [level, setLevel] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [applyUrl, setApplyUrl] = useState('')
  const [applyEmail, setApplyEmail] = useState('')
  const [salaryRange, setSalaryRange] = useState('')
  const [slug, setSlug] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [isPublished, setIsPublished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Reset on open / row change.
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    if (row) {
      setTitle(row.title || '')
      setDepartment(row.department || '')
      setLocation(row.location || '')
      setEmploymentType(row.employment_type || 'full_time')
      setLevel(row.level || '')
      setSummary(row.summary || '')
      setDescription(row.description || '')
      setApplyUrl(row.apply_url || '')
      setApplyEmail(row.apply_email || '')
      setSalaryRange(row.salary_range || '')
      setSlug(row.slug || '')
      setSortOrder(row.sort_order ?? 0)
      setIsPublished(!!row.is_published)
    } else {
      setTitle('')
      setDepartment('')
      setLocation('')
      setEmploymentType('full_time')
      setLevel('')
      setSummary('')
      setDescription('')
      setApplyUrl('')
      setApplyEmail('')
      setSalaryRange('')
      setSlug('')
      setSortOrder(0)
      setIsPublished(false)
    }
  }, [open, row])

  const valid = useMemo(
    () => title.trim() && location.trim() && description.trim(),
    [title, location, description],
  )

  async function onSubmit(publishOverride) {
    if (!valid || submitting) return
    setSubmitting(true)
    setError(null)
    const payload = {
      slug: slug.trim() || null,
      title: title.trim(),
      department: department.trim() || null,
      location: location.trim(),
      employment_type: employmentType,
      level: level.trim() || null,
      summary: summary.trim() || null,
      description: description.trim(),
      apply_url: applyUrl.trim() || null,
      apply_email: applyEmail.trim() || null,
      salary_range: salaryRange.trim() || null,
      sort_order: Number.isFinite(+sortOrder) ? +sortOrder : 0,
      is_published: typeof publishOverride === 'boolean' ? publishOverride : isPublished,
    }
    try {
      if (isNew) {
        const { error: err } = await supabase.rpc('admin_careers_create', { p_payload: payload })
        if (err) throw err
        toast.success(payload.is_published ? 'Posted' : 'Saved as draft')
      } else {
        const { error: err } = await supabase.rpc('admin_careers_update', {
          p_id: row.id,
          p_payload: payload,
        })
        if (err) throw err
        toast.success(payload.is_published ? 'Updated · live' : 'Updated · draft')
      }
      onSaved?.()
    } catch (e) {
      if (isMissingFunction(e)) {
        onMissing?.()
        setError('Migration 151 not applied. Apply it from the migrations folder before continuing.')
      } else {
        setError(e?.message || 'Failed to save')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose?.()}
      title={isNew ? 'New posting' : `Edit · ${row?.title || ''}`}
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
            onClick={() => onSubmit(false)}
            disabled={!valid || submitting}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save draft'}
          </button>
          <button
            onClick={() => onSubmit(true)}
            disabled={!valid || submitting}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40"
          >
            {submitting ? 'Publishing…' : 'Publish'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Title<span className="text-rose-400 ml-0.5">*</span></span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder="Senior Full-Stack Engineer"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Department</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Engineering"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Level</span>
            <input
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="Senior · Staff · Lead"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Location<span className="text-rose-400 ml-0.5">*</span></span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="KL · Hybrid · Remote SEA"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Employment type</span>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Summary <span className="normal-case text-slate-600">(one line shown on the list)</span></span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={200}
            placeholder="Ship across React, Postgres, edge functions. Own a slice end-to-end."
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Description<span className="text-rose-400 ml-0.5">*</span> <span className="normal-case text-slate-600">(plain text or markdown — paragraphs separated by blank lines)</span></span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={9}
            placeholder="What you'll do, who we're looking for, anything specific about the team or stack."
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono text-[12.5px] leading-relaxed"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Apply URL</span>
            <input
              value={applyUrl}
              onChange={(e) => setApplyUrl(e.target.value)}
              placeholder="https://… (Greenhouse / Typeform / Lever)"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Apply email</span>
            <input
              value={applyEmail}
              onChange={(e) => setApplyEmail(e.target.value)}
              placeholder="careers@orinsuite.com"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Salary range</span>
            <input
              value={salaryRange}
              onChange={(e) => setSalaryRange(e.target.value)}
              placeholder="MYR 14k–22k/mo · meaningful equity"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Sort order</span>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Slug <span className="normal-case text-slate-600">(URL-safe id, optional)</span></span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="senior-fullstack-kl"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
          />
        </label>

        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-950"
          />
          <span className="text-sm text-slate-200">Published (visible on orinsuite.com/careers)</span>
        </label>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
