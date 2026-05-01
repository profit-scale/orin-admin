/**
 * Pill renderer for subscription / billing status.
 * Statuses: trialing, active, past_due, canceled, incomplete, paused,
 *           paid, open, draft, void, uncollectible.
 */
const STYLES = {
  active:        'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  trialing:      'bg-amber-500/15 text-amber-200 border-amber-500/30',
  past_due:      'bg-red-500/15 text-red-300 border-red-500/30',
  canceled:      'bg-slate-500/15 text-slate-300 border-slate-500/30',
  incomplete:    'bg-orange-500/15 text-orange-300 border-orange-500/30',
  paused:        'bg-slate-500/15 text-slate-300 border-slate-500/30',
  // billing_invoices statuses
  paid:          'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  open:          'bg-amber-500/15 text-amber-200 border-amber-500/30',
  draft:         'bg-slate-500/15 text-slate-400 border-slate-500/30',
  void:          'bg-slate-600/15 text-slate-400 border-slate-600/30',
  uncollectible: 'bg-red-500/15 text-red-300 border-red-500/30',
}

export default function StatusBadge({ status }) {
  const cls = STYLES[status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  const label = (status || 'unknown').replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-wide ${cls}`}>
      {label}
    </span>
  )
}
