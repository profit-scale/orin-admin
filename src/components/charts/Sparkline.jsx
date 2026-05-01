import { useId, useMemo } from 'react'

/**
 * Tiny pure-SVG sparkline. No axes, no fluff — just a smooth curve and an
 * optional area fill. Designed to live at the bottom of small stat tiles.
 *
 * Props:
 *   data        : number[] (or {value:number}[]). Empty/null safe.
 *   color       : stroke color (default indigo-400).
 *   height      : px (default 36)
 *   strokeWidth : default 1.5
 *   filled      : draw a faded area under the line (default true)
 *   showLastDot : draw a small dot at the most recent point (default true)
 */
export default function Sparkline({
  data = [],
  color = '#818cf8',
  height = 36,
  strokeWidth = 1.5,
  filled = true,
  showLastDot = true,
}) {
  const gradId = useId()

  const series = useMemo(() => {
    if (!Array.isArray(data)) return []
    return data
      .map((d) => (typeof d === 'number' ? d : Number(d?.value ?? 0)))
      .map((n) => (Number.isFinite(n) ? n : 0))
  }, [data])

  const W = 200
  const H = height
  const PAD = 2

  const path = useMemo(() => {
    if (series.length < 2) return { line: '', area: '', last: null }
    const max = Math.max(...series, 1)
    const min = Math.min(...series, 0)
    const span = max - min || 1
    const innerW = W - PAD * 2
    const innerH = H - PAD * 2
    const step = innerW / (series.length - 1)

    const pts = series.map((v, i) => ({
      x: PAD + i * step,
      y: PAD + innerH - ((v - min) / span) * innerH,
    }))

    // smooth (cardinal-ish) using simple cubic to next point
    let line = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const curr = pts[i]
      const cx1 = prev.x + (curr.x - prev.x) / 2
      const cy1 = prev.y
      const cx2 = prev.x + (curr.x - prev.x) / 2
      const cy2 = curr.y
      line += ` C ${cx1.toFixed(2)} ${cy1.toFixed(2)}, ${cx2.toFixed(2)} ${cy2.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`
    }
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${(H - PAD).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(H - PAD).toFixed(2)} Z`
    return { line, area, last: pts[pts.length - 1] }
  }, [series, H])

  if (series.length < 2) {
    // render a flat line baseline as the "empty" state
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H / 2}
          y2={H / 2}
          stroke={color}
          strokeOpacity="0.25"
          strokeDasharray="2 3"
          strokeWidth={strokeWidth}
        />
      </svg>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={`spark-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={path.area} fill={`url(#spark-${gradId})`} />
        </>
      )}
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLastDot && path.last && (
        <circle
          cx={path.last.x}
          cy={path.last.y}
          r={2}
          fill={color}
          stroke="#020617"
          strokeWidth="1"
        />
      )}
    </svg>
  )
}
