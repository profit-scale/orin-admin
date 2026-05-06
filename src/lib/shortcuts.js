// ─────────────────────────────────────────────────────────────────────
// shortcuts — single source of truth for the admin keyboard shortcut
// catalog. Consumed by:
//   - useGlobalShortcuts (executes them)
//   - CommandPalette (?-mode + nav results)
//   - ShortcutsHelp modal (renders the table)
//
// New shortcut? Add it here and everything updates.
// ─────────────────────────────────────────────────────────────────────

export const SHORTCUTS = {
  global: [
    { keys: ['⌘', 'K'], desc: 'Open command palette' },
    { keys: ['Ctrl', 'K'], desc: 'Open command palette (Win/Linux)' },
    { keys: ['⌘', 'P'], desc: 'Open palette pre-focused on navigation' },
    { keys: ['?'],        desc: 'Show this shortcuts list' },
    { keys: ['/'],        desc: "Focus the page's primary search input" },
    { keys: ['Esc'],      desc: 'Close any open modal or dialog' },
  ],
  navigate: [
    { key: 'd', label: 'Dashboard',         path: '/' },
    { key: 'c', label: 'Companies',         path: '/companies' },
    { key: 'r', label: 'Revenue',           path: '/revenue' },
    { key: 'p', label: 'Payments',          path: '/payments' },
    { key: 't', label: 'Trials',            path: '/trials' },
    { key: 's', label: 'Storage',           path: '/storage' },
    { key: 'f', label: 'Feature flags',     path: '/flags' },
    { key: 'i', label: 'Incidents',         path: '/incidents' },
    { key: 'a', label: 'Audit log',         path: '/audit' },
    { key: 'x', label: 'Threats / Security',path: '/security' },
    { key: 'o', label: 'Onboarding',        path: '/onboarding' },
    { key: 'q', label: 'Quotas',            path: '/quotas' },
    { key: 'e', label: 'AI experiments',    path: '/experiments' },
    { key: 'h', label: 'Cohort retention',  path: '/cohort' },
  ],
  create: [
    { key: 'a', label: 'New announcement',  action: 'announcement' },
    { key: 'c', label: 'New campaign',      action: 'campaign'     },
    { key: 'd', label: 'New demo org',      action: 'demo'         },
    { key: 'i', label: 'New incident',      action: 'incident'     },
    { key: 'e', label: 'New experiment',    action: 'experiment'   },
  ],
}

// Path that "n <letter>" actions navigate to. The destination page
// hosts its own create UI (most pages already have a "New …" button).
export const CREATE_TARGETS = {
  announcement: '/announcements',
  campaign:     '/campaigns',
  demo:         '/demo',
  incident:     '/incidents',
  experiment:   '/experiments',
}

// Quick actions for the palette > mode.
export const QUICK_ACTIONS = [
  { id: 'broadcast',    label: 'Broadcast announcement', target: '/announcements' },
  { id: 'sql',          label: 'Run SQL',                target: '/sql' },
  { id: 'campaign',     label: 'Send email campaign',    target: '/campaigns' },
  { id: 'experiment',   label: 'Create AI experiment',   target: '/experiments' },
  { id: 'demo',         label: 'Create demo org',        target: '/demo' },
  { id: 'incident',     label: 'Open incident',          target: '/incidents' },
  { id: 'gdpr',         label: 'GDPR export / delete',   target: '/gdpr' },
  { id: 'apitester',    label: 'Test an edge function',  target: '/api-tester' },
  { id: 'flags',        label: 'Toggle a feature flag',  target: '/flags' },
  { id: 'audit',        label: 'View audit log',         target: '/audit' },
]
