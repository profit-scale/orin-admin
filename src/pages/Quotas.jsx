import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'

function pctTone(pct) {
  if (pct == null) return 'text-slate-400'
  if (pct >= 100) return 'text-rose-300'
  if (pct >= 95)  return 'text-rose-300'
  if (pct >= 80)  return 'text-amber-300'
  return 'text-slate-300'
}

const METRIC_LABELS = {
  contacts:       'Contacts',
  storage_mb:     'Storage (MB)',
  ai_calls:       'AI calls',
  ai_cost_cents:  'AI cost',
  team_members:   'Team members',
  widgets:        'Widgets',
}

export default function Quotas() {
  const [rows, setRows]       = useState([])
  const [plans, setPlans]     = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const [aRes, pRes] = await Promise.all([
      supabase.rpc('admin_orgs_near_limits'),
      supabase.from('plan_quotas').select('*').order('plan_slug'),
    ])
    let m = false
    if (aRes.error) { if (isMissingFunction(aRes.error)) m = true; setRows([]) } else setRows(Array.isArray(aRes.data)?aRes.data:[])
    if (pRes.error) {
      if (pRes.error.code === '42P01' || /relation .* does not exist/i.test(pRes.error.message || '')) m = true
      setPlans([])
    } else { setPlans(Array.isArray(pRes.data)?pRes.data:[]) }
    setMissing(m)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageTitle title="Plan quotas" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Plan quotas</h1>
          <p className="text-sm text-slate-500">Per-plan limits + orgs near (≥80%) any cap.</p>
        </div>
        <RefreshButton onClick={refresh} loading={loading} label="Refresh quotas" />
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 128 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">128_plan_quotas.sql</code>.
        </Banner>
      )}

      {/* Plans grid */}
      <div>
        <h3 className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-300" /> Plan limits
        </h3>
        {loading ? (
          <Skeleton width="100%" height={120} />
        ) : plans.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No plan_quotas seeded yet.</p>
        ) : (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-medium px-5 py-2.5">Plan</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Contacts</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Storage</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">AI calls/mo</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">AI cost/mo</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Team</th>
                  <th scope="col" className="text-right font-medium px-5 py-2.5">Widgets</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.plan_slug} className="border-b border-slate-800/40 last:border-0">
                    <td className="px-5 py-2.5 text-slate-100">{p.display_name} <span className="text-[11px] text-slate-500 font-mono">({p.plan_slug})</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.max_contacts ?? '∞'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.max_storage_mb != null ? `${p.max_storage_mb} MB` : '∞'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.max_ai_calls_per_month ?? '∞'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.max_ai_cost_cents_per_month != null ? `$${(p.max_ai_cost_cents_per_month/100).toFixed(0)}` : '∞'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.max_team_members ?? '∞'}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{p.max_widgets ?? '∞'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Orgs near limits */}
      <div>
        <h3 className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300" /> Orgs near plan limits (≥80%)
        </h3>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={28} rounded="rounded" />))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">No orgs are at risk. Nice.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                    <th scope="col" className="text-left font-medium px-5 py-2.5">Org</th>
                    <th scope="col" className="text-left font-medium px-3 py-2.5">Plan</th>
                    <th scope="col" className="text-left font-medium px-3 py-2.5">Metric</th>
                    <th scope="col" className="text-right font-medium px-3 py-2.5">Used</th>
                    <th scope="col" className="text-right font-medium px-3 py-2.5">Cap</th>
                    <th scope="col" className="text-right font-medium px-3 py-2.5">%</th>
                    <th scope="col" className="text-right font-medium px-5 py-2.5">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.organization_id}-${r.metric}-${i}`} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                      <td className="px-5 py-2.5">
                        <Link to={`/companies/${r.organization_id}`} className="text-slate-200 hover:text-indigo-300 truncate inline-block max-w-[200px]">
                          {r.name || r.slug}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-400 font-mono">{r.plan}</td>
                      <td className="px-3 py-2.5 text-[12px] text-slate-300">{METRIC_LABELS[r.metric] || r.metric}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{Number(r.used).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{Number(r.cap).toLocaleString()}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${pctTone(Number(r.pct))}`}>
                        {Number(r.pct).toFixed(1)}%
                      </td>
                      <td className="px-5 py-2.5 text-right text-[11px] text-slate-500 truncate max-w-[200px]">{r.owner_email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
