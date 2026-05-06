// ─────────────────────────────────────────────────────────────────────
// useGlobalShortcuts — keyboard shortcut state machine.
//
// Behaviour
//   ⌘K / Ctrl+K       open command palette
//   ⌘P / Ctrl+P       open palette in nav mode (pre-focused)
//   ?                 open shortcuts help modal
//   Esc               (handled by individual modal — not here)
//   /                 focus the page's primary search input (if any)
//   g <letter>        navigate (g d -> /, g c -> /companies, etc)
//   n <letter>        new <thing> (n a announcement, etc)
//
// The "g" / "n" sequences need a small state machine — we wait up to
// 250ms for the second key. If it arrives we route, otherwise we drop.
//
// All shortcuts are NO-OP when the user is typing in an input/textarea/
// contenteditable — except the global ⌘ ones, which always work.
// ─────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { SHORTCUTS } from '../lib/shortcuts'

const NAV = SHORTCUTS.navigate.reduce((acc, s) => ((acc[s.key] = s.path), acc), {})
const NEW = SHORTCUTS.create.reduce((acc, s) => ((acc[s.key] = s.action), acc), {})

function isTyping(target) {
  if (!target) return false
  const tag = target.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  return false
}

export default function useGlobalShortcuts({ navigate, openPalette, openHelp, onCreate }) {
  useEffect(() => {
    let pending = null            // 'g' | 'n' | null
    let pendingTimer = null

    function clearPending() {
      pending = null
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
    }

    function onKeyDown(e) {
      const meta = e.metaKey || e.ctrlKey
      const k = e.key

      // Global: ⌘K / Ctrl+K — palette
      if (meta && (k === 'k' || k === 'K')) {
        e.preventDefault()
        openPalette?.('default')
        return
      }
      // ⌘P palette (browser print swallows in many browsers, that's fine
      // — they get the palette in the rare case we win the race).
      if (meta && (k === 'p' || k === 'P')) {
        e.preventDefault()
        openPalette?.('default')
        return
      }

      // Don't intercept while typing — palette + help still work because
      // those are meta-shortcuts handled above.
      if (isTyping(e.target)) return

      // Pending sequence (g <letter> / n <letter>)
      if (pending) {
        const lower = k.toLowerCase()
        if (pending === 'g' && NAV[lower]) {
          e.preventDefault()
          clearPending()
          navigate?.(NAV[lower])
          return
        }
        if (pending === 'n' && NEW[lower]) {
          e.preventDefault()
          clearPending()
          onCreate?.(NEW[lower])
          return
        }
        // Not a recognized continuation — drop the pending state.
        clearPending()
        // fall through so a fresh single-letter shortcut can still fire
      }

      // Single-letter shortcuts
      if (k === '?') {
        e.preventDefault()
        openHelp?.()
        return
      }
      if (k === '/') {
        e.preventDefault()
        const el =
          document.querySelector('[data-primary-search]') ||
          document.querySelector('input[type="search"]')
        if (el?.focus) {
          try { el.focus(); el.select?.() } catch { /* noop */ }
        }
        return
      }

      // Sequence starters
      if (k === 'g' || k === 'n') {
        pending = k
        pendingTimer = setTimeout(clearPending, 250)
        // Don't preventDefault — user might be typing somewhere else.
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearPending()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [navigate, openPalette, openHelp, onCreate])
}
