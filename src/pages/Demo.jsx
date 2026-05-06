import { useEffect, useState } from 'react'
import { Beaker, Plus, Copy, Trash2, Clock, RefreshCcw, Check } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'

const TEMPLATES = [
  { id: 'standard', label: 'Standard (50 contacts, 10 deals, messages)' },
]

function relTime(s) {
  const ms = new Date(s).getTime() - Date.now()
  const m = Math.floor(ms / 60000)
  if (Math.abs(m) < 1) return 'now'
  const h = Math.floor(Math.abs(m) / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${ms < 0 ? '-' : ''}${d}d ${h%24}h`
  if (h > 0) return `${ms < 0 ? '-' : ''}${h}h ${Math.abs(m)%60}m`
  return `${ms < 0 ? '-' : ''}${Math.abs(m)}m`
}

export default function Demo() {
  const [list, setList]     = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [composer, setComposer] = useState(false)
  const [created, setCreated]   = useState(null) // last-created summary

  const refresh = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('demo_sessions')
      .select(`
        id, organization_id, expires_at, notes, template, demo_user_email, created_at,
        organizations!inner(id, name, slug, plan, is_active)
      `)
      .order('created_at', { ascending: false })
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
        setMissing(true)
      }
    } else {
      setList(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const extend = async (id) => {
    const hours = Number(prompt('Extend by how many hours?', '24'))
    if (!hours || hours <= 0) return
    const { error } = await supabase.rpc('admin_extend_demo', { p_id: id, p_hours: hours })
    if (error) alert(error.message)
    else refresh()
  }
  const destroy = async (id) => {
    if (!confirm('Destroy this demo org and all its data? Cannot be undone.')) return
    const { error } = await supabase.rpc('admin_destroy_demo', { p_id: id })
    if (error) alert(error.message)
    else refresh()
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
            <Beaker className="w-5 h-5 text-indigo-300" />
            Demo orgs
          </h1>
          <p className="text-sm text-slate-500">Sandbox tenants for sales calls and screenshots. Auto-pruned after expiry.</p>
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
            Create demo org
          </button>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 133 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">133_demo_mode.sql</code>.
        </Banner>
      )}

      {created && <NewlyCreatedCard data={created} onDismiss={() => setCreated(null)} />}

      {loading ? (
        <Skeleton width="100%" height={200} rounded="rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState icon={Beaker}
          title="No demo orgs yet"
          description="Create one to spin up a fully-seeded throwaway tenant in seconds." />
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-5 py-2.5 font-medium">Org</th>
                <th className="text-left px-3 py-2.5 font-medium">Template</th>
                <th className="text-left px-3 py-2.5 font-medium">Demo email</th>
                <th className="text-left px-3 py-2.5 font-medium">Created</th>
                <th className="text-left px-3 py-2.5 font-medium">Expires</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const expired = new Date(d.expires_at) < new Date()
                return (
                  <tr key={d.id} className={`border-b border-slate-800/40 last:border-0 ${expired ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-2.5">
                      <div className="text-slate-100 truncate max-w-xs">{d.organizations?.name || d.organization_id}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{d.organizations?.slug}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{d.template}</td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-400 font-mono truncate max-w-[200px]">{d.demo_user_email}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{new Date(d.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className={expired ? 'text-rose-300' : 'text-emerald-300'}>
                        {expired ? `expired ${relTime(d.expires_at)} ago` : `in ${relTime(d.expires_at)}`}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => extend(d.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800/40">
                          <Clock className="w-3 h-3" /> Extend
                        </button>
                        <button onClick={() => destroy(d.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-rose-500/40 text-rose-300 hover:bg-rose-500/10">
                          <Trash2 className="w-3 h-3" /> Destroy
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <NewDemoModal open={composer}
        onClose={() => setComposer(false)}
        onCreated={(d) => { setCreated(d); refresh() }} />
    </div>
  )
}

function NewlyCreatedCard({ data, onDismiss }) {
  const [copied, setCopied] = useState(null)
  const copy = (label, text) => {
    try {
      navigator.clipboard.writeText(text)
      setCopied(label); setTimeout(() => setCopied(null), 1200)
    } catch { /* noop */ }
  }
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-emerald-200">Demo org created</h3>
        <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 text-xs">Dismiss</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Organization ID</div>
          <CopyValue value={data.organization_id} onCopy={copy} copied={copied === 'org'} label="org" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Slug</div>
          <CopyValue value={data.slug} onCopy={copy} copied={copied === 'slug'} label="slug" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Demo user email</div>
          <CopyValue value={data.demo_user_email} onCopy={copy} copied={copied === 'email'} label="email" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Expires at</div>
          <div className="text-slate-200">{new Date(data.expires_at).toLocaleString()}</div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-3">
        Note: a magic-link login was not generated server-side (we can't call the GoTrue admin
        API from a SQL fn). Use the Companies page to impersonate this org's email.
      </p>
    </div>
  )
}

function CopyValue({ value, onCopy, copied, label }) {
  return (
    <div className="flex items-center gap-2">
      <code className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[11px] font-mono text-slate-200 truncate flex-1">
        {value}
      </code>
      <button onClick={() => onCopy(label, value)}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200">
        {copied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  )
}

function NewDemoModal({ open, onClose, onCreated }) {
  const [label, setLabel]       = useState('')
  const [template, setTemplate] = useState('standard')
  const [hours, setHours]       = useState(24)
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState(null)

  useEffect(() => {
    if (open) { setLabel(''); setTemplate('standard'); setHours(24); setErr(null) }
  }, [open])

  const submit = async () => {
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('admin_create_demo_org', {
      p_label: label.trim() || 'Demo',
      p_template: template,
      p_hours: Number(hours) || 24,
    })
    setBusy(false)
    if (error) {
      if (isMissingFunction(error)) setErr('Migration 133 not applied yet.')
      else setErr(error.message)
      return
    }
    onCreated?.(data)
    onClose?.()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Create demo org"
      footer={
        <>
          <button onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
          <button disabled={busy} onClick={submit}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }>
      <div className="space-y-3">
        {err && <Banner tone="danger">{err}</Banner>}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Acme Pitch · Wed call"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Template</label>
          <select value={template} onChange={(e) => setTemplate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Expires in (hours)</label>
          <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200" />
        </div>
      </div>
    </Modal>
  )
}
