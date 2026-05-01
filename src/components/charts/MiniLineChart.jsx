import { useId, useMemo, useState } from 'react'

/**
 * Pure-SVG line chart with filled area gradient, axis labels, and dot tooltips.
 *
 * Props:
 *   data: Array<{ label: string; value: number }>
 *   height?: number       — overall pixel height (default 220)
 *   color?: string        — stroke color (any CSS color, default indigo-400)
 *   showAxis?: boolean    — show X tick labels + Y range hints (default true)
 *   formatValue?: fn      — formatter for tooltip + Y-axis labels
 */
export default function MiniLineChart({
  data = [],
  height = 220,
  color = '#818cf8',
  showAxis = true,
  formatValue = (v) => String(v),
}) {
  const gradId = useId()
  const [hoverIdx, setHoverIdx] = useState(null)

  const VIEW_W = 800
  const VIEW_H = height
  const PAD_L = showAxis ? 56 : 16
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = showAxis ? 28 : 12
  const innerW = VIEW_W - PAD_L - PAD_R
  const innerH = VIEW_H - PAD_T - PAD_B

  const { points, areaPath, linePath, yMax, yMin, xStep } = useMemo(() => {
    if (!data.length) return { points: [], areaPath: '', linePath: '', yMax: 0, yMin: 0, xStep: 0 }
    const values = data.map((d) => d.value)
    const rawMax = Math.max(...values, 0)
    const rawMin = Math.min(...values, 0)
    const span = rawMax - rawMin || 1
    // pad the top a bit so the line doesn't kiss the ceiling
    const yMax = rawMax + span * 0.15
    const yMin = rawMin
    const ySpan = yMax - yMin || 1
    const xStep = data.length > 1 ? innerW / (data.length - 1) : 0
    const pts = data.map((d, i) => {
      const x = PAD_L + i * xStep
      const y = PAD_T + innerH - ((d.value - yMin) / ySpan) * innerH
      return { x, y, ...d }
    })
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
    const areaPath = pts.length
      ? `${linePath} L ${pts[pts.length - 1].x.toFixed(2)} ${(PAD_T + innerH).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(PAD_T + innerH).toFixed(2)} Z`
      : ''
    return { points: pts, areaPath, linePath, yMax, yMin, xStep }
  }, [data, innerH, innerW, PAD_L, PAD_T])

  if (!data.length) return null

  // Pick which X labels to show — if there are too many, sparsify so they don't collide.
  const labelStep = Math.max(1, Math.ceil(data.length / 12))

  // Y axis: 3 horizontal grid lines (top, mid, bottom).
  const yTicks = [yMax, (yMax + yMin) / 2, yMin]

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xRel = ((e.clientX - rect.left) / rect.width) * VIEW_W
    if (xStep <= 0) return
    const idx = Math.round((xRel - PAD_L) / xStep)
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : null

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto select-none"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y grid lines */}
        {showAxis && yTicks.map((tick, i) => {
          const y = PAD_T + (i * innerH) / 2
          return (
            <g key={i}>
              <line
                x1={PAD_L} y1={y} x2={VIEW_W - PAD_R} y2={y}
                stroke="rgba(148,163,184,0.08)"
                strokeDasharray="2 4"
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500"
                fontSize="11"
              >
                {formatValue(tick)}
              </text>
            </g>
          )
        })}

        {/* Filled area */}
        <path d={areaPath} fill={`url(#area-${gradId})`} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoverIdx === i ? 4.5 : 2.5}
            fill={hoverIdx === i ? color : '#020617'}
            stroke={color}
            strokeWidth="1.5"
          />
        ))}

        {/* X axis labels */}
        {showAxis && points.map((p, i) =>
          i % labelStep === 0 || i === points.length - 1 ? (
            <text
              key={i}
              x={p.x}
              y={VIEW_H - 8}
              textAnchor="middle"
              className="fill-slate-500"
              fontSize="11"
            >
              {p.label}
            </text>
          ) : null
        )}

        {/* Hover crosshair */}
        {hovered && (
          <line
            x1={hovered.x} y1={PAD_T} x2={hovered.x} y2={PAD_T + innerH}
            stroke={color}
            strokeOpacity="0.4"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: `${(hovered.x / VIEW_W) * 100}%`, top: `${(hovered.y / VIEW_H) * 100}%` }}
        >
          <div className="rounded-lg border border-slate-700 bg-slate-900 shadow-xl px-3 py-2 text-xs whitespace-nowrap">
            <div className="text-slate-500 text-[10px] uppercase tracking-wider">{hovered.label}</div>
            <div className="text-slate-100 font-semibold tabular-nums">{formatValue(hovered.value)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
