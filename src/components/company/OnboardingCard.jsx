import { useEffect, useState } from 'react'
import { Route, CheckCircle2, Circle } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Skeleton from '../ui/Skeleton'

const LABELS = {
  signup:                    'Sign up',
  first_contact_added:       'Add first contact',
  first_deal_created:        'Create first deal',
  first_message_sent:        'Send first message',
  first_widget_created:      'Create chat widget',
  first_team_member_invited: 'Invite team member',
  first_paid_invoice:        'First paid invoice',
}

export default function OnboardingCard({ orgId }) {
  const [steps, setSteps]   = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase.rpc('admin_onboarding_funnel', { p_org_id: orgId }).then(({ data, error }) => {
      if (error) {
        if (error.code === '42883' || /function .* does not exist/i.test(error.message || '')) setMissing(true)
        setSteps([])
      } else {
        setSteps(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })
  }, [orgId])

  const done = steps.filter((s) => s.achieved).length
  const total = steps.length || 7

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-indigo-300" />
          <h3 className="text-sm font-medium text-slate-100">Onboarding</h3>
        </div>
        {!loading && !missing && (
          <span className="text-[11px] text-slate-400 tabular-nums">{done} / {total}</span>
        )}
      </div>
      <div className="px-5 py-4">
        {missing ? (
          <p className="text-xs text-amber-300">Apply migration 127 to enable.</p>
        ) : loading ? (
          <Skeleton width="100%" height={120} />
        ) : steps.length === 0 ? (
          <p className="text-xs text-slate-500">No onboarding data.</p>
        ) : (
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.step} className="flex items-center gap-2 text-xs">
                {s.achieved
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  : <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                <span className={s.achieved ? 'text-slate-200' : 'text-slate-500'}>
                  {LABELS[s.step] || s.step}
                </span>
                {s.achieved && s.achieved_at && (
                  <span className="ml-auto text-[10px] text-slate-500">
                    {new Date(s.achieved_at).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
