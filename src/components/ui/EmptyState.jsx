/**
 * Centered empty state for tables, lists, and cards.
 * Pass an icon component (from lucide-react) and friendly copy.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`text-center py-12 px-6 ${className}`}>
      {Icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-800/40 border border-slate-800/60 mb-3">
          <Icon className="w-5 h-5 text-slate-500" />
        </div>
      )}
      {title && (
        <p className="text-sm font-medium text-slate-300">{title}</p>
      )}
      {description && (
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
