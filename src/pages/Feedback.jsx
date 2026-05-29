import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MessageCircle, RefreshCcw, Bug, Lightbulb, HelpCircle, Heart, Circle, Mail,
  CheckCircle2, Clock,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'

const CATEGORY_META = {
  bug:      { icon: Bug,         label: 'Bug',      tone: 'rose' },
  feature:  { icon: Lightbulb,   label: 'Feature',  tone: 'amber' },
  question: { icon: HelpCircle,  label: 'Question', tone: 'sky' },
  praise:   { icon: Heart,       label: 'Praise',   tone: 'emerald' },
  other:    { icon: Circle,      label: 'Other',    tone: 'slate' },
}
const STATUS_META = {
  open:         { tone: 'sky',     label: 'Open' },
  acknowledged: { tone: 'amber',   label: 'Ack' },
  planned:      { tone: 'indigo',  label: 'Planned' },
  shipped:      { tone: 'emerald', label: 'Shipped' },
  wont_do:      { tone: 'slate',   label: "Won't do" },
}
const TONE = {
  rose:    'bg-rose-500/15 text-rose-200 border-rose-500/30',
  amber:   'bg-amber-500/15 text-amber-200 border-amber-500/30',
  sky:     'bg-sky-500/15 text-sky-200 border-sky-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  slate:   'bg-slate-500/15 text-slate-200 border-slate-500/30',
  indigo:  'bg-indigo-500/15 text-indigo-200 border-indigo-500/30',
}
const STATUSES = ['open','acknowledged','planned','shipped','wont_do']

function fmt(s) { return s ? new Date(s).toLocaleString() : '—' }

export default function Feedback() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [filterStatus, setFilterStatus] = useState('open')
  const [filterCategory, setFilterCategory] = useState('')
  const [drawer, setDrawer] = useState(null)

  const refresh = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase.rpc('admin_feedback_list', {
      p_status:   filterStatus || null,
      p_category: filterCategory || null,
      p_limit:    200,
    })
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      else toast.error('Failed to load feedback', { description: error.message })
    } else {
      setList(data || [])
    }
    if (!silent) setLoading(false)
  }
  useEffect(() => { refresh() }, [filterStatus, filterCategory])

  // Keep a ref to the freshest refresh (with current filters) so the realtime
  // handler always re-fetches with the active filter without re-subscribing.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const rtTimer = useRef(null)

  // Live: silently re-fetch whenever a customer submits new feedback or an
  // admin updates a row, so the queue updates in real time without a manual
  // refresh. Debounced so a burst of writes collapses into one fetch.
  useEffect(() => {
    const channel = supabase
      .channel('rt:customer_feedback:admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_feedback' },
        () => {
          if (rtTimer.current) clearTimeout(rtTimer.current)
          rtTimer.current = setTimeout(() => refreshRef.current?.({ silent: true }), 250)
        },
      )
      .subscribe()
    // Poll fallback: even if the realtime publication doesn't yet include
    // customer_feedback, the queue still stays current (silent, no skeleton
    // flash). Realtime makes it instant; this guarantees liveness regardless.
    const poll = setInterval(() => refreshRef.current?.({ silent: true }), 20000)
    return () => {
      if (rtTimer.current) clearTimeout(rtTimer.current)
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [])

  const counts = useMemo(() => {
    const m = { open: 0, acknowledged: 0, planned: 0, shipped: 0, wont_do: 0 }
    list.forEach((r) => { if (m[r.status] != null) m[r.status]++ })
    return m
  }, [list])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-indigo-300" />
          Feedback
        </h1>
        <p className="text-sm text-slate-500">
          In-app feedback from customer org users — bugs, feature requests, questions, praise.
        </p>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 143 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">143_customer_feedback.sql</code>.
        </Banner>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Status</span>
        {['', ...STATUSES].map((s) => (
          <button key={s || 'all'}
            onClick={() => setFilterStatus(s)}
            className={`px-2.5 py-1 rounded-md text-[11px] border transition ${
              filterStatus === s
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}>
            {s ? `${STATUS_META[s]?.label || s}${counts[s] ? ' (' + counts[s] + ')' : ''}` : 'All'}
          </button>
        ))}
        <span className="w-px h-4 bg-slate-700/60 mx-1" />
        <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Category</span>
        {['', ...Object.keys(CATEGORY_META)].map((c) => (
          <button key={c || 'all'}
            onClick={() => setFilterCategory(c)}
            className={`px-2.5 py-1 rounded-md text-[11px] border transition ${
              filterCategory === c
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}>
            {c ? CATEGORY_META[c].label : 'All'}
          </button>
        ))}
        <div className="grow" />
        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-emerald-300/90"
          title="New submissions appear here automatically">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          Live
        </span>
        <button onClick={() => refresh()} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <Skeleton width="100%" height={300} rounded="rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={MessageCircle}
          title="No feedback in this filter"
          description="Try clearing the status or category filter." />
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const cat = CATEGORY_META[r.category] || CATEGORY_META.other
            const Icon = cat.icon
            const sm = STATUS_META[r.status] || STATUS_META.open
            return (
              <div key={r.id}
                onClick={() => setDrawer(r)}
                className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 cursor-pointer hover:border-slate-700">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-wider ${TONE[cat.tone]}`}>
                      <Icon className="w-3 h-3" /> {cat.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider ${TONE[sm.tone]}`}>
                      {r.status === 'open' ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      {sm.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 whitespace-nowrap">{fmt(r.created_at)}</div>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed mb-2 line-clamp-3">{r.message}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{r.user_full_name || r.user_email || '— anonymous —'}</span>
                  {r.organization_name && <><span>·</span><span>{r.organization_name}</span></>}
                  {r.page_url && <><span>·</span><span className="font-mono truncate max-w-[300px]">{r.page_url}</span></>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <FeedbackDrawer feedback={drawer} onClose={() => setDrawer(null)} onResolved={() => { setDrawer(null); refresh() }} />
    </div>
  )
}

function FeedbackDrawer({ feedback, onClose, onResolved }) {
  const [status, setStatus] = useState('open')
  const [notes, setNotes]   = useState('')
  const [busy, setBusy]     = useState(false)

  useEffect(() => {
    if (!feedback) return
    setStatus(feedback.status || 'open')
    setNotes(feedback.resolution_notes || '')
  }, [feedback])

  const save = async () => {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('admin_feedback_resolve', {
        p_id: feedback.id,
        p_status: status,
        p_notes: notes.trim() || null,
      })
      if (error) throw error
      toast.success('Saved')
      onResolved?.()
    } catch (e) {
      toast.error('Save failed', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  const emailReply = () => {
    if (!feedback?.user_email) return
    const subject = encodeURIComponent('Re: Your feedback on Orin')
    const body = encodeURIComponent(
      `Hi ${feedback.user_full_name || ''},\n\nThanks for your message — we got it loud and clear.\n\n> ${feedback.message.split('\n').join('\n> ')}\n\n— `
    )
    window.location.href = `mailto:${feedback.user_email}?subject=${subject}&body=${body}`
  }

  return (
    <Modal open={!!feedback} onClose={onClose} size="lg"
      title={feedback ? `Feedback — ${CATEGORY_META[feedback.category]?.label || feedback.category}` : ''}
      footer={
        feedback && (
          <>
            {feedback.user_email && (
              <button onClick={emailReply}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 mr-auto">
                <Mail className="w-3.5 h-3.5" /> Email reply
              </button>
            )}
            <button onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">
              Cancel
            </button>
            <button onClick={save} disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        )
      }>
      {feedback && (
        <div className="space-y-3">
          <div className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">{feedback.message}</div>
          <div className="grid grid-cols-2 gap-3 text-xs pt-3 border-t border-slate-800/60">
            <Kv k="From"  v={feedback.user_full_name || feedback.user_email || '—'} />
            <Kv k="Email" v={feedback.user_email || '—'} />
            <Kv k="Org"   v={feedback.organization_name || '—'} />
            <Kv k="When"  v={fmt(feedback.created_at)} />
            <Kv k="Page"  v={<span className="font-mono break-all">{feedback.page_url || '—'}</span>} />
            <Kv k="UA"    v={<span className="font-mono text-[10px] break-all line-clamp-2">{feedback.user_agent || '—'}</span>} />
          </div>
          <div className="pt-3 border-t border-slate-800/60 grid grid-cols-1 gap-3">
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </Field>
            <Field label="Internal notes (visible to admins only)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
            </Field>
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

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}
