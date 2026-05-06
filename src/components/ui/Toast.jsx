// ─────────────────────────────────────────────────────────────────────
// Toast — tiny zero-dep notification system.
//
// Why not sonner / react-hot-toast? We deliberately keep orin-admin
// dependency-light (the bundle is small and we want it to stay that
// way). 70 lines does the job.
//
// API mirrors sonner so a future swap is mechanical:
//   import { toast } from '../components/ui/Toast'
//   toast.success('Saved')
//   toast.error('Couldn\'t save', { description: e.message })
//   toast.info('Heads up')
//   toast.promise(fn(), { loading, success, error })
//
// Mount once in App.jsx with <Toaster />. Toasts render top-right,
// auto-dismiss after 4s (errors 7s), and can be dismissed by clicking.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, XCircle, X, Loader2 } from 'lucide-react'

const listeners = new Set()
let nextId = 1

function emit(t) {
  listeners.forEach((fn) => fn(t))
}

function makeToast(kind, message, opts = {}) {
  const id = opts.id ?? nextId++
  emit({
    op: 'add',
    toast: {
      id,
      kind,
      message: String(message ?? ''),
      description: opts.description || null,
      duration:
        opts.duration ??
        (kind === 'error' ? 7000 : kind === 'loading' ? 0 : 4000),
    },
  })
  return id
}

function dismiss(id) {
  emit({ op: 'remove', id })
}

export const toast = {
  success: (m, opts) => makeToast('success', m, opts),
  error:   (m, opts) => makeToast('error',   m, opts),
  info:    (m, opts) => makeToast('info',    m, opts),
  warning: (m, opts) => makeToast('warning', m, opts),
  loading: (m, opts) => makeToast('loading', m, opts),
  dismiss,
  // sonner-compatible signature
  promise(promise, { loading, success, error }) {
    const id = makeToast('loading', loading || 'Working…')
    return Promise.resolve(promise).then(
      (val) => {
        dismiss(id)
        const msg = typeof success === 'function' ? success(val) : success
        if (msg) makeToast('success', msg)
        return val
      },
      (err) => {
        dismiss(id)
        const msg =
          typeof error === 'function'
            ? error(err)
            : error || err?.message || 'Something went wrong'
        makeToast('error', msg)
        throw err
      },
    )
  },
}

const KIND_META = {
  success: { Icon: CheckCircle2, ring: 'border-emerald-500/30 bg-emerald-500/10', tx: 'text-emerald-100', sub: 'text-emerald-300/70', icon: 'text-emerald-400' },
  error:   { Icon: XCircle,      ring: 'border-rose-500/30 bg-rose-500/10',       tx: 'text-rose-100',    sub: 'text-rose-300/70',    icon: 'text-rose-400' },
  warning: { Icon: AlertTriangle,ring: 'border-amber-500/30 bg-amber-500/10',     tx: 'text-amber-100',   sub: 'text-amber-300/70',   icon: 'text-amber-400' },
  info:    { Icon: Info,         ring: 'border-sky-500/30 bg-sky-500/10',         tx: 'text-sky-100',     sub: 'text-sky-300/70',     icon: 'text-sky-400' },
  loading: { Icon: Loader2,      ring: 'border-indigo-500/30 bg-indigo-500/10',   tx: 'text-indigo-100',  sub: 'text-indigo-300/70',  icon: 'text-indigo-400 animate-spin' },
}

export function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    function onEvent(ev) {
      if (ev.op === 'add') {
        setItems((cur) => [...cur, ev.toast])
        if (ev.toast.duration > 0) {
          setTimeout(() => {
            setItems((cur) => cur.filter((x) => x.id !== ev.toast.id))
          }, ev.toast.duration)
        }
      } else if (ev.op === 'remove') {
        setItems((cur) => cur.filter((x) => x.id !== ev.id))
      }
    }
    listeners.add(onEvent)
    return () => listeners.delete(onEvent)
  }, [])

  if (!items.length) return null

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const meta = KIND_META[t.kind] || KIND_META.info
        const { Icon } = meta
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto min-w-[280px] max-w-md rounded-xl border ${meta.ring} backdrop-blur shadow-lg shadow-black/30 px-4 py-3 flex items-start gap-3`}
            style={{ animation: 'orinToastIn 180ms ease-out' }}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.icon}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className={`text-sm leading-snug ${meta.tx}`}>{t.message}</div>
              {t.description && (
                <div className={`text-xs mt-1 leading-relaxed ${meta.sub} break-words`}>
                  {t.description}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-slate-500 hover:text-slate-200 transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes orinToastIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default Toaster
