/**
 * Animated placeholder bar. Composable into rows/cards for loading states.
 * Pass `width` and `height` as Tailwind-friendly inline styles, or use className.
 */
export default function Skeleton({
  className = '',
  width,
  height = '0.875rem',
  rounded = 'rounded-md',
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block bg-slate-800/60 ${rounded} animate-pulse ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}
