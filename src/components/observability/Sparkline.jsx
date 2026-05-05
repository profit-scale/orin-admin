/**
 * Bare-bones SVG sparkline. No deps. Renders 60 minute buckets
 * of error+warning counts as overlaid bars (red for errors,
 * amber for warnings).
 *
 * Props:
 *   - data: Array<{ bucket: ISO string, errors: number, warnings: number }>
 *   - height: pixel height (default 48)
 */
export default function Sparkline({ data = [], height = 48 }) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-slate-800/30 text-[11px] text-slate-600 italic"
        style={{ height }}
      >
        no error activity in the last 60 minutes
      </div>
    )
  }

  const max = Math.max(
    1,
    ...data.map((d) => Number(d.errors || 0) + Number(d.warnings || 0)),
  )
  const w = 100
  const barW = w / data.length

  return (
    <div className="rounded-lg bg-slate-800/30 px-3 py-2">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        {data.map((d, i) => {
          const errors   = Number(d.errors || 0)
          const warnings = Number(d.warnings || 0)
          const totalH = ((errors + warnings) / max) * (height - 4)
          const errH   = (errors / max) * (height - 4)
          const x = i * barW
          return (
            <g key={i}>
              {/* Warnings (sit on top of errors) */}
              {warnings > 0 && (
                <rect
                  x={x + 0.5}
                  width={Math.max(barW - 1, 0.5)}
                  y={height - totalH}
                  height={totalH - errH}
                  fill="#f59e0b"
                  opacity="0.55"
                />
              )}
              {/* Errors */}
              {errors > 0 && (
                <rect
                  x={x + 0.5}
                  width={Math.max(barW - 1, 0.5)}
                  y={height - errH}
                  height={errH}
                  fill="#ef4444"
                  opacity="0.85"
                />
              )}
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[9px] text-slate-600 tabular-nums">
        <span>−60 min</span>
        <span>now</span>
      </div>
    </div>
  )
}
