// PageTitle — sets <title> for the browser tab.
// Side-effect-only component: returns nothing, just keeps document.title
// in sync with whatever page renders this. Restore default on unmount.

import { useEffect } from 'react'

const DEFAULT = 'Orin Admin'

export default function PageTitle({ title }) {
  useEffect(() => {
    if (!title) return
    const prev = document.title
    document.title = `${DEFAULT} · ${title}`
    return () => {
      document.title = prev || DEFAULT
    }
  }, [title])
  return null
}
