import { ShieldCheck } from 'lucide-react'

export default function Staff() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">Staff</h1>
        <p className="text-sm text-slate-500">Manage Orin super admins.</p>
      </div>

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-base font-medium text-slate-100 mb-1">Super admins</h2>
            <p className="text-sm text-slate-400 mb-4">
              Staff with access to this portal. Listing, role changes, and revocation
              will be wired up here once the corresponding RPCs are deployed.
            </p>
            <p className="text-xs text-slate-500">
              For now, manage super admins by inserting into the{' '}
              <code className="px-1 py-0.5 bg-slate-800/80 rounded text-slate-300">super_admins</code>{' '}
              table directly via SQL.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
