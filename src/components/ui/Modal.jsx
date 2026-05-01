import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * Headless-ish modal primitive. Tailwind only, no portal (rendered inline).
 * Click on backdrop or press Escape to close.
 *
 * Props:
 *   - open       : boolean
 *   - onClose    : () => void
 *   - title      : ReactNode (optional)
 *   - children   : ReactNode (modal body)
 *   - footer     : ReactNode (optional, rendered in a row at bottom)
 *   - size       : 'sm' | 'md' | 'lg' (default 'md')
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
  }[size] || 'max-w-md'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${widthClass} rounded-2xl border border-slate-800/80 bg-slate-900/95 shadow-2xl shadow-black/50`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800/60">
            <div className="text-sm font-medium text-slate-100">{title}</div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-200 transition shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-4 text-sm text-slate-300">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-800/60 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
