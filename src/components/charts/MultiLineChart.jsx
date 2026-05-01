import { useId, useMemo, useState } from 'react'

/**
 * Multi-series SVG line chart with toggleable legend, smooth curves, hover
 * crosshair and a tooltip pill that lists every active series.
 *
 * Props:
 *   series : Array<{
 *     name  : string,
 *     color : hex,
 *     data  : Array<{ date: 'YYYY-MM-DD', value: number }>,
 *   }>  All series MUST share the same x dates in the same order.
 *   height : px (default 260)
 *   formatValue : (n) => string
 *   formatDate  : (s) => string  (for tooltip / x-axis labels)
 */
export default function MultiLineChart({
  series = [],
  height = 260,
  formatValue = (v) => Number(v).toLocaleString(),
  formatDate = (s) => s,
}) {
  const gradId = useId()

  // active toggles, default all on
  const [active, setActive] = useState(() => series.map(() => true))
  const [hoverIdx, setHoverIdx] = useState(null)

  const dates = series[0]?.data?.map((d) => d.date) || []
  const N = dates.length

  const VIEW_W = 800
  const VIEW_H = height
  const PAD_L = 48
  const PAD_R = 16
  const PAD_T = 12
  const PAD_B = 32
  const innerW = VIEW_W - PAD_L - PAD_R
  const innerH = VIEW_H - PAD_T - PAD_B

  const { lines, yMax, xStep } = useMemo(() => {
    if (!N) return { lines: [], yMax: 0, xStep: 0 }
    let yMax = 0
    series.forEach((s, i) => {
      if (active[i]) {
        s.data.forEach((p) => {
          const v = Number(p.value) || 0
          if (v > yMax) yMax = v
        })
      }
    })
    if (yMax === 0) yMax = 1
    // pad ceiling 15%
    yMax = yMax * 1.15
    const xStep = N > 1 ? innerW / (N - 1) : 0

    const lines = series.map((s, idx) => {
      if (!active[idx]) return { ...s, points: [], path: '' }
      const points = s.data.map((p, i) => ({
        x: PAD_L + i * xStep,
        y: PAD_T + innerH - ((Number(p.value) || 0) / yMax) * innerH,
        value: Number(p.value) || 0,
        date: p.date,
      }))
      let path = ''
      if (points.length) {
        path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          const cx1 = prev.x + (curr.x - prev.x) / 2
          const cy1 = prev.y
          const cx2 = prev.x + (curr.x - prev.x) / 2
          const cy2 = curr.y
          path += ` C ${cx1.toFixed(2)} ${cy1.toFixed(2)}, ${cx2.toFixed(2)} ${cy2.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`
        }
      }
      return { ...s, points, path }
    })

    return { lines, yMax, xStep }
  }, [series, active, N, innerW, innerH, PAD_L, PAD_T])

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xRel = ((e.clientX - rect.left) / rect.width) * VIEW_W
    if (xStep <= 0) return
    const idx = Math.round((xRel - PAD_L) / xStep)
    setHoverIdx(Math.max(0, Math.min(N - 1, idx)))
  }

  if (!N) {
    return (
      <div className="text-xs text-slate-500 py-6 text-center">
        No volume data for this window.
      </div>
    )
  }

  // 4 horizontal grid lines
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: PAD_T + innerH - r * innerH,
    label: formatValue(Math.round(yMax * r)),
  }))

  // x-axis: show ~6 evenly spaced dates
  const labelStep = Math.max(1, Math.ceil(N / 6))

  const hoverX = hoverIdx != null ? PAD_L + hoverIdx * xStep : null
  const hoverDate = hoverIdx != null ? dates[hoverIdx] : null

  return (
    <div className="relative w-full">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px]">
        {series.map((s, i) => (
          <button
            key={s.name}
            type="button"
            onClick={() => setActive((a) => a.map((v, j) => (j === i ? !v : v)))}
            className={[
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition',
              active[i]
                ? 'border-slate-700 bg-slate-900/80 text-slate-200'
                : 'border-slate-800 bg-slate-900/40 text-slate-500',
            ].join(' ')}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: active[i] ? s.color : 'rgba(148,163,184,0.3)' }}
            />
            {s.name}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto select-none"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name + i} id={`mlc-${gradId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* y grid + labels */}
        {yTicks.map((t, i) => (
          <g key={`yt-${i}`}>
            <line
              x1={PAD_L}
              y1={t.y}
              x2={VIEW_W - PAD_R}
              y2={t.y}
              stroke="rgba(148,163,184,0.08)"
              strokeDasharray="2 4"
            />
            <text
              x={PAD_L - 6}
              y={t.y + 3}
              textAnchor="end"
              fontSize="10"
              className="fill-slate-500"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* x-axis ticks */}
        {dates.map((d, i) =>
          i % labelStep === 0 || i === N - 1 ? (
            <text
              key={`xt-${i}`}
              x={PAD_L + i * xStep}
              y={VIEW_H - 10}
              textAnchor="middle"
              fontSize="10"
              className="fill-slate-500"
            >
              {formatDate(d)}
            </text>
          ) : null
        )}

        {/* hover crosshair */}
        {hoverX != null && (
          <line
            x1={hoverX}
            y1={PAD_T}
            x2={hoverX}
            y2={PAD_T + innerH}
            stroke="rgba(148,163,184,0.35)"
            strokeDasharray="3 3"
          />
        )}

        {/* lines */}
        {lines.map((s, i) =>
          s.path ? (
            <g key={s.name + i}>
              <path d={s.path} fill="none" stroke={s.color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              {hoverIdx != null && s.points[hoverIdx] && (
                <circle cx={s.points[hoverIdx].x} cy={s.points[hoverIdx].y} r="3.5" fill={s.color} stroke="#020617" strokeWidth="1.5" />
              )}
            </g>
          ) : null
        )}
      </svg>

      {/* tooltip */}
      {hoverIdx != null && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-full pb-2"
          style={{
            left: `${((hoverX || 0) / VIEW_W) * 100}%`,
            top: `${(PAD_T / VIEW_H) * 100}%`,
          }}
        >
          <div className="rounded-lg border border-slate-700 bg-slate-900 shadow-xl px-3 py-2 text-xs whitespace-nowrap">
            <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5">{formatDate(hoverDate)}</div>
            <div className="space-y-0.5">
              {lines.map((s, i) =>
                active[i] && s.points[hoverIdx] ? (
                  <div key={s.name + i} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-300">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                    <span className="text-slate-100 font-semibold tabular-nums">{formatValue(s.points[hoverIdx].value)}</span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
