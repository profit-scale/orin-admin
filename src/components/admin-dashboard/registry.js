// ─────────────────────────────────────────────────────────────────────
// Admin dashboard widget registry.
//
// This is the admin portal's equivalent of the main app's
// /src/components/dashboard/registry.js. The widget catalog is curated
// here; each widget receives a `ctx` prop (currently empty — global
// scope) and renders its own data fetch.
//
// Layout shape: { version: 1, widgets: [{ id, visible }] }
// ─────────────────────────────────────────────────────────────────────

import {
  MrrSparkWidget,
  ActiveOrgsWidget,
  AiCostMtdWidget,
  ErrorsLast24hWidget,
  RecentSignupsWidget,
  FailedPaymentsWidget,
  AuthFails24hWidget,
  StorageGrowthWidget,
  TopCostlyOrgsWidget,
  HealthBucketsWidget,
} from './widgets.jsx'

export const ADMIN_DASHBOARD_WIDGETS = [
  { id: 'mrr_spark',      label: 'MRR sparkline',     defaultRow: '1/3', component: MrrSparkWidget },
  { id: 'active_orgs',    label: 'Active orgs',       defaultRow: '1/3', component: ActiveOrgsWidget },
  { id: 'ai_cost_mtd',    label: 'AI cost MTD',       defaultRow: '1/3', component: AiCostMtdWidget },
  { id: 'errors_24h',     label: 'Errors last 24h',   defaultRow: '1/3', component: ErrorsLast24hWidget },
  { id: 'auth_fails_24h', label: 'Auth fails 24h',    defaultRow: '1/3', component: AuthFails24hWidget },
  { id: 'failed_pmts',    label: 'Failed payments',   defaultRow: '1/3', component: FailedPaymentsWidget },
  { id: 'recent_signups', label: 'Recent signups',    defaultRow: '1/2', component: RecentSignupsWidget },
  { id: 'top_costly',     label: 'Top costly orgs',   defaultRow: '1/2', component: TopCostlyOrgsWidget },
  { id: 'storage_growth', label: 'Storage growth',    defaultRow: '1/2', component: StorageGrowthWidget },
  { id: 'health_buckets', label: 'Health-score buckets', defaultRow: '1/2', component: HealthBucketsWidget },
]

export const ADMIN_WIDGETS_BY_ID = Object.fromEntries(
  ADMIN_DASHBOARD_WIDGETS.map((w) => [w.id, w])
)

export const ADMIN_DEFAULT_LAYOUT = {
  version: 1,
  widgets: ADMIN_DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true })),
}

export function rowSpan(defaultRow) {
  switch (defaultRow) {
    case 'full': return 6
    case '2/3':  return 4
    case '1/2':  return 3
    case '1/3':  return 2
    default:     return 6
  }
}
export function colSpanClass(defaultRow) {
  switch (defaultRow) {
    case 'full': return 'col-span-6'
    case '2/3':  return 'col-span-6 xl:col-span-4'
    case '1/2':  return 'col-span-6 xl:col-span-3'
    case '1/3':  return 'col-span-6 xl:col-span-2'
    default:     return 'col-span-6'
  }
}
export function packIntoRows(widgets) {
  const rows = []
  let current = { items: [], used: 0 }
  const flush = () => {
    if (current.items.length > 0) rows.push(current)
    current = { items: [], used: 0 }
  }
  for (const w of widgets) {
    const span = rowSpan(w.defaultRow)
    if (current.used + span > 6 || w.defaultRow === 'full') flush()
    current.items.push(w)
    current.used += span
    if (w.defaultRow === 'full' || current.used >= 6) flush()
  }
  flush()
  return rows
}

export function reconcileLayout(saved) {
  const known = new Set(ADMIN_DASHBOARD_WIDGETS.map((w) => w.id))
  const seen = new Set()
  const result = []
  const incoming = Array.isArray(saved?.widgets) ? saved.widgets : []
  for (const w of incoming) {
    if (!w?.id || !known.has(w.id) || seen.has(w.id)) continue
    seen.add(w.id)
    result.push({ id: w.id, visible: w.visible !== false })
  }
  for (const w of ADMIN_DASHBOARD_WIDGETS) {
    if (!seen.has(w.id)) result.push({ id: w.id, visible: true })
  }
  return result
}
