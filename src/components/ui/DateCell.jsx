// DateCell — relative date with hover tooltip showing exact ISO string.
// Used in tables. Server side renders the same way so SSR isn't a worry.

import { formatRelative, formatIsoTooltip } from '../../lib/format'

export default function DateCell({ value, className = '' }) {
  if (!value) return <span className={`text-slate-600 ${className}`}>—</span>
  return (
    <span title={formatIsoTooltip(value)} className={`tabular-nums ${className}`}>
      {formatRelative(value)}
    </span>
  )
}
