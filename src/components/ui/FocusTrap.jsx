// ─────────────────────────────────────────────────────────────────────
// FocusTrap — keep keyboard focus inside `children` while `active`.
//
// Why home-grown? focus-trap-react is ~20kb. We need 50 lines.
//   - Tab cycles through focusable descendants
//   - Shift+Tab wraps to last
//   - On unmount we restore focus to whatever was focused before
//   - Initial focus moves to first focusable child unless user provides one
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

export default function FocusTrap({ active = true, restoreFocus = true, initialFocusRef, children }) {
  const wrapRef = useRef(null)
  const lastFocusedRef = useRef(null)

  useEffect(() => {
    if (!active) return
    lastFocusedRef.current = document.activeElement

    // Move focus inside on mount (next frame so refs settle)
    const id = requestAnimationFrame(() => {
      if (initialFocusRef?.current?.focus) {
        try { initialFocusRef.current.focus() } catch { /* noop */ }
        return
      }
      const root = wrapRef.current
      if (!root) return
      const first = root.querySelector(FOCUSABLE_SELECTOR)
      if (first?.focus) {
        try { first.focus() } catch { /* noop */ }
      }
    })

    function onKey(e) {
      if (e.key !== 'Tab') return
      const root = wrapRef.current
      if (!root) return
      const focusables = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (!focusables.length) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('keydown', onKey)
      if (restoreFocus && lastFocusedRef.current?.focus) {
        try { lastFocusedRef.current.focus() } catch { /* noop */ }
      }
    }
  }, [active, restoreFocus, initialFocusRef])

  return (
    <div ref={wrapRef} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
