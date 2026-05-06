/**
 * Hero stat card for the dashboard. Dark theme, gradient accent stripe,
 * subtle hover lift. Children are optional supplementary nodes.
 */
export default function StatCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  icon: Icon,
  accent = 'from-indigo-500/40 to-violet-500/40',
  loading = false,
  children,
}) {
  const deltaColor =
    deltaTone === 'positive'
      ? 'text-emerald-400'
      : deltaTone === 'negative'
        ? 'text-red-400'
        : 'text-slate-500'

  return (
    <div className="relative rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden hover:border-slate-700/80 hover:bg-slate-900/60 transition group">
      {/* Gradient accent stripe at top */}
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />

      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-medium">
            {label}
          </span>
          {Icon && (
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center text-white/90 ring-1 ring-white/5`} aria-hidden="true">
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
        <div className="text-3xl font-bold text-slate-50 tabular-nums tracking-tight">
          {loading ? (
            <span className="inline-block w-24 h-8 bg-slate-800/60 rounded-md animate-pulse align-middle" />
          ) : (
            value
          )}
        </div>
        {delta && !loading && (
          <div className={`mt-2 text-[11px] ${deltaColor}`}>{delta}</div>
        )}
        {children}
      </div>
    </div>
  )
}
