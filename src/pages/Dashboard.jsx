import { useEffect, useState } from 'react'
import { Building2, DollarSign, Users, Sparkles, AlertTriangle } from 'lucide-react'
import { supabase } from '../services/supabase'

const FN_NOT_FOUND_CODES = new Set(['42883', 'PGRST202', 'PGRST116'])

function formatNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

function formatCurrency(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-5 hover:border-slate-700/80 transition">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-3xl font-semibold text-slate-100">{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [missingMigrations, setMissingMigrations] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.rpc('admin_platform_overview')
      if (cancelled) return
      if (error) {
        if (FN_NOT_FOUND_CODES.has(error.code) || /function .* does not exist/i.test(error.message || '')) {
          setMissingMigrations(true)
        } else {
          setError(error.message || 'Failed to load overview')
        }
      } else {
        setOverview(data)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">Dashboard</h1>
        <p className="text-sm text-slate-500">Platform overview across all Orin tenants.</p>
      </div>

      {missingMigrations && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200">
            <strong className="text-amber-100">Migrations not yet applied.</strong>{' '}
            The <code className="px-1 py-0.5 bg-black/30 rounded">admin_platform_overview</code> RPC is missing.
            Apply the admin migrations (067-077) to your Supabase project to enable this view.
          </div>
        </div>
      )}

      {error && !missingMigrations && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Total Companies"
          value={loading ? <span className="inline-block w-16 h-7 bg-slate-800/60 rounded animate-pulse" /> : formatNumber(overview?.total_companies)}
          accent="bg-indigo-500/20 text-indigo-300"
        />
        <StatCard
          icon={DollarSign}
          label="MRR"
          value={loading ? <span className="inline-block w-20 h-7 bg-slate-800/60 rounded animate-pulse" /> : formatCurrency(overview?.mrr)}
          accent="bg-emerald-500/20 text-emerald-300"
        />
        <StatCard
          icon={Users}
          label="Active Users"
          value={loading ? <span className="inline-block w-16 h-7 bg-slate-800/60 rounded animate-pulse" /> : formatNumber(overview?.active_users)}
          accent="bg-violet-500/20 text-violet-300"
        />
        <StatCard
          icon={Sparkles}
          label="Trialing"
          value={loading ? <span className="inline-block w-12 h-7 bg-slate-800/60 rounded animate-pulse" /> : formatNumber(overview?.trialing)}
          accent="bg-amber-500/20 text-amber-300"
        />
      </div>

      <div className="mt-8 text-xs text-slate-600">
        More widgets coming soon (signups by week, churn, top tenants, etc).
      </div>
    </div>
  )
}
