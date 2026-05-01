import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Building2 } from 'lucide-react'
import { supabase } from '../services/supabase'

const FN_NOT_FOUND_CODES = new Set(['42883', 'PGRST202', 'PGRST116'])

function formatDate(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return s
  }
}

function formatRelative(s) {
  if (!s) return '—'
  try {
    const now = Date.now()
    const then = new Date(s).getTime()
    const diff = Math.max(0, now - then)
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return formatDate(s)
  } catch {
    return s
  }
}

function formatCurrency(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function StatusPill({ status }) {
  const map = {
    active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    trialing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    paused: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    canceled: 'bg-red-500/15 text-red-300 border-red-500/30',
  }
  const classes = map[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${classes}`}>
      {status || 'unknown'}
    </span>
  )
}

export default function Companies() {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [missingMigrations, setMissingMigrations] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.rpc('admin_orgs_list', {
        p_limit: 50,
        p_offset: 0,
      })
      if (cancelled) return
      if (error) {
        if (FN_NOT_FOUND_CODES.has(error.code) || /function .* does not exist/i.test(error.message || '')) {
          setMissingMigrations(true)
        } else {
          setError(error.message || 'Failed to load companies')
        }
      } else {
        setOrgs(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Companies</h1>
          <p className="text-sm text-slate-500">All organizations on the Orin platform.</p>
        </div>
        {!loading && !missingMigrations && (
          <span className="text-xs text-slate-500">
            {orgs.length} {orgs.length === 1 ? 'company' : 'companies'}
          </span>
        )}
      </div>

      {missingMigrations && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200">
            <strong className="text-amber-100">Migrations not yet applied.</strong>{' '}
            The <code className="px-1 py-0.5 bg-black/30 rounded">admin_orgs_list</code> RPC is missing.
            Apply the admin migrations (067-077) to your Supabase project to enable this page.
          </div>
        </div>
      )}

      {error && !missingMigrations && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-medium px-4 py-3">Company</th>
                <th className="text-left font-medium px-4 py-3">Plan</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Members</th>
                <th className="text-right font-medium px-4 py-3">MRR</th>
                <th className="text-left font-medium px-4 py-3">Created</th>
                <th className="text-left font-medium px-4 py-3">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-800/40">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-800/60 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {!loading && !missingMigrations && orgs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Building2 className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No companies yet.</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Once tenants sign up to Orin, they will appear here.
                    </p>
                  </td>
                </tr>
              )}

              {!loading && orgs.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/companies/${o.id}`}
                      className="text-slate-100 font-medium hover:text-indigo-300 transition"
                    >
                      {o.name || o.slug || o.id}
                    </Link>
                    {o.slug && o.name && (
                      <div className="text-[11px] text-slate-500">{o.slug}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{o.plan || '—'}</td>
                  <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                    {o.member_count ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                    {formatCurrency(o.mrr)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {formatDate(o.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {formatRelative(o.last_activity_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
