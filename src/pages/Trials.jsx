import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Hourglass,
  Mail,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import StatCard from '../components/ui/StatCard'
import Modal from '../components/ui/Modal'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'

function ScoreChip({ score }) {
  const tone =
    score == null   ? 'bg-slate-500/15 text-slate-300 border-slate-500/30' :
    score >= 70     ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' :
    score >= 40     ? 'bg-amber-500/15 text-amber-200 border-amber-500/30' :
    'bg-rose-500/15 text-rose-200 border-rose-500/30'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] tabular-nums ${tone}`}>{score ?? '—'}</span>
}

export default function Trials() {
  const [active, setActive]     = useState([])
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [missing, setMissing]   = useState(false)
  const [composeFor, setComposeFor] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const [a, h] = await Promise.all([
      supabase.rpc('admin_trials_active'),
      supabase.rpc('admin_trial_conversion_history', { p_months: 6 }),
    ])
    let m = false
    if (a.error) { if (isMissingFunction(a.error)) m = true; setActive([]) } else setActive(Array.isArray(a.data)?a.data:[])
    if (h.error) { if (isMissingFunction(h.error)) m = true; setHistory([]) } else setHistory(Array.isArray(h.data)?h.data:[])
    setMissing(m)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const cohortPct = useMemo(() => {
    if (history.length === 0) return null
    const last = history[history.length - 1]
    return last?.conversion_pct
  }, [history])

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageTitle title="Trials" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Trials</h1>
          <p className="text-sm text-slate-500">Active trial orgs + cohort conversion history.</p>
        </div>
        <RefreshButton onClick={refresh} loading={loading} label="Refresh trials" />
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 121 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">121_trial_tracking.sql</code>.
        </Banner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active trials" value={active.length} icon={Hourglass} loading={loading} />
        <StatCard label="Avg conversion score"
          value={loading || active.length===0 ? '—' :
            Math.round(active.reduce((s,a)=>s + (Number(a.conversion_score)||0), 0) / active.length)}
          icon={TrendingUp}
          accent="from-emerald-500/40 to-teal-500/40"
          loading={loading}
        />
        <StatCard label="Last cohort conversion %"
          value={cohortPct != null ? `${Number(cohortPct).toFixed(1)}%` : '—'}
          icon={TrendingUp}
          accent="from-violet-500/40 to-fuchsia-500/40"
          loading={loading}
        />
      </div>

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        <div className="px-5 py-3 border-b border-slate-800/60">
          <h3 className="text-sm font-medium text-slate-100">Active trials (sorted by days left)</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={32} rounded="rounded" />))}
            </div>
          ) : active.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">No active trials.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-medium px-5 py-2.5">Org</th>
                  <th scope="col" className="text-left font-medium px-3 py-2.5">Owner</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Days left</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Score</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Contacts</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Deals</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Msgs</th>
                  <th scope="col" className="text-right font-medium px-5 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {active.map((row) => (
                  <tr key={row.organization_id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-5 py-2.5">
                      <Link to={`/companies/${row.organization_id}`} className="text-slate-200 hover:text-indigo-300 truncate inline-block max-w-[200px]">
                        {row.name || row.slug}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-400 truncate max-w-[200px]">{row.owner_email || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={
                        row.days_left <= 2 ? 'text-rose-300' :
                        row.days_left <= 5 ? 'text-amber-300' :
                        'text-slate-300'
                      }>
                        {row.days_left}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right"><ScoreChip score={row.conversion_score} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{Number(row.contacts_count).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{Number(row.deals_count).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{Number(row.messages_count).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={() => setComposeFor(row)}
                        disabled={!row.owner_email}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-700 text-slate-200 hover:bg-slate-800/60 disabled:opacity-40"
                      >
                        <Mail className="w-3 h-3" /> Reach out
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cohort history */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        <div className="px-5 py-3 border-b border-slate-800/60">
          <h3 className="text-sm font-medium text-slate-100">Cohort conversion (last 6 months)</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">% of orgs from each signup month with at least one paid invoice today.</p>
        </div>
        <div className="p-5">
          {loading ? <Skeleton width="100%" height={120} /> : history.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No cohort data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {history.map((row, i) => {
                const pct = Number(row.conversion_pct) || 0
                return (
                  <div key={i}>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                      <span className="text-slate-300">
                        {new Date(row.cohort_month).toLocaleDateString('en-US', { month:'long', year:'numeric' })}
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        {row.converted}/{row.signups}
                        <span className="text-slate-600 ml-2">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ReachOutModal trial={composeFor} onClose={() => setComposeFor(null)} />
    </div>
  )
}

function ReachOutModal({ trial, onClose }) {
  if (!trial) return null
  const subject = `How's your trial of ${trial.name || 'Orin'} going?`
  const body =
    `Hi,\n\nNoticed you have ${trial.days_left} day${trial.days_left===1?'':'s'} left on your Orin trial. ` +
    `Wanted to make sure you've got everything you need — ${trial.contacts_count > 0 ? `you've added ${trial.contacts_count} contacts already, nice` : 'happy to help you import contacts if that\'s a hangup'}. ` +
    `\n\nIf there's a specific blocker getting in the way, I can hop on a 15-minute call.\n\n— The Orin team`
  const href = `mailto:${trial.owner_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return (
    <Modal open={!!trial} onClose={onClose} title="Reach out to trial">
      <p className="text-sm text-slate-300 mb-3">Suggested copy below — clicking the button opens your email client.</p>
      <div className="space-y-2 text-sm">
        <div><span className="text-slate-500 text-xs">To: </span><span className="text-slate-100 font-mono">{trial.owner_email}</span></div>
        <div><span className="text-slate-500 text-xs">Subject: </span><span className="text-slate-100">{subject}</span></div>
        <pre className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap">{body}</pre>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60">Cancel</button>
        <a href={href} onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white">
          Open mail client
        </a>
      </div>
    </Modal>
  )
}
