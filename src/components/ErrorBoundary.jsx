// ─────────────────────────────────────────────────────────────────────
// ErrorBoundary — wraps the entire admin <Routes>.
//
// On a render-time crash we:
//   1. Show a friendly recovery card (route, message, stack details)
//   2. Ship the error to the existing in-house observability pipeline
//      (POST /functions/v1/observe-capture). The edge fn is shared with
//      the customer app and writes to `error_log` (mig 100).
//   3. Offer a "Reload" button + a "Report this" button that re-sends
//      the error if the auto-ship was lost.
//
// We send via fetch directly (not the supabase-js client) because at
// the moment a render boundary trips, the supabase context could be in
// any state. Plain fetch + the public anon key is the most resilient
// path — same approach the main app uses in src/lib/observe.js.
// ─────────────────────────────────────────────────────────────────────

import React from 'react'
import { AlertOctagon, RefreshCw, Send } from 'lucide-react'

// We import the two values inline so a missing supabase module
// won't itself crash the boundary.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://zvopcktyvffcyvbjrisj.supabase.co'
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b3Bja3R5dmZmY3l2YmpyaXNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjI5OTgsImV4cCI6MjA5MTIzODk5OH0.W2NOcL8IR3YGqLybBkw17kHJ0i5gb_f90XMk9xVcXyY'

const OBSERVE_ENDPOINT = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/observe-capture`

async function shipError(error, errorInfo, route) {
  if (typeof window === 'undefined') return
  const body = {
    errors: [
      {
        level: 'error',
        message: String(error?.message || error || 'unknown render error'),
        error_name: error?.name || 'Error',
        stack: error?.stack || null,
        source: 'orin-admin:react-boundary',
        url: typeof location !== 'undefined' ? location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        metadata: {
          route,
          component_stack: errorInfo?.componentStack || null,
          app: 'orin-admin',
        },
      },
    ],
  }
  try {
    await fetch(OBSERVE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
      },
      body: JSON.stringify(body),
      keepalive: true,
    })
  } catch {
    // The boundary is the last line of defence — never throw from here.
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null, reportSent: false, reporting: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    const route = typeof location !== 'undefined' ? location.pathname : '?'
    shipError(error, info, route).then(() => this.setState({ reportSent: true }))
    // Mirror to console so dev tools shows the original frame.
    // (StrictMode + invariant suppress in production.)
    // eslint-disable-next-line no-console
    console.error('Orin Admin · render boundary caught:', error, info)
  }

  reset = () => {
    this.setState({ error: null, info: null, reportSent: false, reporting: false })
  }

  hardReload = () => {
    if (typeof location !== 'undefined') location.reload()
  }

  resend = async () => {
    this.setState({ reporting: true })
    const route = typeof location !== 'undefined' ? location.pathname : '?'
    await shipError(this.state.error, this.state.info, route)
    this.setState({ reporting: false, reportSent: true })
  }

  render() {
    if (!this.state.error) return this.props.children

    const route = typeof location !== 'undefined' ? location.pathname : '?'
    const msg   = String(this.state.error?.message || this.state.error || 'unknown error')
    const stack = this.state.error?.stack || ''
    const compStack = this.state.info?.componentStack || ''

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div
          role="alert"
          className="max-w-xl w-full rounded-2xl border border-red-500/40 bg-red-950/20 backdrop-blur p-6 shadow-2xl"
        >
          <div className="flex items-center gap-2 text-rose-300 mb-3">
            <AlertOctagon className="w-5 h-5" aria-hidden="true" />
            <h2 className="text-base font-semibold">Something broke</h2>
          </div>
          <p className="text-sm text-slate-300 mb-2">
            The page <code className="px-1 py-0.5 bg-black/30 rounded text-rose-200">{route}</code>{' '}
            hit a render error. The original frame was caught so the rest of the app keeps working.
          </p>
          <p className="text-xs text-rose-200 mb-4 font-mono break-words">{msg}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={this.hardReload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Reload
            </button>
            <button
              onClick={this.resend}
              disabled={this.state.reporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              {this.state.reporting
                ? 'Reporting…'
                : this.state.reportSent
                ? 'Reported'
                : 'Report this'}
            </button>
            <button
              onClick={this.reset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition"
            >
              Try again
            </button>
          </div>

          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer text-slate-300 hover:text-slate-100 mb-1 select-none">
              Error details
            </summary>
            <pre className="mt-2 bg-black/40 border border-slate-800 rounded-lg p-3 overflow-auto max-h-72 whitespace-pre-wrap font-mono text-[11px] leading-snug">
              {stack || '(no stack)'}
              {compStack ? `\n\n--- Component stack ---${compStack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
