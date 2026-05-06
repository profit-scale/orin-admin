import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, Route } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'

const STEP_LABELS = {
  signup:                    'Sign up',
  first_contact_added:       'Add first contact',
  first_deal_created:        'Create first deal',
  first_message_sent:        'Send first message',
  first_widget_created:      'Create chat widget',
  first_team_member_invited: 'Invite team member',
  first_paid_invoice:        'First paid invoice',
}

export default function Onboarding() {
  const [days, setDays]         = useState(30)
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [missing, setMissing]   = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const { data, error } = await supabase.rpc('admin_onboarding_funnel_aggregate', { p_days: days })
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      setRows([])
    } else {
      setRows(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [days])

  useEffect(() => { refresh() }, [refresh])

  const cohort = rows[0]?.cohort_size || 0

  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageTitle title="Onboarding" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Onboarding funnel</h1>
          <p className="text-sm text-slate-500">% of new orgs hitting each milestone.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="onboarding-range">Range</label>
          <select id="onboarding-range" value={days} onChange={(e)=>setDays(Number(e.target.value))}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <RefreshButton onClick={refresh} loading={loading} label="Refresh funnel" />
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 127 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">127_onboarding_funnel.sql</code>.
        </Banner>
      )}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-6">
        <div className="flex items-center gap-2 mb-5">
          <Route className="w-4 h-4 text-indigo-300" />
          <h3 className="text-sm font-medium text-slate-100">
            Cohort: {cohort} signup{cohort === 1 ? '' : 's'} in last {days}d
          </h3>
        </div>
        {loading ? (
          <div className="space-y-3">
            {Array.from({length:7}).map((_,i)=>(<Skeleton key={i} width="100%" height={36} rounded="rounded-lg" />))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No data.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const pct = Number(r.achieved_pct) || 0
              return (
                <div key={r.step}>
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="inline-flex items-center gap-2 text-slate-200">
                      {r.achieved > 0 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-600" />
                      )}
                      <span>{STEP_LABELS[r.step] || r.step}</span>
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      <span className="text-slate-100">{r.achieved}</span>
                      <span className="text-slate-500"> / {r.cohort_size}</span>
                      <span className="text-slate-600 ml-2">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden">
                    <div className={[
                        'h-full rounded-full transition-all duration-500',
                        pct >= 75 ? 'bg-emerald-400' :
                        pct >= 40 ? 'bg-indigo-400' :
                        pct >= 15 ? 'bg-amber-400' :
                        'bg-rose-400'
                      ].join(' ')}
                      style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
