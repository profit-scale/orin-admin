import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AdminSidebar from './AdminSidebar'
import AdminHeader from './AdminHeader'

export default function AdminShell({ user, onSignOut, onOpenPalette, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Lock body scroll when the drawer is open on mobile.
  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileNavOpen])

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar — always visible at md+ */}
      <div className="hidden md:flex">
        <AdminSidebar />
      </div>

      {/* Mobile drawer + scrim */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <AdminSidebar mobile onClose={() => setMobileNavOpen(false)} />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader
          user={user}
          onSignOut={onSignOut}
          onOpenPalette={onOpenPalette}
          onToggleNav={() => setMobileNavOpen((v) => !v)}
        />
        <main
          id="main-content"
          className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
