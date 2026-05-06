import { useState } from 'react'
import {
  Download,
  Trash2,
  ShieldX,
  Mail,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Modal from '../components/ui/Modal'
import PageTitle from '../components/ui/PageTitle'

function SectionCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur ${className}`}>
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  )
}

export default function Gdpr() {
  return (
    <div className="space-y-6 max-w-[1100px]">
      <PageTitle title="GDPR" />
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
          <ShieldX className="w-5 h-5 text-indigo-300" aria-hidden="true" />
          GDPR — export &amp; deletion
        </h1>
        <p className="text-sm text-slate-500">Right-to-access and right-to-erasure tooling. Every action is audited.</p>
      </div>

      <ExportCard />
      <PurgeCard />
    </div>
  )
}

function ExportCard() {
  const [email, setEmail]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr]       = useState(null)

  const submit = async () => {
    setBusy(true); setErr(null); setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-gdpr-export', {
        body: { user_email: email.trim() },
      })
      if (error) throw error
      if (data?.ok) {
        setResult(data)
      } else {
        setErr(data?.message || 'Export failed')
      }
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard title="Export user data" subtitle="Bundles every row we have for the user into a single JSON file. 24h signed download link.">
      <div className="space-y-3">
        {err && <Banner tone="danger">{err}</Banner>}
        {result && (
          <Banner tone={result.user_found ? 'success' : 'warning'}>
            {result.user_found
              ? `Found user. Exported ${result.total_rows} rows across all tables (${(result.file_size/1024).toFixed(1)} KB).`
              : `No user with that email — empty bundle generated for audit.`}
            <div className="mt-2">
              <a
                href={result.signed_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white"
              >
                <Download className="w-3.5 h-3.5" />
                Download bundle
              </a>
              <span className="ml-2 font-mono text-[10px] text-slate-500 break-all">{result.file_path}</span>
            </div>
          </Banner>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">User email</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-indigo-500 focus:outline-none" />
            </div>
          </div>
          <button onClick={submit} disabled={busy || !email.trim()}
            className="px-4 py-2 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

function PurgeCard() {
  const [email, setEmail]   = useState('')
  const [confirmInput, setConfirmInput] = useState('')
  const [stage, setStage]   = useState('idle')   // 'idle' | 'confirm1' | 'confirm2' | 'done'
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr]       = useState(null)

  const reset = () => {
    setEmail(''); setConfirmInput(''); setStage('idle'); setResult(null); setErr(null)
  }

  const submit = async () => {
    setBusy(true); setErr(null); setResult(null)
    const { data, error } = await supabase.rpc('admin_gdpr_purge_user', { p_email: email.trim() })
    setBusy(false)
    if (error) {
      if (isMissingFunction(error)) setErr('Migration 131 not applied yet.')
      else setErr(error.message)
      setStage('idle')
      return
    }
    setResult(data)
    setStage('done')
  }

  return (
    <>
      <SectionCard title="Delete user data" subtitle="Anonymises auth.users, nulls PII on contacts, drops org_members. Idempotent.">
        <div className="space-y-3">
          {stage === 'done' && result && (
            <Banner tone={result.user_found ? 'success' : 'warning'}>
              {result.user_found
                ? `Purged user ${result.user_id}. Touched ${result.contacts_touched} contacts, removed ${result.orgs_dropped} org memberships, anonymized auth row.`
                : `No user found. Nulled ${result.contacts_touched} contact rows matching that email.`}
            </Banner>
          )}
          {err && <Banner tone="danger">{err}</Banner>}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">User email</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-rose-500 focus:outline-none" />
              </div>
            </div>
            <button onClick={() => setStage('confirm1')} disabled={busy || !email.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white inline-flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              Purge user data
            </button>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={stage === 'confirm1'}
        onClose={() => setStage('idle')}
        size="lg"
        title="Are you sure?"
        footer={
          <>
            <button onClick={() => setStage('idle')}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
            <button onClick={() => setStage('confirm2')}
              className="px-3 py-1.5 text-xs rounded-lg bg-rose-500 hover:bg-rose-400 text-white">Continue</button>
          </>
        }>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-200 space-y-2">
            <p>This will anonymise <strong className="font-mono">{email}</strong> across the platform:</p>
            <ul className="list-disc list-inside text-slate-400 text-xs space-y-1">
              <li>auth.users.email → <code>purged-&lt;id&gt;@orin.purged</code></li>
              <li>contacts.email/phone/first_name/last_name → NULL (where email matches)</li>
              <li>org_members rows → DELETED</li>
              <li>Audit log + historical messages STAY (they reference user_id)</li>
            </ul>
            <p className="text-rose-300 text-xs">This action is logged and cannot be undone without a backup restore.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={stage === 'confirm2'}
        onClose={() => setStage('idle')}
        size="lg"
        title="Type the email to confirm"
        footer={
          <>
            <button onClick={() => setStage('idle')}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
            <button
              onClick={submit}
              disabled={busy || confirmInput.trim().toLowerCase() !== email.trim().toLowerCase()}
              className="px-3 py-1.5 text-xs rounded-lg bg-rose-500 hover:bg-rose-400 disabled:opacity-30 text-white inline-flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              {busy ? 'Purging…' : 'Confirm purge'}
            </button>
          </>
        }>
        <div className="space-y-2">
          <p className="text-sm text-slate-300">
            Type <code className="px-1.5 py-0.5 bg-black/30 rounded font-mono text-rose-200">{email}</code> below to confirm:
          </p>
          <input value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 bg-slate-950 border border-rose-500/40 rounded-lg text-sm text-slate-200 font-mono focus:border-rose-500 focus:outline-none"
            placeholder={email} />
          {confirmInput && confirmInput.trim().toLowerCase() === email.trim().toLowerCase() && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Email matches — ready to purge.
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
