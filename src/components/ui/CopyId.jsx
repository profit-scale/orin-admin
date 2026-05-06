// CopyId — truncated ID + click-to-copy.
// Displays e.g. "7f3a378…" with a copy icon on hover. Click anywhere on
// the chip to copy the full string + show a tiny check confirmation.

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { truncateId } from '../../lib/format'
import { toast } from './Toast'

export default function CopyId({ value, head = 7, tail = 0, className = '', label }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-slate-600">—</span>

  const display = truncateId(value, head, tail)

  async function copy(e) {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast.success('Copied', { description: `${label || 'Identifier'} copied to clipboard` })
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      aria-label={`Copy ${label || 'identifier'}`}
      className={`group inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded transition ${className}`}
    >
      <span>{display}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" aria-hidden="true" />
      )}
    </button>
  )
}
