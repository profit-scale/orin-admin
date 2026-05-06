// ─────────────────────────────────────────────────────────────────────
// CommandPalette — ⌘K spotlight for the admin app.
//
// Modes (cycle with Tab; or type a prefix into the input):
//   default   navigate — every admin route, with their `g x` shortcut
//   `>`       quick actions (impersonate, broadcast, run SQL, …)
//   `@`       cross-org search (live, debounced, hits admin_cross_search)
//   `?`       help — same content as the help modal, scrollable
//
// Footer: ↑ ↓ navigate · Enter select · Tab cycle mode · Esc close.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ChevronRight,
  ArrowUpDown,
  Building2,
  UserCircle2,
  Briefcase,
  Hash,
  ContactRound,
  MessageSquare,
  Bot,
  Zap,
  Keyboard,
  CornerDownLeft,
} from 'lucide-react'
import FocusTrap from './ui/FocusTrap'
import { SHORTCUTS, QUICK_ACTIONS } from '../lib/shortcuts'
import { supabase } from '../services/supabase'

const MODES = ['default', 'action', 'org', 'help']
const MODE_PREFIX = { '>': 'action', '@': 'org', '?': 'help' }
const MODE_PROMPT = {
  default: 'Type a route, page or section…',
  action:  'Quick action — what would you like to do?',
  org:     'Search organizations, users, contacts, deals…',
  help:    'Keyboard shortcuts',
}

function fuzzyMatch(q, text) {
  if (!q) return 1
  const lower = String(text).toLowerCase()
  const Q = q.toLowerCase()
  if (lower.includes(Q)) return 2 + (lower.startsWith(Q) ? 1 : 0)
  // simple subsequence match
  let i = 0
  for (const ch of lower) {
    if (ch === Q[i]) i++
    if (i === Q.length) return 1
  }
  return 0
}

const ORG_ICONS = {
  organization: Building2,
  user: UserCircle2,
  contact: ContactRound,
  deal: Briefcase,
  channel: Hash,
  channel_message: MessageSquare,
  widget_message: Bot,
}

export default function CommandPalette({ open, onClose, initialMode = 'default' }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState(initialMode)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const [orgRows, setOrgRows] = useState([])
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgError, setOrgError] = useState(null)

  // reset on open
  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setQ('')
    setActive(0)
    setOrgRows([])
    setOrgError(null)
  }, [open, initialMode])

  // detect prefix typed -> swap mode
  useEffect(() => {
    if (!q) return
    const head = q[0]
    if (MODE_PREFIX[head]) {
      const next = MODE_PREFIX[head]
      if (next !== mode) {
        setMode(next)
        setQ(q.slice(1))
      }
    }
  }, [q, mode])

  // debounced cross-org search
  useEffect(() => {
    if (!open || mode !== 'org') return
    const term = q.trim()
    if (term.length < 2) {
      setOrgRows([])
      setOrgError(null)
      return
    }
    let cancelled = false
    setOrgLoading(true)
    setOrgError(null)
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('admin_cross_search', {
        p_query: term,
        p_limit: 30,
      })
      if (cancelled) return
      if (error) setOrgError(error.message || 'Search failed')
      else setOrgRows(data || [])
      setOrgLoading(false)
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, mode, open])

  // build current result list
  const results = useMemo(() => {
    if (mode === 'default') {
      // navigation routes
      const term = q.trim()
      const all = [
        ...SHORTCUTS.navigate.map((n) => ({
          kind: 'route',
          id: n.path,
          label: n.label,
          path: n.path,
          shortcut: ['g', n.key],
        })),
        // also include items not in shortcut nav
        { kind: 'route', id: '/staff',         label: 'Staff',         path: '/staff' },
        { kind: 'route', id: '/billing',       label: 'Billing',       path: '/billing' },
        { kind: 'route', id: '/perf',          label: 'Perf',          path: '/perf' },
        { kind: 'route', id: '/observability', label: 'Observability', path: '/observability' },
        { kind: 'route', id: '/auth-log',      label: 'Auth log',      path: '/auth-log' },
        { kind: 'route', id: '/edge-logs',     label: 'Edge logs',     path: '/edge-logs' },
        { kind: 'route', id: '/announcements', label: 'Announcements', path: '/announcements' },
        { kind: 'route', id: '/campaigns',     label: 'Campaigns',     path: '/campaigns' },
        { kind: 'route', id: '/sql',           label: 'SQL runner',    path: '/sql' },
        { kind: 'route', id: '/api-tester',    label: 'API tester',    path: '/api-tester' },
        { kind: 'route', id: '/search',        label: 'Cross-org search', path: '/search' },
        { kind: 'route', id: '/gdpr',          label: 'GDPR',          path: '/gdpr' },
        { kind: 'route', id: '/demo',          label: 'Demo orgs',     path: '/demo' },
        { kind: 'route', id: '/ai',            label: 'AI Settings',   path: '/ai' },
        { kind: 'route', id: '/ai/usage',      label: 'AI Usage',      path: '/ai/usage' },
        // Wave 4 routes
        { kind: 'route', id: '/webhooks',      label: 'Webhooks',      path: '/webhooks' },
        { kind: 'route', id: '/power-users',   label: 'Power users',   path: '/power-users' },
        { kind: 'route', id: '/marketplace',   label: 'Marketplace',   path: '/marketplace' },
        { kind: 'route', id: '/security/2fa',  label: '2FA enrolment', path: '/security/2fa' },
        { kind: 'route', id: '/usage-exports', label: 'Usage exports', path: '/usage-exports' },
        { kind: 'route', id: '/failover',      label: 'Failover',      path: '/failover' },
        { kind: 'route', id: '/feedback',      label: 'Feedback',      path: '/feedback' },
      ]
      // dedupe by id
      const seen = new Set()
      const uniq = all.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      return uniq
        .map((r) => ({ ...r, _score: fuzzyMatch(term, r.label) }))
        .filter((r) => r._score > 0)
        .sort((a, b) => b._score - a._score)
    }
    if (mode === 'action') {
      const term = q.trim()
      return QUICK_ACTIONS.map((a) => ({
        kind: 'action',
        id: a.id,
        label: a.label,
        path: a.target,
        _score: fuzzyMatch(term, a.label),
      }))
        .filter((r) => r._score > 0)
        .sort((a, b) => b._score - a._score)
    }
    if (mode === 'org') {
      return orgRows.map((r) => ({
        kind: 'org',
        id: `${r.type}:${r.id}`,
        label: r.title || r.id,
        sub:
          (r.snippet || '') +
          (r.organization_name ? ` · ${r.organization_name}` : ''),
        type: r.type,
        path:
          r.type === 'organization'
            ? `/companies/${r.id}`
            : r.organization_id
            ? `/companies/${r.organization_id}`
            : null,
      }))
    }
    if (mode === 'help') {
      return [
        ...SHORTCUTS.global.map((s, i) => ({
          kind: 'help', id: `g:${i}`, label: s.desc, keys: s.keys,
        })),
        ...SHORTCUTS.navigate.map((s) => ({
          kind: 'help', id: `n:${s.key}`, label: s.label, keys: ['g', s.key],
        })),
        ...SHORTCUTS.create.map((s) => ({
          kind: 'help', id: `c:${s.key}`, label: s.label, keys: ['n', s.key],
        })),
      ]
    }
    return []
  }, [mode, q, orgRows])

  // clamp active
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)))
  }, [results])

  const choose = useCallback(
    (idx = active) => {
      const r = results[idx]
      if (!r) return
      if (r.kind === 'help') return // help rows are display-only
      if (r.path) {
        navigate(r.path)
        onClose?.()
      }
    },
    [results, active, navigate, onClose],
  )

  // keyboard inside palette
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose?.()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const i = MODES.indexOf(mode)
      const next = MODES[(i + (e.shiftKey ? MODES.length - 1 : 1)) % MODES.length]
      setMode(next)
      setQ('')
      setActive(0)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      choose()
      return
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <FocusTrap active={open} initialFocusRef={inputRef}>
        <div
          className="relative w-full max-w-xl rounded-2xl border border-slate-800/80 bg-slate-900/95 shadow-2xl shadow-black/60 overflow-hidden"
          onKeyDown={onKeyDown}
        >
          {/* mode chip + input */}
          <div className="flex items-center gap-2 px-4 pt-3">
            <ModeChip mode={mode} onSelect={(m) => { setMode(m); setQ(''); setActive(0) }} />
          </div>
          <div className="px-4 pb-3 pt-2 flex items-center gap-2 border-b border-slate-800/60">
            <Search className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={MODE_PROMPT[mode]}
              aria-label="Command palette input"
              className="flex-1 bg-transparent border-none focus:outline-none text-sm text-slate-100 placeholder-slate-600"
            />
          </div>

          {/* result list */}
          <div className="max-h-[50vh] overflow-y-auto" role="listbox">
            {mode === 'org' && orgLoading && (
              <div className="px-4 py-6 text-xs text-slate-500 text-center">Searching…</div>
            )}
            {mode === 'org' && orgError && (
              <div className="px-4 py-3 text-xs text-rose-300 text-center">
                {orgError}
              </div>
            )}
            {!results.length && !(mode === 'org' && orgLoading) && (
              <div className="px-4 py-8 text-xs text-slate-600 text-center">
                {mode === 'org' && q.trim().length < 2
                  ? 'Type at least 2 characters to search across orgs.'
                  : 'No matches.'}
              </div>
            )}
            {results.map((r, i) => (
              <ResultRow
                key={r.id}
                row={r}
                active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              />
            ))}
          </div>

          {/* footer */}
          <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-950/50 flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" aria-hidden="true" /> Navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="w-3 h-3" aria-hidden="true" /> Select
              </span>
              <span>Tab to cycle mode</span>
              <span>Esc to close</span>
            </span>
            <span className="hidden sm:inline">{results.length} results</span>
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}

function ModeChip({ mode, onSelect }) {
  const tabs = [
    { id: 'default', icon: Search,   label: 'Navigate' },
    { id: 'action',  icon: Zap,      label: 'Actions' },
    { id: 'org',     icon: Building2,label: 'Orgs' },
    { id: 'help',    icon: Keyboard, label: 'Help' },
  ]
  return (
    <div className="flex items-center gap-1 text-[10px]">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={mode === id}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
            mode === id
              ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
              : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
          }`}
        >
          <Icon className="w-3 h-3" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

function ResultRow({ row, active, onMouseEnter, onClick }) {
  if (row.kind === 'help') {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-slate-300 border-b border-slate-800/40 last:border-0">
        <span>{row.label}</span>
        <span className="flex items-center gap-1">
          {row.keys.map((k, i) => (
            <kbd key={i} className="px-1.5 py-0.5 rounded-md border border-slate-700 bg-slate-800/60 text-[10px] font-mono text-slate-200">
              {k}
            </kbd>
          ))}
        </span>
      </div>
    )
  }

  const Icon =
    row.kind === 'org'
      ? ORG_ICONS[row.type] || Hash
      : row.kind === 'action'
      ? Zap
      : ChevronRight

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition focus-visible:outline-none ${
        active ? 'bg-indigo-500/15' : 'hover:bg-slate-800/40'
      }`}
    >
      <span
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          active
            ? 'bg-indigo-500/30 text-indigo-100'
            : 'bg-slate-800/50 text-slate-400'
        }`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-100 truncate">{row.label}</span>
        {row.sub && <span className="block text-[11px] text-slate-500 truncate">{row.sub}</span>}
      </span>
      {row.shortcut && (
        <span className="flex items-center gap-1 shrink-0">
          {row.shortcut.map((k, i) => (
            <kbd key={i} className="px-1.5 py-0.5 rounded-md border border-slate-700 bg-slate-800/60 text-[10px] font-mono text-slate-300">
              {k}
            </kbd>
          ))}
        </span>
      )}
      {row.path && !row.shortcut && (
        <span className="text-[10px] text-slate-600 font-mono shrink-0">{row.path}</span>
      )}
    </button>
  )
}
