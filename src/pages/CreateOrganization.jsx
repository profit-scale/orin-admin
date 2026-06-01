import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowLeft, Check, Copy, Mail, Loader2, Plus } from 'lucide-react'
import { supabase } from '../services/supabase'
import { toast } from '../components/ui/Toast'

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'growth', label: 'Growth' },
  { value: 'scale', label: 'Scale' },
]
const STATUSES = [
  { value: 'trial', label: 'Trial (14-day)' },
  { value: 'active', label: 'Active (paid)' },
]
const CURRENCIES = [
  { value: 'USD', symbol: '$', tz: 'America/New_York', locale: 'en-US' },
  { value: 'MYR', symbol: 'RM', tz: 'Asia/Kuala_Lumpur', locale: 'en-MY' },
  { value: 'SGD', symbol: 'S$', tz: 'Asia/Singapore', locale: 'en-SG' },
  { value: 'EUR', symbol: '€', tz: 'Europe/Berlin', locale: 'en-DE' },
  { value: 'GBP', symbol: '£', tz: 'Europe/London', locale: 'en-GB' },
  { value: 'AUD', symbol: 'A$', tz: 'Australia/Sydney', locale: 'en-AU' },
  { value: 'CAD', symbol: 'C$', tz: 'America/Toronto', locale: 'en-CA' },
]

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 placeholder-slate-600 outline-none transition'
const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

export default function CreateOrganization() {
  const navigate = useNavigate()
  const [orgName, setOrgName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [plan, setPlan] = useState('growth')
  const [status, setStatus] = useState('trial')
  const [currency, setCurrency] = useState('USD')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())
  const canSubmit = orgName.trim() && emailValid && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const cur = CURRENCIES.find((c) => c.value === currency) || CURRENCIES[0]
      const { data, error } = await supabase.functions.invoke('admin-provision-org', {
        body: {
          org_name: orgName.trim(),
          owner_email: ownerEmail.trim().toLowerCase(),
          owner_name: ownerName.trim() || null,
          plan,
          status,
          currency: cur.value,
          currency_symbol: cur.symbol,
          timezone: cur.tz,
          number_locale: cur.locale,
          personal_message: message.trim() || null,
          app_origin: 'https://app.orinsuite.com',
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setResult(data)
      if (data?.warning) {
        toast.success(`Organization created`, { description: `Email did not send (${data.warning}) — copy the invite link below.` })
      } else {
        toast.success('Organization created', { description: `Invite sent to ${data.owner_email}` })
      }
    } catch (err) {
      toast.error("Couldn't create organization", { description: err?.message || 'Unexpected error' })
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setResult(null)
    setOrgName(''); setOwnerEmail(''); setOwnerName(''); setMessage('')
    setPlan('growth'); setStatus('trial'); setCurrency('USD')
  }

  // ---- Success state ----
  if (result) {
    return (
      <div className="space-y-6 max-w-[640px]">
        <button
          type="button"
          onClick={() => navigate('/companies')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Companies
        </button>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Check className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{result.org?.name} created</h2>
              <p className="text-sm text-slate-400">
                {result.warning
                  ? 'Org provisioned. The invite email did not send, copy the link below.'
                  : <>Invite {result.method === 'magic_link' ? 'sign-in link' : ''} sent to <span className="text-slate-200">{result.owner_email}</span></>}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Invite / accept link</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[12px] text-slate-300 break-all">{result.accept_url}</code>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(result.accept_url); toast.success('Link copied') }}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              type="button"
              onClick={() => result.org?.id && navigate(`/companies/${result.org.id}`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white"
            >
              <Building2 className="w-4 h-4" /> View company
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              <Plus className="w-4 h-4" /> Create another
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Form ----
  return (
    <div className="space-y-6 max-w-[640px]">
      <button
        type="button"
        onClick={() => navigate('/companies')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Companies
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-300" aria-hidden="true" />
          Create organization
        </h1>
        <p className="text-sm text-slate-500">
          Provision an org for a client and invite the owner. They get an email, set a password, and land in Orin as owner, no self-signup needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-6 space-y-5">
        <div>
          <label className={labelCls}>Organization name <span className="text-rose-400">*</span></label>
          <input className={inputCls} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc." autoFocus />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Owner email <span className="text-rose-400">*</span></label>
            <input className={inputCls} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@acme.com" />
            {ownerEmail && !emailValid && <p className="text-[11px] text-rose-400 mt-1">Enter a valid email.</p>}
          </div>
          <div>
            <label className={labelCls}>Owner name</label>
            <input className={inputCls} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jane Doe" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Plan</label>
            <select className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
              {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Personal message <span className="text-slate-600">(optional, included in the invite email)</span></label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Welcome to Orin! Your workspace is ready." />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {submitting ? 'Creating…' : 'Create & invite owner'}
          </button>
          <p className="text-[11px] text-slate-500">Sends a branded invite email with an owner-access link.</p>
        </div>
      </form>
    </div>
  )
}
