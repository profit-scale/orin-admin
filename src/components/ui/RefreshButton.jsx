// RefreshButton — small icon button for manual refetch.
// Used on every data-heavy page. Spins while `loading`. Disabled while
// loading so a spam-click doesn't fire ten requests.

import { RefreshCw } from 'lucide-react'

export default function RefreshButton({ onClick, loading = false, label = 'Refresh', className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/50 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition ${className}`}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
    </button>
  )
}
