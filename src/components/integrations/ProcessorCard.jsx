import { CheckCircle2, ExternalLink, Plug } from 'lucide-react'
import CapabilityBadges from './CapabilityBadges'

/**
 * One tile in the payment-processor gallery.
 *
 * Rendering rules:
 *   - If `connection` is truthy, show "Manage" + a small "Connected" indicator.
 *     If the connection's `is_connected` flag is false (last test failed),
 *     show an amber "Needs attention" sub-pill instead of the green check.
 *   - Otherwise show "Connect".
 *
 * No per-processor logic. Everything visible is read from the catalog row.
 */
export default function ProcessorCard({ processor, connection, onConnect, onManage }) {
  const isConnected = Boolean(connection)
  const isHealthy   = isConnected && connection?.is_connected !== false
  const mode        = connection?.mode

  // Initial / fallback when no logo_url. Use processor slug initial.
  const initial = (processor.display_name || processor.slug || '?').slice(0, 1).toUpperCase()

  return (
    <div
      className="group relative rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-indigo-500/40 hover:bg-slate-900/80 flex flex-col"
    >
      {/* Top row: logo + name + connected indicator */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-indigo-500/20 flex items-center justify-center shrink-0 overflow-hidden">
          {processor.logo_url ? (
            <img
              src={processor.logo_url}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="text-sm font-semibold text-indigo-200">{initial}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100 truncate">
              {processor.display_name}
            </h3>
            {isConnected && (
              isHealthy ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-1.5 py-0.5">
                  Needs attention
                </span>
              )
            )}
            {isConnected && mode && (
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                {mode}
              </span>
            )}
          </div>
          {processor.tagline && (
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {processor.tagline}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {processor.description && (
        <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-3">
          {processor.description}
        </p>
      )}

      {/* Badges */}
      <div className="mb-4">
        <CapabilityBadges processor={processor} max={4} />
      </div>

      {/* Footer: docs link + action button */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-slate-800/60">
        {processor.docs_url ? (
          <a
            href={processor.docs_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-300 transition"
          >
            <ExternalLink className="w-3 h-3" />
            Docs
          </a>
        ) : <span />}
        {isConnected ? (
          <button
            type="button"
            onClick={() => onManage?.(processor, connection)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 text-xs text-slate-200 hover:text-indigo-200 transition"
          >
            Manage
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onConnect?.(processor)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-xs text-indigo-200 transition"
          >
            <Plug className="w-3 h-3" />
            Connect
          </button>
        )}
      </div>
    </div>
  )
}
