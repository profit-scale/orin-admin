import { Navigate } from 'react-router-dom'
import { ShieldOff, LogOut } from 'lucide-react'

/**
 * Route guard for the admin portal.
 * - While `loading`: shows a centered spinner
 * - If no user: redirects to /login
 * - If user but not super_admin: full-page "Access denied" with sign-out
 * - Otherwise: renders children
 */
export default function AdminGate({ auth, children }) {
  const { user, isSuperAdmin, loading, signOut } = auth

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
          <p className="text-sm">Verifying admin access</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 mb-5">
            <ShieldOff className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-2">Access denied</h1>
          <p className="text-slate-400 mb-6">
            This portal is for Orin staff only. Your account ({user.email}) is signed in
            but is not authorized as a super admin.
          </p>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return children
}
