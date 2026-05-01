/**
 * Minimal controlled tabs primitive. The parent owns the active tab id.
 *
 * Props:
 *   - tabs   : Array<{ id: string, label: ReactNode, count?: number | string }>
 *   - active : string (the active tab id)
 *   - onChange : (id: string) => void
 */
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="border-b border-slate-800/60">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              onClick={() => onChange?.(t.id)}
              className={[
                'relative px-4 py-2.5 text-sm font-medium transition whitespace-nowrap',
                isActive
                  ? 'text-indigo-200'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              <span className="inline-flex items-center gap-2">
                {t.label}
                {t.count != null && (
                  <span
                    className={[
                      'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] tabular-nums',
                      isActive
                        ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30'
                        : 'bg-slate-800/60 text-slate-400 border border-slate-700/60',
                    ].join(' ')}
                  >
                    {t.count}
                  </span>
                )}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-gradient-to-r from-indigo-400 to-violet-400" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
