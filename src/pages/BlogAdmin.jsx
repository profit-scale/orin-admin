import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Newspaper, Plus, Archive, Edit3, Eye, EyeOff, ExternalLink,
  Trash2, Sparkles, ListPlus, Tag, Clock,
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

// Same project as everything else; used only for the blog-generate function call.
const SUPABASE_URL = 'https://zvopcktyvffcyvbjrisj.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b3Bja3R5dmZmY3l2YmpyaXNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjI5OTgsImV4cCI6MjA5MTIzODk5OH0.W2NOcL8IR3YGqLybBkw17kHJ0i5gb_f90XMk9xVcXyY'

const CATEGORIES = ['Comparisons', 'Guides', 'AI', 'Playbooks', 'CRM']
const SITE = 'https://orinsuite.com'

function fmt(s) { if (!s) return '—'; try { return new Date(s).toLocaleString() } catch { return s } }

function statusPill(row) {
  if (row.archived_at) return <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-slate-600/60 bg-slate-700/40 text-slate-300">archived</span>
  if (row.is_published) return <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">published</span>
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-amber-500/40 bg-amber-500/10 text-amber-200">draft</span>
}

export default function BlogAdmin() {
  const [tab, setTab] = useState('posts') // 'posts' | 'topics'
  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageTitle title="Articles" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Newspaper className="w-6 h-6 text-indigo-300" aria-hidden="true" />
            Articles
          </h1>
          <p className="text-sm text-slate-500">
            Posts on orinsuite.com/blog. New posts are auto-written 5×/day from the topic queue; review, edit, or pull any down here. Every action is audited.
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/40 p-0.5">
        {[['posts', 'Posts'], ['topics', 'Topic queue']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-1.5 text-xs rounded-md transition ${tab === id ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-slate-800/60'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' ? <PostsTab /> : <TopicsTab />}
    </div>
  )
}

/* ================================ POSTS ================================ */

function PostsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(null)      // row | 'new' | null
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('blog_posts')
        .select('id, slug, title, category, keyword, tags, excerpt, is_published, published_at, archived_at, word_count, reading_min, source, created_at, updated_at')
        .order('created_at', { ascending: false })
      if (err) {
        if (err.code === '42P01' || /relation .* does not exist/i.test(err.message || '')) { setMissing(true); setRows([]); return }
        throw err
      }
      setRows(data || [])
    } catch (e) {
      setError(e?.message || 'Failed to load posts')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('blog_posts_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blog_posts' }, () => load())
      .subscribe()
    return () => { try { supabase.removeChannel(ch) } catch { /* noop */ } }
  }, [load])

  const onTogglePublish = useCallback(async (row) => {
    const goingLive = !row.is_published
    try {
      const { error: err } = await supabase.rpc('admin_blog_update', { p_id: row.id, p_payload: { is_published: goingLive } })
      if (err) throw err
      toast.success(goingLive ? 'Published' : 'Pulled down')
      load()
    } catch (e) {
      if (isMissingFunction(e)) { setMissing(true); toast.error('Migration 337 not applied') }
      else toast.error("Couldn't update", { description: e?.message })
    }
  }, [load])

  const onArchive = useCallback(async (id) => {
    try {
      const { error: err } = await supabase.rpc('admin_blog_archive', { p_id: id })
      if (err) throw err
      toast.success('Archived'); setArchiveTarget(null); load()
    } catch (e) { toast.error("Couldn't archive", { description: e?.message }) }
  }, [load])

  const onDelete = useCallback(async (id) => {
    try {
      const { error: err } = await supabase.rpc('admin_blog_delete', { p_id: id })
      if (err) throw err
      toast.success('Deleted'); setDeleteTarget(null); load()
    } catch (e) { toast.error("Couldn't delete", { description: e?.message }) }
  }, [load])

  const generateNow = useCallback(async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${SUPABASE_URL}/functions/v1/blog-generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      toast.success('Post generated', { description: j.post?.title })
      load()
    } catch (e) {
      toast.error("Couldn't generate", { description: e?.message })
    } finally { setGenerating(false) }
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <RefreshButton onClick={load} loading={loading} label="Refresh posts" />
        <button
          onClick={generateNow}
          disabled={generating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 transition disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {generating ? 'Generating…' : 'Generate now'}
        </button>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition"
        >
          <Plus className="w-3.5 h-3.5" />
          New post
        </button>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 337 not applied">
          The <code className="px-1 bg-black/30 rounded">blog_posts</code> table is missing. Apply <code className="px-1 bg-black/30 rounded">337_blog_posts.sql</code>.
        </Banner>
      )}
      {error && <ErrorCard title="Couldn't load posts" error={error} onRetry={load} />}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="100%" height={80} rounded="rounded-2xl" />)}</div>
      ) : !rows.length ? (
        <EmptyState icon={Newspaper} title="No posts yet" description="Hit 'Generate now' to write the first one, or add topics to the queue and let the daily job run." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className={`rounded-2xl border border-slate-800/60 bg-slate-900/30 px-5 py-4 ${r.archived_at ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-slate-100">{r.title}</h3>
                    {statusPill(r)}
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-indigo-500/30 bg-indigo-500/10 text-indigo-200">{r.category}</span>
                  </div>
                  {r.excerpt && <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{r.excerpt}</p>}
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px] text-slate-400 mt-3">
                    <div className="flex items-center gap-1.5 truncate"><Tag className="w-3 h-3 text-slate-500" /><span className="truncate">{r.keyword || '—'}</span></div>
                    <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-slate-500" /><span>{r.reading_min || '?'} min · {r.word_count || 0}w</span></div>
                    <div className="text-slate-500 truncate">/{r.slug}</div>
                    <div className="text-slate-500">Updated {fmt(r.updated_at)}</div>
                  </dl>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.is_published && !r.archived_at && (
                    <a href={`${SITE}/blog/${r.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition">
                      <ExternalLink className="w-3 h-3" />View
                    </a>
                  )}
                  <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"><Edit3 className="w-3 h-3" />Edit</button>
                  {!r.archived_at && (
                    <button onClick={() => onTogglePublish(r)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border transition ${r.is_published ? 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10' : 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10'}`}>
                      {r.is_published ? <><EyeOff className="w-3 h-3" />Pull down</> : <><Eye className="w-3 h-3" />Publish</>}
                    </button>
                  )}
                  {!r.archived_at && (
                    <button onClick={() => setArchiveTarget(r)} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/40 transition"><Archive className="w-3 h-3" />Archive</button>
                  )}
                  <button onClick={() => setDeleteTarget(r)} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-rose-500/30 text-rose-200 hover:bg-rose-500/10 transition"><Trash2 className="w-3 h-3" />Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PostEditor open={!!editing} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} onMissing={() => setMissing(true)} />

      <Modal open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive post?" size="sm"
        footer={<>
          <button onClick={() => setArchiveTarget(null)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition">Cancel</button>
          <button onClick={() => archiveTarget && onArchive(archiveTarget.id)} className="px-3 py-1.5 text-xs rounded-lg bg-slate-600 hover:bg-slate-500 text-white transition">Archive</button>
        </>}>
        <p className="text-sm text-slate-300 leading-relaxed">Hides the post from the public site and unpublishes it. The row stays here so you can restore it by editing.</p>
        {archiveTarget && <p className="text-xs text-slate-500 mt-2"><span className="text-slate-300 font-medium">{archiveTarget.title}</span></p>}
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete post permanently?" size="sm"
        footer={<>
          <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition">Cancel</button>
          <button onClick={() => deleteTarget && onDelete(deleteTarget.id)} className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition">Delete forever</button>
        </>}>
        <p className="text-sm text-slate-300 leading-relaxed">This removes the post entirely — it can't be undone. If you just want it off the site, use Archive instead.</p>
        {deleteTarget && <p className="text-xs text-slate-500 mt-2"><span className="text-slate-300 font-medium">{deleteTarget.title}</span></p>}
      </Modal>
    </div>
  )
}

function PostEditor({ open, row, onClose, onSaved, onMissing }) {
  const isNew = !row
  const [f, setF] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setError(null); setSubmitting(false)
    setF(row ? {
      title: row.title || '', slug: row.slug || '', category: row.category || 'Guides',
      keyword: row.keyword || '', tags: (row.tags || []).join(', '), excerpt: row.excerpt || '',
      meta_description: row.meta_description || '', body_html: row.body_html || '', is_published: !!row.is_published,
    } : { title: '', slug: '', category: 'Guides', keyword: '', tags: '', excerpt: '', meta_description: '', body_html: '', is_published: false })
  }, [open, row])

  // Editing an existing row needs its body_html, which the list query omits.
  useEffect(() => {
    if (!open || !row?.id) return
    let cancel = false
    supabase.from('blog_posts').select('body_html, meta_description').eq('id', row.id).maybeSingle()
      .then(({ data }) => { if (!cancel && data) setF((p) => ({ ...p, body_html: data.body_html || '', meta_description: data.meta_description || p.meta_description })) })
    return () => { cancel = true }
  }, [open, row])

  const valid = useMemo(() => (f.title || '').trim() && (f.body_html || '').trim(), [f])

  function slugify(s) { return (s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) }

  async function onSubmit(publishOverride) {
    if (!valid || submitting) return
    setSubmitting(true); setError(null)
    const payload = {
      title: f.title.trim(),
      slug: (f.slug.trim() || slugify(f.title)),
      category: f.category,
      keyword: f.keyword.trim() || null,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      excerpt: f.excerpt.trim() || null,
      meta_description: f.meta_description.trim() || null,
      body_html: f.body_html,
      is_published: typeof publishOverride === 'boolean' ? publishOverride : f.is_published,
    }
    try {
      if (isNew) {
        const { error: err } = await supabase.rpc('admin_blog_create', { p_payload: { ...payload, source: 'manual' } })
        if (err) throw err
        toast.success(payload.is_published ? 'Published' : 'Saved as draft')
      } else {
        const { error: err } = await supabase.rpc('admin_blog_update', { p_id: row.id, p_payload: payload })
        if (err) throw err
        toast.success(payload.is_published ? 'Updated · live' : 'Updated · draft')
      }
      onSaved?.()
    } catch (e) {
      if (isMissingFunction(e)) { onMissing?.(); setError('Migration 337 not applied.') }
      else setError(e?.message || 'Failed to save')
    } finally { setSubmitting(false) }
  }

  const inputCls = 'w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none'
  const labelCls = 'block text-[11px] uppercase tracking-wider text-slate-500 mb-1'

  return (
    <Modal open={open} onClose={() => !submitting && onClose?.()} title={isNew ? 'New post' : `Edit · ${row?.title || ''}`} size="lg"
      footer={<>
        <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50">Cancel</button>
        <button onClick={() => onSubmit(false)} disabled={!valid || submitting} className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-40">{submitting ? 'Saving…' : 'Save draft'}</button>
        <button onClick={() => onSubmit(true)} disabled={!valid || submitting} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40">{submitting ? 'Publishing…' : 'Publish'}</button>
      </>}>
      <div className="space-y-3">
        <label className="block"><span className={labelCls}>Title<span className="text-rose-400 ml-0.5">*</span></span>
          <input value={f.title || ''} onChange={(e) => set('title', e.target.value)} maxLength={200} className={inputCls} /></label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block"><span className={labelCls}>Category</span>
            <select value={f.category || 'Guides'} onChange={(e) => set('category', e.target.value)} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></label>
          <label className="block sm:col-span-2"><span className={labelCls}>Primary keyword</span>
            <input value={f.keyword || ''} onChange={(e) => set('keyword', e.target.value)} className={inputCls} placeholder="hubspot alternatives" /></label>
        </div>
        <label className="block"><span className={labelCls}>Slug <span className="normal-case text-slate-600">(URL id — auto from title if blank)</span></span>
          <input value={f.slug || ''} onChange={(e) => set('slug', e.target.value)} className={`${inputCls} font-mono`} placeholder="hubspot-alternatives-small-teams" /></label>
        <label className="block"><span className={labelCls}>Tags <span className="normal-case text-slate-600">(comma separated)</span></span>
          <input value={f.tags || ''} onChange={(e) => set('tags', e.target.value)} className={inputCls} placeholder="crm, hubspot, pricing" /></label>
        <label className="block"><span className={labelCls}>Excerpt <span className="normal-case text-slate-600">(card summary)</span></span>
          <input value={f.excerpt || ''} onChange={(e) => set('excerpt', e.target.value)} maxLength={400} className={inputCls} /></label>
        <label className="block"><span className={labelCls}>Meta description <span className="normal-case text-slate-600">(SEO, ~155 chars)</span></span>
          <input value={f.meta_description || ''} onChange={(e) => set('meta_description', e.target.value)} maxLength={200} className={inputCls} /></label>
        <label className="block"><span className={labelCls}>Body <span className="normal-case text-slate-600">(HTML — h2/h3/p/ul/li/blockquote/a)</span><span className="text-rose-400 ml-0.5">*</span></span>
          <textarea value={f.body_html || ''} onChange={(e) => set('body_html', e.target.value)} rows={14} className={`${inputCls} font-mono text-[12px] leading-relaxed`} /></label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!f.is_published} onChange={(e) => set('is_published', e.target.checked)} className="w-4 h-4 rounded border-slate-700 bg-slate-950" />
          <span className="text-sm text-slate-200">Published (live on orinsuite.com/blog)</span>
        </label>
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
      </div>
    </Modal>
  )
}

/* ================================ TOPICS ================================ */

function TopicsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('blog_topics')
        .select('id, title, keyword, category, angle, status, priority, created_at')
        .order('status', { ascending: true })
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
      if (err) throw err
      setRows(data || [])
    } catch (e) { setError(e?.message || 'Failed to load topics') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const onDelete = useCallback(async (id) => {
    try {
      const { error: err } = await supabase.rpc('admin_topic_delete', { p_id: id })
      if (err) throw err
      toast.success('Topic removed'); setDeleteTarget(null); load()
    } catch (e) { toast.error("Couldn't delete", { description: e?.message }) }
  }, [load])

  const pending = rows.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          The generator draws from pending topics (highest priority first), then self-picks fresh angles when the queue is empty. <span className="text-slate-300">{pending.length} pending.</span>
        </p>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={load} loading={loading} label="Refresh topics" />
          <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition"><ListPlus className="w-3.5 h-3.5" />Add topic</button>
        </div>
      </div>

      {error && <ErrorCard title="Couldn't load topics" error={error} onRetry={load} />}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={52} rounded="rounded-xl" />)}</div>
      ) : !rows.length ? (
        <EmptyState icon={ListPlus} title="No topics queued" description="Add topics to steer what gets written. Each becomes a post, highest-priority first." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className={`rounded-xl border border-slate-800/60 bg-slate-900/30 px-4 py-3 flex items-center gap-3 ${r.status !== 'pending' ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-100">{r.title}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-indigo-500/30 bg-indigo-500/10 text-indigo-200">{r.category}</span>
                  {r.status !== 'pending' && <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider border border-slate-600/60 bg-slate-700/40 text-slate-300">{r.status}</span>}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">{r.keyword ? `kw: ${r.keyword} · ` : ''}priority {r.priority}</div>
              </div>
              <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"><Edit3 className="w-3 h-3" />Edit</button>
              <button onClick={() => setDeleteTarget(r)} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-rose-500/30 text-rose-200 hover:bg-rose-500/10 transition"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <TopicEditor open={!!editing} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove topic?" size="sm"
        footer={<>
          <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition">Cancel</button>
          <button onClick={() => deleteTarget && onDelete(deleteTarget.id)} className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition">Remove</button>
        </>}>
        <p className="text-sm text-slate-300">Remove this topic from the queue. Posts already generated from it are unaffected.</p>
      </Modal>
    </div>
  )
}

function TopicEditor({ open, row, onClose, onSaved }) {
  const isNew = !row
  const [f, setF] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setError(null); setSubmitting(false)
    setF(row ? { title: row.title || '', keyword: row.keyword || '', category: row.category || 'Guides', angle: row.angle || '', priority: row.priority ?? 0, status: row.status || 'pending' }
             : { title: '', keyword: '', category: 'Guides', angle: '', priority: 0, status: 'pending' })
  }, [open, row])

  const inputCls = 'w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none'
  const labelCls = 'block text-[11px] uppercase tracking-wider text-slate-500 mb-1'

  async function onSubmit() {
    if (!(f.title || '').trim() || submitting) return
    setSubmitting(true); setError(null)
    const payload = { title: f.title.trim(), keyword: f.keyword.trim() || null, category: f.category, angle: f.angle.trim() || null, priority: Number.isFinite(+f.priority) ? +f.priority : 0 }
    try {
      if (isNew) {
        const { error: err } = await supabase.rpc('admin_topic_create', { p_payload: payload })
        if (err) throw err; toast.success('Topic added')
      } else {
        const { error: err } = await supabase.rpc('admin_topic_update', { p_id: row.id, p_payload: { ...payload, status: f.status } })
        if (err) throw err; toast.success('Topic updated')
      }
      onSaved?.()
    } catch (e) { setError(e?.message || 'Failed to save') } finally { setSubmitting(false) }
  }

  return (
    <Modal open={open} onClose={() => !submitting && onClose?.()} title={isNew ? 'Add topic' : 'Edit topic'} size="md"
      footer={<>
        <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50">Cancel</button>
        <button onClick={onSubmit} disabled={!(f.title || '').trim() || submitting} className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40">{submitting ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="space-y-3">
        <label className="block"><span className={labelCls}>Title / angle<span className="text-rose-400 ml-0.5">*</span></span>
          <input value={f.title || ''} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="Best WhatsApp CRM tools, compared" /></label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block"><span className={labelCls}>Category</span>
            <select value={f.category || 'Guides'} onChange={(e) => set('category', e.target.value)} className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="block sm:col-span-2"><span className={labelCls}>Primary keyword</span>
            <input value={f.keyword || ''} onChange={(e) => set('keyword', e.target.value)} className={inputCls} placeholder="whatsapp crm" /></label>
        </div>
        <label className="block"><span className={labelCls}>Angle / guidance <span className="normal-case text-slate-600">(optional note to the writer)</span></span>
          <textarea value={f.angle || ''} onChange={(e) => set('angle', e.target.value)} rows={3} className={inputCls} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={labelCls}>Priority <span className="normal-case text-slate-600">(higher = sooner)</span></span>
            <input type="number" value={f.priority ?? 0} onChange={(e) => set('priority', e.target.value)} className={inputCls} /></label>
          {!isNew && (
            <label className="block"><span className={labelCls}>Status</span>
              <select value={f.status || 'pending'} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                {['pending', 'used', 'skipped'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
          )}
        </div>
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
      </div>
    </Modal>
  )
}
