import { useMemo, useState } from 'react'

/**
 * GitHub-style activity heatmap. One cell per day, colour intensity scaled
 * to the max value in the dataset.
 *
 * Props:
 *   data : Array<{ date: string (YYYY-MM-DD), value: number }>
 *   weeks : number of weeks to show, oldest-to-newest (default derived
 *           from data length, rounded up to 7)
 *   color : base color for cells (default indigo)
 *   formatTooltip : (date, value) => string
 */
export default function Heatmap({
  data = [],
  weeks,
  color = '#6366f1',
  formatTooltip = (d, v) => `${d}: ${v.toLocaleString()} events`,
}) {
  const [hover, setHover] = useState(null)

  const { cells, max, totalDays, totalEvents } = useMemo(() => {
    const arr = Array.isArray(data) ? data : []
    const max = Math.max(0, ...arr.map((d) => Number(d.value) || 0))
    const total = arr.reduce((s, d) => s + (Number(d.value) || 0), 0)
    return { cells: arr, max, totalDays: arr.length, totalEvents: total }
  }, [data])

  if (!cells.length) {
    return (
      <div className="text-xs text-slate-500 py-6 text-center">
        Not enough data yet for an activity heatmap.
      </div>
    )
  }

  // group into columns of 7 (Mon..Sun), reading newest at right
  const numWeeks = weeks ?? Math.max(1, Math.ceil(cells.length / 7))
  const padded = [...cells]
  // pre-pad so the first column lines up with the day-of-week of the first date
  const firstDow = (() => {
    if (!cells.length) return 0
    const d = new Date(cells[0].date)
    // 0 = Sunday in JS; we render Mon..Sun, so shift
    const dow = (d.getDay() + 6) % 7
    return dow
  })()
  for (let i = 0; i < firstDow; i++) {
    padded.unshift({ date: '', value: null, _empty: true })
  }
  while (padded.length < numWeeks * 7) {
    padded.push({ date: '', value: null, _empty: true })
  }

  const cellSize = 12
  const cellGap  = 3
  const W = numWeeks * (cellSize + cellGap) - cellGap
  const H = 7 * (cellSize + cellGap) - cellGap

  // build a smooth indigo intensity ramp keyed off `color`
  const intensity = (v) => {
    if (v == null) return 'rgba(30, 41, 59, 0.5)' // slate-800/50, empty
    if (v === 0) return 'rgba(30, 41, 59, 0.85)'  // slate-800/85, zero
    const ratio = max ? Math.min(1, v / max) : 0
    // Map ratio to opacity 0.18..1.0
    const op = 0.18 + ratio * 0.82
    return mixWithOpacity(color, op)
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMinYMin meet"
      >
        {padded.map((c, i) => {
          const col = Math.floor(i / 7)
          const row = i % 7
          const x = col * (cellSize + cellGap)
          const y = row * (cellSize + cellGap)
          const isEmpty = c._empty || c.date === ''
          return (
            <rect
              key={`${i}`}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              rx="2"
              fill={isEmpty ? 'rgba(15, 23, 42, 0.6)' : intensity(Number(c.value) || 0)}
              stroke={isEmpty ? 'transparent' : 'rgba(2,6,23,0.6)'}
              strokeWidth="1"
              className={isEmpty ? '' : 'cursor-pointer transition-opacity hover:opacity-90'}
              onMouseEnter={() => !isEmpty && setHover({ ...c, x, y })}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
      </svg>

      {hover && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-full pb-1.5"
          style={{
            left: `${((hover.x + cellSize / 2) / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
          }}
        >
          <div className="rounded-lg border border-slate-700 bg-slate-900 shadow-xl px-2.5 py-1.5 text-[11px] whitespace-nowrap">
            <div className="text-slate-100 font-medium tabular-nums">
              {formatTooltip(hover.date, Number(hover.value) || 0)}
            </div>
          </div>
        </div>
      )}

      {/* footer: legend + summary */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span className="tabular-nums">
          {totalEvents.toLocaleString()} events across {totalDays} days
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span>Less</span>
          {[0.18, 0.4, 0.6, 0.8, 1].map((op) => (
            <span
              key={op}
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: mixWithOpacity(color, op) }}
            />
          ))}
          <span>More</span>
        </span>
      </div>
    </div>
  )
}

// Convert a hex color to rgba() with opacity.
function mixWithOpacity(hex, opacity) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return hex
  const v = m[1]
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(3)})`
}
