import { useEffect, useState } from 'react'
import { X, ChevronRight, User, Building2 } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Skeleton from '../ui/Skeleton'

/**
 * Slide-in drawer showing every recent occurrence of a single
 * fingerprint, with full stack trace, breadcrumbs and meta.
 *
 * Closes when the user clicks the backdrop or hits Escape.
 *
 * Props:
 *   - fingerprint : string | null  (open when set)
 *   - onClose     : () => void
 *   - onResolved  : (fp, resolved) => void  (called after toggle)
 */
export default function IssueDrawer({ fingerprint, onClose, onResolved }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    if (!fingerprint) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('admin_error_occurrences', { p_fingerprint: fingerprint, p_limit: 20 })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message || 'Failed to load occurrences')
        else setRows(Array.isArray(data) ? data : [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [fingerprint])

  // Close on Escape
  useEffect(() => {
    if (!fingerprint) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fingerprint, onClose])

  if (!fingerprint) return null

  const example = rows[0] || null

  const handleToggleResolve = async (resolve) => {
    setActing(true)
    try {
      const { error } = await supabase.rpc('admin_resolve_error_group', {
        p_fingerprint: fingerprint,
        p_resolve: resolve,
      })
      if (!error) {
        onResolved?.(fingerprint, resolve)
        onClose?.()
      } else {
        setError(error.message)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-slate-950/70 backdrop-blur-sm cursor-default"
      />
      {/* Drawer */}
      <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              Issue · <code className="font-mono">{fingerprint}</code>
            </p>
            <h2 className="text-base font-semibold text-slate-100 truncate">
              {example?.message || (loading ? 'Loading…' : '—')}
            </h2>
            {example && (
              <p className="text-xs text-slate-500 mt-1">
                Last seen {fmtRelative(example.last_seen_at)} ·{' '}
                first seen {fmtRelative(example.first_seen_at)} ·{' '}
                {example.occurrences} occurrence{example.occurrences !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-6 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-4 p-6">
              <Skeleton width="80%" height={20} />
              <Skeleton width="100%" height={120} />
              <Skeleton width="60%" height={20} />
            </div>
          )}

          {!loading && example && (
            <>
              {/* Stack */}
              <Section title="Stack trace">
                <pre className="font-mono text-[11px] leading-relaxed text-slate-300 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-3 overflow-x-auto whitespace-pre">
                  {colorizeStack(example.stack || '(no stack captured)')}
                </pre>
              </Section>

              {/* Breadcrumbs */}
              {Array.isArray(example.breadcrumbs) && example.breadcrumbs.length > 0 && (
                <Section title={`Breadcrumbs (${example.breadcrumbs.length})`}>
                  <ol className="space-y-1.5">
                    {example.breadcrumbs.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px]">
                        <span className="text-slate-600 tabular-nums shrink-0 w-16">
                          {fmtTime(c.t)}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300 font-mono shrink-0 text-[10px] uppercase">
                          {c.category}
                        </span>
                        <span className="text-slate-300">{c.action}</span>
                        {c.data && (
                          <span className="text-slate-500 truncate">
                            {typeof c.data === 'string' ? c.data : JSON.stringify(c.data)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Context */}
              <Section title="Context">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                  <Row label="URL" value={example.url} />
                  <Row label="User agent" value={example.user_agent} mono />
                  <Row label="Release" value={example.release_sha} mono />
                  <Row label="Source" value={example.source} mono />
                </dl>
              </Section>

              {/* Affected users */}
              {rows.length > 1 && (
                <Section title={`Most recent occurrences (${rows.length})`}>
                  <ul className="space-y-1.5 text-[11px]">
                    {rows.slice(0, 5).map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-slate-800/30 border border-slate-800/40"
                      >
                        {r.user_email ? (
                          <>
                            <User className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="text-slate-200 truncate flex-1">{r.user_email}</span>
                          </>
                        ) : (
                          <span className="text-slate-500 italic flex-1">anonymous</span>
                        )}
                        {r.organization_id && (
                          <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                        )}
                        <span className="text-slate-600 tabular-nums shrink-0">
                          {fmtRelative(r.last_seen_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {Object.keys(example.metadata || {}).length > 0 && (
                <Section title="Metadata">
                  <pre className="font-mono text-[10px] text-slate-400 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(example.metadata, null, 2)}
                  </pre>
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={() => handleToggleResolve(true)}
            disabled={acting || !example}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Mark resolved
          </button>
          <button
            onClick={() => handleToggleResolve(false)}
            disabled={acting || !example}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 hover:border-slate-600 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Reopen
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="px-6 py-4 border-b border-slate-800/50">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-2">
        {title}
      </p>
      {children}
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-slate-200 truncate ${mono ? 'font-mono text-[10px]' : ''}`}>
        {value || <span className="text-slate-600 italic">—</span>}
      </dd>
    </>
  )
}

// Light-touch syntax highlighting for stack traces — color file paths
// and "at <fn>" prefixes without depending on a full library.
function colorizeStack(stack) {
  if (!stack) return null
  const lines = stack.split('\n')
  return lines.map((line, i) => {
    const m = line.match(/^(\s*at\s+)?(.+?)(?:\s*\(?(https?:\/\/[^\s)]+|[/\w.\-/]+):(\d+):(\d+)\)?)?$/)
    if (!m) return <div key={i}>{line}</div>
    const [, atPrefix, fn, file, ln, col] = m
    return (
      <div key={i}>
        {atPrefix && <span className="text-slate-600">{atPrefix}</span>}
        <span className="text-slate-100">{fn}</span>
        {file && (
          <>
            <span className="text-slate-600"> (</span>
            <span className="text-violet-300">{file}</span>
            <span className="text-amber-300">:{ln}</span>
            <span className="text-slate-500">:{col}</span>
            <span className="text-slate-600">)</span>
          </>
        )}
      </div>
    )
  })
}

function fmtRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60)        return `${s}s ago`
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`
  if (s < 86_400)    return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

function fmtTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch { return '' }
}
