/**
 * Pill renderer for super_admin role. One of: owner, admin, support, readonly.
 */
const STYLES = {
  owner:    'bg-violet-500/15 text-violet-200 border-violet-500/30',
  admin:    'bg-indigo-500/15 text-indigo-200 border-indigo-500/30',
  support:  'bg-sky-500/15 text-sky-200 border-sky-500/30',
  readonly: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

export default function RoleBadge({ role }) {
  const cls = STYLES[role] || STYLES.readonly
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-wide ${cls}`}>
      {role || 'unknown'}
    </span>
  )
}
