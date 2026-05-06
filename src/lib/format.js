// ─────────────────────────────────────────────────────────────────────
// Formatters — single source of truth for currency / percentage / dates
// across the admin app. Every page should import from here so we don't
// have 17 slightly-different `formatCurrency` reimplementations.
// ─────────────────────────────────────────────────────────────────────

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})
const usdK = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCurrency(n, { compact = false } = {}) {
  if (n == null || isNaN(n)) return '—'
  return (compact ? usdK : usd).format(Number(n))
}

export function formatPercentage(n, { digits = 1, ofOne = true } = {}) {
  if (n == null || isNaN(n)) return '—'
  const v = ofOne ? Number(n) * 100 : Number(n)
  return `${v.toFixed(digits)}%`
}

export function formatNumber(n, { compact = false, digits = 0 } = {}) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: digits,
  }).format(Number(n))
}

const RELATIVE_BREAKPOINTS = [
  [60, 'second', 1],
  [3600, 'minute', 60],
  [86400, 'hour', 3600],
  [604800, 'day', 86400],
  [2592000, 'week', 604800],
  [31536000, 'month', 2592000],
  [Infinity, 'year', 31536000],
]
const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

export function formatRelative(input) {
  if (!input) return ''
  try {
    const d = input instanceof Date ? input : new Date(input)
    const diffSec = (d.getTime() - Date.now()) / 1000
    const abs = Math.abs(diffSec)
    for (const [limit, unit, divider] of RELATIVE_BREAKPOINTS) {
      if (abs < limit) {
        return rtf.format(Math.round(diffSec / divider), unit)
      }
    }
    return d.toLocaleDateString()
  } catch {
    return ''
  }
}

export function formatDateTime(input) {
  if (!input) return ''
  try {
    const d = input instanceof Date ? input : new Date(input)
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(input)
  }
}

export function formatIsoTooltip(input) {
  if (!input) return ''
  try {
    const d = input instanceof Date ? input : new Date(input)
    return `${d.toLocaleString()} · ${d.toISOString()}`
  } catch {
    return String(input)
  }
}

export function truncateId(id, head = 7, tail = 0) {
  if (!id) return ''
  const s = String(id)
  if (s.length <= head + tail + 1) return s
  return tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : `${s.slice(0, head)}…`
}

export function formatBytes(n) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`
}
