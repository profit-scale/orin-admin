import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Mail,
  RotateCw,
  Wallet,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import StatCard from '../components/ui/StatCard'
import Skeleton from '../components/ui/Skeleton'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'
import ErrorCard from '../components/ui/ErrorCard'
import { toast } from '../components/ui/Toast'

function fmtCents(c) {
  if (c == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(c / 100)
}

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString('en-US', { month:'short', day:'numeric', year:'2-digit' }) }
  catch { return s }
}

function StatusPill({ status }) {
  const map = {
    open:           'bg-amber-500/15 text-amber-200 border-amber-500/30',
    paid:           'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    uncollectible:  'bg-red-500/15 text-red-200 border-red-500/30',
    void:           'bg-slate-500/15 text-slate-300 border-slate-500/30',
    overdue:        'bg-rose-500/15 text-rose-200 border-rose-500/30',
  }
  const c = map[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] ${c}`}>{status}</span>
}

export default function Payments() {
  const [health, setHealth]     = useState(null)
  const [failed, setFailed]     = useState([])
  const [procs, setProcs]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [missing, setMissing]   = useState(false)
  const [err, setErr]           = useState(null)
  const [busy, setBusy]         = useState({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setMissing(false)
    const [hRes, fRes, pRes] = await Promise.all([
      supabase.rpc('admin_payment_health'),
      supabase.rpc('admin_failed_payments', { p_limit: 100 }),
      supabase.rpc('admin_payment_processor_health'),
    ])
    let m = false
    if (hRes.error) { if (isMissingFunction(hRes.error)) m = true; else setErr(hRes.error.message); setHealth(null) } else setHealth(hRes.data)
    if (fRes.error) { if (isMissingFunction(fRes.error)) m = true; setFailed([]) } else setFailed(Array.isArray(fRes.data) ? fRes.data : [])
    if (pRes.error) { if (isMissingFunction(pRes.error)) m = true; setProcs([]) } else setProcs(Array.isArray(pRes.data) ? pRes.data : [])
    setMissing(m)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function onRetry(invoiceId) {
    setBusy((b) => ({ ...b, [invoiceId]: 'retry' }))
    try {
      const { data, error } = await supabase.functions.invoke('admin-retry-payment', {
        body: { invoice_id: invoiceId },
      })
      if (error) throw error
      if (data?.ok) {
        toast.success(`Retry: ${data.status}`)
        refresh()
      } else {
        toast.warning(`Retry: ${data?.error || 'failed'}`)
      }
    } catch (e) {
      toast.error('Retry failed', { description: e?.message || 'Retry failed' })
    } finally {
      setBusy((b) => { const c = { ...b }; delete c[invoiceId]; return c })
    }
  }

  function emailLink(row) {
    if (!row.owner_email) return null
    const subject = encodeURIComponent(`Action needed: invoice ${row.number || ''}`.trim())
    const body = encodeURIComponent(
      `Hi,\n\nWe noticed your latest invoice (${row.number || row.invoice_id}) for ${fmtCents(row.amount_due_cents)} is past due. Could you confirm the payment method on file is up to date?\n\nThanks,\nThe Orin team`
    )
    return `mailto:${row.owner_email}?subject=${subject}&body=${body}`
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageTitle title="Payments" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Payments</h1>
          <p className="text-sm text-slate-500">Failed-payment recovery + processor health.</p>
        </div>
        <RefreshButton onClick={refresh} loading={loading} label="Refresh payments" />
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 120 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">120_payment_intelligence.sql</code>.
        </Banner>
      )}
      {err && !missing && <ErrorCard title="Couldn't load payments" error={err} onRetry={refresh} />}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total invoices" value={health?.total_invoices ?? '—'} icon={CreditCard} loading={loading} />
        <StatCard label="Paid" value={health?.paid ?? '—'} icon={CheckCircle2} accent="from-emerald-500/40 to-teal-500/40" loading={loading} />
        <StatCard label="Open" value={health?.open ?? '—'} icon={Wallet} accent="from-amber-500/40 to-orange-500/40" loading={loading} />
        <StatCard label="Failed / void" value={health?.failed ?? '—'} icon={AlertCircle} accent="from-rose-500/40 to-red-500/40" loading={loading} />
        <StatCard label="Overdue" value={health?.overdue ?? '—'} icon={AlertCircle} accent="from-rose-500/40 to-pink-500/40" loading={loading} />
      </div>

      {/* Failed payment recovery queue */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        <div className="px-5 py-3 border-b border-slate-800/60">
          <h3 className="text-sm font-medium text-slate-100">Failed payment recovery queue</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Open + uncollectible invoices, oldest first.</p>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={32} rounded="rounded" />))}
            </div>
          ) : failed.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-slate-300">No failed or overdue invoices. Nice.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-medium px-5 py-2.5">Org</th>
                  <th scope="col" className="text-left font-medium px-3 py-2.5">Owner</th>
                  <th scope="col" className="text-left font-medium px-3 py-2.5">Invoice</th>
                  <th scope="col" className="text-left font-medium px-3 py-2.5">Status</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Amount</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Due</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Days</th>
                  <th scope="col" className="text-right font-medium px-5 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((row) => (
                  <tr key={row.invoice_id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-5 py-2.5">
                      <Link to={`/companies/${row.organization_id}`}
                        className="text-slate-200 hover:text-indigo-300 truncate inline-block max-w-[160px]">
                        {row.org_name || row.org_slug}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-400 truncate max-w-[180px]">{row.owner_email || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-300">
                      {row.hosted_invoice_url ? (
                        <a href={row.hosted_invoice_url} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200">
                          {row.number || row.invoice_id.slice(0,8)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (row.number || row.invoice_id.slice(0,8))}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={row.days_overdue > 0 ? 'overdue' : row.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtCents(row.amount_due_cents)}</td>
                    <td className="px-3 py-2.5 text-right text-[11px] text-slate-400">{fmtDate(row.due_date)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                      {row.days_overdue != null ? row.days_overdue : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {row.processor_slug === 'stripe' && (
                          <button
                            onClick={() => onRetry(row.invoice_id)}
                            disabled={busy[row.invoice_id]}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
                            title="Retry charge via Stripe"
                          >
                            <RotateCw className={`w-3 h-3 ${busy[row.invoice_id] === 'retry' ? 'animate-spin' : ''}`} />
                            Retry
                          </button>
                        )}
                        {row.owner_email && (
                          <a href={emailLink(row)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-700 text-slate-200 hover:bg-slate-800/60"
                            title="Email customer">
                            <Mail className="w-3 h-3" />
                            Email
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Per-processor health */}
      <div>
        <h3 className="text-sm font-medium text-slate-200 mb-3">Processor health</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({length:3}).map((_,i)=>(<Skeleton key={i} width="100%" height={120} rounded="rounded-2xl" />))
          ) : procs.length === 0 ? (
            <div className="col-span-full text-sm text-slate-500 text-center py-8">No processor data.</div>
          ) : (
            procs.map((p) => (
              <div key={p.slug} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-100">{p.display_name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{p.slug}</span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1.5">
                  <div className="flex justify-between"><span>Connections</span><span className="tabular-nums">{p.active_connections} / {p.connections}</span></div>
                  <div className="flex justify-between"><span>Last paid</span><span>{fmtDate(p.last_paid_at)}</span></div>
                  <div className="flex justify-between"><span>Last failure</span><span>{fmtDate(p.last_failure_at)}</span></div>
                  <div className="flex justify-between">
                    <span>Success rate (7d)</span>
                    <span className={p.success_rate_7d == null ? 'text-slate-500' :
                      Number(p.success_rate_7d) >= 95 ? 'text-emerald-300' :
                      Number(p.success_rate_7d) >= 80 ? 'text-amber-300' : 'text-rose-300'}>
                      {p.success_rate_7d != null ? `${Number(p.success_rate_7d).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
