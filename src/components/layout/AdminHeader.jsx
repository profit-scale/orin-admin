import { LogOut, ShieldCheck, Search, Menu } from 'lucide-react'

export default function AdminHeader({ user, onSignOut, onOpenPalette, onToggleNav }) {
  const email = user?.email ?? 'unknown'
  const initials = email.charAt(0).toUpperCase()

  return (
    <header
      className="h-14 border-b border-slate-800/60 bg-slate-950/40 backdrop-blur px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3"
      role="banner"
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onToggleNav}
          aria-label="Toggle navigation"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-300 hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition"
        >
          <Menu className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
          <span>Super admin session</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Command palette trigger — also shows the keybind hint */}
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette (Cmd+K)"
          title="Command palette · ⌘K"
          className="inline-flex items-center gap-2 px-2 sm:px-3 h-9 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200 hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline text-xs">Search…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-slate-700 bg-slate-800/60 text-[10px] font-mono text-slate-300">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-semibold text-white shrink-0"
            aria-hidden="true"
          >
            {initials}
          </div>
          <span className="text-sm text-slate-300 hidden sm:inline truncate max-w-[180px]">
            {email}
          </span>
        </div>
        <button
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
