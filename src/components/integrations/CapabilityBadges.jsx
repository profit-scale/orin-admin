/**
 * Tiny pill row showing a processor's capability flags + region tags.
 *
 * The gallery shows a dense card; we only render the badges that are TRUE
 * (or non-empty) so each tile stays visually compact. Colors stay in the
 * indigo/violet family for capabilities, slate for regions, so the eye
 * groups them naturally.
 */

const CAPABILITY_LABELS = [
  { key: 'supports_subscriptions',   label: 'Subscriptions' },
  { key: 'supports_refunds',         label: 'Refunds' },
  { key: 'supports_partial_refunds', label: 'Partial refunds' },
  { key: 'supports_saved_methods',   label: 'Saved methods' },
  { key: 'supports_multi_currency',  label: 'Multi-currency' },
  { key: 'supports_webhooks',        label: 'Webhooks' },
]

function Pill({ children, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    slate:  'bg-slate-700/40 text-slate-300 border-slate-700/60',
    amber:  'bg-amber-500/10 text-amber-300 border-amber-500/30',
  }
  return (
    <span
      className={[
        'inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] leading-none whitespace-nowrap',
        tones[tone] || tones.indigo,
      ].join(' ')}
    >
      {children}
    </span>
  )
}

/**
 * Props:
 *   processor : payment_processors row
 *   max       : optional cap on capability badges (regions handled separately)
 */
export default function CapabilityBadges({ processor, max = 4 }) {
  if (!processor) return null

  const caps = CAPABILITY_LABELS
    .filter((c) => Boolean(processor[c.key]))
    .slice(0, max)

  // Regions list — '*' means "global", show that as a single chip.
  const rawRegions = Array.isArray(processor.regions) ? processor.regions : []
  const isGlobal = rawRegions.includes('*')
  const regions = isGlobal ? ['Global'] : rawRegions.slice(0, 4)
  const extraRegions = !isGlobal && rawRegions.length > 4 ? rawRegions.length - 4 : 0

  return (
    <div className="flex flex-wrap gap-1.5">
      {processor.is_beta && <Pill tone="amber">Beta</Pill>}
      {caps.map((c) => (
        <Pill key={c.key} tone="indigo">
          {c.label}
        </Pill>
      ))}
      {regions.map((r) => (
        <Pill key={`region-${r}`} tone="slate">
          {r}
        </Pill>
      ))}
      {extraRegions > 0 && <Pill tone="slate">+{extraRegions}</Pill>}
    </div>
  )
}
