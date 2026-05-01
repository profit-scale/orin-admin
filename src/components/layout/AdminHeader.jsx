import { LogOut, ShieldCheck } from 'lucide-react'

export default function AdminHeader({ user, onSignOut }) {
  const email = user?.email ?? 'unknown'
  const initials = email.charAt(0).toUpperCase()

  return (
    <header className="h-14 border-b border-slate-800/60 bg-slate-950/40 backdrop-blur px-8 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
        <span>Super admin session</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-semibold text-white">
            {initials}
          </div>
          <span className="text-sm text-slate-300 hidden sm:inline">{email}</span>
        </div>
        <button
          onClick={onSignOut}
          title="Sign out"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
