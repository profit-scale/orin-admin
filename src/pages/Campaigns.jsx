import { useCallback, useEffect, useState } from 'react'
import {
  Mail,
  Plus,
  RefreshCcw,
  Send,
  Eye,
  Users,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import Modal from '../components/ui/Modal'

function StatusPill({ status }) {
  const map = {
    draft:     'bg-slate-500/15 text-slate-300 border-slate-500/30',
    scheduled: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
    sending:   'bg-amber-500/15 text-amber-200 border-amber-500/30',
    sent:      'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    failed:    'bg-rose-500/15 text-rose-200 border-rose-500/30',
    cancelled: 'bg-slate-700/30 text-slate-500 border-slate-700',
  }
  const c = map[status] || map.draft
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] ${c}`}>{status}</span>
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading]     = useState(true)
  const [missing, setMissing]     = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [actionMsg, setActionMsg] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const { data, error } = await supabase.rpc('admin_list_campaigns')
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      setCampaigns([])
    } else {
      setCampaigns(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Campaigns</h1>
          <p className="text-sm text-slate-500">Email blasts to customers — through the existing Resend pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50">
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white">
            <Plus className="w-3.5 h-3.5" /> New campaign
          </button>
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 126 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">126_email_campaigns.sql</code>.
        </Banner>
      )}
      {actionMsg && <Banner tone={actionMsg.tone}>{actionMsg.text}</Banner>}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={32} rounded="rounded" />))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No campaigns yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium px-5 py-2.5">Subject</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-right font-medium px-3 py-2.5">Recipients</th>
                  <th className="text-right font-medium px-3 py-2.5">Sent</th>
                  <th className="text-right font-medium px-3 py-2.5">Failed</th>
                  <th className="text-right font-medium px-3 py-2.5">Created by</th>
                  <th className="text-right font-medium px-5 py-2.5">When</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-5 py-2.5 text-slate-200 truncate max-w-[260px]">{c.subject}</td>
                    <td className="px-3 py-2.5"><StatusPill status={c.status} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{c.recipient_count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{c.sent_count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">{c.failed_count}</td>
                    <td className="px-3 py-2.5 text-right text-[11px] text-slate-500 truncate max-w-[200px]">{c.created_by_email || '—'}</td>
                    <td className="px-5 py-2.5 text-right text-[11px] text-slate-500">
                      {c.sent_at ? `Sent ${new Date(c.sent_at).toLocaleDateString()}` :
                        c.scheduled_at ? `Scheduled ${new Date(c.scheduled_at).toLocaleDateString()}` :
                        new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)}
        onCreated={() => { refresh(); setActionMsg({ tone:'success', text:'Campaign created.' }) }}
        onSent={(r) => { refresh(); setActionMsg({ tone:'success', text:`Sent ${r.sent} of ${r.recipient_count} (failed ${r.failed}).` }) }}
      />
    </div>
  )
}

const TARGETS = [
  { key: 'all_owners',  label: 'All org owners' },
  { key: 'all_admins',  label: 'All org admins' },
  { key: 'plan_trial',  label: 'Orgs on trial plan' },
  { key: 'plan_status_trialing', label: 'Orgs with status=trialing' },
  { key: 'emails_only', label: 'Manual email list (test sends)' },
]

function ComposeModal({ open, onClose, onCreated, onSent }) {
  const [subject, setSubject] = useState('')
  const [body, setBody]       = useState('')
  const [target, setTarget]   = useState('all_owners')
  const [emails, setEmails]   = useState('')
  const [campaignId, setCampaignId] = useState(null)
  const [count, setCount]     = useState(null)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState(null)
  const [testTo, setTestTo]   = useState('')

  useEffect(() => {
    if (open) {
      setSubject(''); setBody(''); setTarget('all_owners'); setEmails(''); setCampaignId(null); setCount(null); setErr(null); setTestTo('')
    }
  }, [open])

  function buildFilter() {
    if (target === 'all_owners') return { all_owners: true }
    if (target === 'all_admins') return { all_admins: true }
    if (target === 'plan_trial') return { plan: 'trial' }
    if (target === 'plan_status_trialing') return { plan_status: 'trialing' }
    if (target === 'emails_only') return { emails: emails.split(/[\n,]/).map(s => s.trim()).filter(Boolean) }
    return {}
  }

  async function previewCount() {
    setErr(null)
    const { data, error } = await supabase.rpc('admin_resolve_campaign_recipients', { p_filter: buildFilter() })
    if (error) { setErr(error.message); return }
    setCount(Array.isArray(data) ? data.length : 0)
  }

  async function createCampaign() {
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.rpc('admin_create_campaign', {
        p_name: subject,
        p_subject: subject,
        p_body_html: body.includes('<') ? body : null,
        p_body_text: body.includes('<') ? null : body,
        p_target_filter: buildFilter(),
        p_scheduled_at: null,
      })
      if (error) throw error
      setCampaignId(data?.id || null)
      setCount(data?.recipient_count || 0)
      onCreated?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function testSend() {
    if (!campaignId || !testTo) return
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-campaign', {
        body: { campaign_id: campaignId, test_only: true, test_to: testTo },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'send failed')
      onSent?.(data)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function reallySend() {
    if (!campaignId) return
    if (count === 0) {
      if (!window.confirm('Recipient count is 0 — sending will only audit-log. Continue?')) return
    } else if (!window.confirm(`Send to ${count} recipient${count===1?'':'s'}? This is irreversible.`)) {
      return
    }
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-send-campaign', {
        body: { campaign_id: campaignId },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'send failed')
      onSent?.(data)
      onClose?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose?.()} title="New campaign" size="lg">
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Subject</span>
          <input value={subject} onChange={(e)=>setSubject(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"/>
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Body (text or HTML)</span>
          <textarea value={body} onChange={(e)=>setBody(e.target.value)} rows={8}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none font-mono"
            placeholder="Hi there,&#10;&#10;..."/>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Target</span>
            <select value={target} onChange={(e)=>setTarget(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100">
              {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          {target === 'emails_only' && (
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Email list (comma or newline)</span>
              <textarea value={emails} onChange={(e)=>setEmails(e.target.value)} rows={2}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-slate-100"/>
            </label>
          )}
        </div>

        {err && <Banner tone="danger">{err}</Banner>}

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/40">
          <button onClick={previewCount} disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50">
            <Eye className="w-3.5 h-3.5" /> Preview count
          </button>
          {count != null && (
            <span className="text-xs text-slate-300">
              <Users className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              {count} recipient{count === 1 ? '' : 's'}
            </span>
          )}
          {!campaignId ? (
            <button onClick={createCampaign} disabled={busy || !subject.trim() || !body.trim()}
              className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Save campaign'}
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <input value={testTo} onChange={(e)=>setTestTo(e.target.value)} placeholder="test@email.com"
                className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200" />
              <button onClick={testSend} disabled={busy || !testTo}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 disabled:opacity-50">
                Test send
              </button>
              <button onClick={reallySend} disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> Send to all
              </button>
            </div>
          )}
        </div>
        {campaignId && (
          <p className="text-[11px] text-slate-500">
            Campaign created. Use Test send to verify, then Send to all.
          </p>
        )}
      </div>
    </Modal>
  )
}
