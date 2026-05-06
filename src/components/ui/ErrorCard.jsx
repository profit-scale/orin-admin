// ErrorCard — consistent inline "Couldn't load — Retry" card.
// Used across pages when a fetch fails. Folds the actual error message
// into a <details> block so the friendly headline isn't drowned by stack.

import { AlertOctagon, RefreshCw } from 'lucide-react'

export default function ErrorCard({ title = "Couldn't load", error, onRetry, className = '' }) {
  const msg = error?.message || (typeof error === 'string' ? error : null)
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertOctagon className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-rose-100 font-medium">{title}</div>
          {msg && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-rose-300/80 hover:text-rose-200 select-none">
                Error details
              </summary>
              <pre className="mt-1 text-[11px] text-rose-200/70 whitespace-pre-wrap font-mono break-words">
                {msg}
              </pre>
            </details>
          )}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-xs text-rose-200 hover:text-white px-2 py-1 rounded-md border border-rose-500/30 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 transition shrink-0"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
          </button>
        )}
      </div>
    </div>
  )
}
