import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { isConfigured } from './services/supabase'
import AdminGate from './components/auth/AdminGate'
import AdminLoginPage from './components/auth/AdminLoginPage'
import AdminShell from './components/layout/AdminShell'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Staff from './pages/Staff'
import Billing from './pages/Billing'
import Perf from './pages/Perf'
import AI from './pages/AI'
import AIUsage from './pages/AIUsage'
import AdminAuthCallback from './pages/AdminAuthCallback'

// Lazy — observability bundle has its own dependencies (sparkline,
// drawer, realtime subscription) that we don't need on the
// dashboard route.
const Observability = lazy(() => import('./pages/Observability'))

// Wave 1 — admin tools. All lazy so the main dashboard bundle stays small.
const AuditLog       = lazy(() => import('./pages/AuditLog'))
const CrossSearch    = lazy(() => import('./pages/CrossSearch'))
const Announcements  = lazy(() => import('./pages/Announcements'))
const SqlRunner      = lazy(() => import('./pages/SqlRunner'))
const ApiTester      = lazy(() => import('./pages/ApiTester'))
const AuthLog        = lazy(() => import('./pages/AuthLog'))

// Wave 2 — Insights group. Lazy.
const Revenue     = lazy(() => import('./pages/Revenue'))
const Payments    = lazy(() => import('./pages/Payments'))
const Trials      = lazy(() => import('./pages/Trials'))
const Storage     = lazy(() => import('./pages/Storage'))
const Flags       = lazy(() => import('./pages/Flags'))
const Campaigns   = lazy(() => import('./pages/Campaigns'))
const Onboarding  = lazy(() => import('./pages/Onboarding'))
const Quotas      = lazy(() => import('./pages/Quotas'))
const EdgeLogs    = lazy(() => import('./pages/EdgeLogs'))

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
    </div>
  )
}
function L({ Component }) {
  // eslint-disable-next-line no-unused-vars -- React component capitalisation lint quirk
  const C = Component
  return (
    <Suspense fallback={<LazyFallback />}>
      <C />
    </Suspense>
  )
}

// Shown when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing — most
// commonly on a fresh Netlify deploy where the env vars haven't been set.
// Replaces the previous behaviour of throwing inside createClient and
// rendering nothing (the famous "blue screen of nothing").
function ConfigRequiredScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="max-w-lg w-full rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-8 shadow-2xl">
        <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold mb-3">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Setup required
        </div>
        <h1 className="text-2xl font-bold mb-2">Orin Admin needs a Supabase URL + key</h1>
        <p className="text-slate-300 mb-5 leading-relaxed">
          The build is up but the environment variables aren&apos;t set, so the app
          can&apos;t talk to the database yet.
        </p>
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 mb-5">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Add these in Netlify</div>
          <div className="space-y-2 font-mono text-[13px]">
            <div><span className="text-violet-300">VITE_SUPABASE_URL</span> <span className="text-slate-500">=</span> https://&lt;project-ref&gt;.supabase.co</div>
            <div><span className="text-violet-300">VITE_SUPABASE_ANON_KEY</span> <span className="text-slate-500">=</span> &lt;anon public key&gt;</div>
          </div>
        </div>
        <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
          <li>Netlify dashboard → this site → <span className="text-slate-100 font-medium">Site settings</span> → <span className="text-slate-100 font-medium">Environment variables</span></li>
          <li>Add the two variables above (values from <a className="text-violet-400 hover:underline" href="https://supabase.com/dashboard/project/_/settings/api" target="_blank" rel="noreferrer">Supabase dashboard → Settings → API</a>)</li>
          <li>Trigger a redeploy: <span className="text-slate-100 font-medium">Deploys → Trigger deploy → Clear cache and deploy site</span></li>
        </ol>
      </div>
    </div>
  )
}

export default function App() {
  // Call hooks unconditionally to satisfy the rules-of-hooks lint, then
  // early-return on the config gate. `isConfigured` is a module-level
  // constant so this branch resolves identically every render.
  const auth = useAuth()
  if (!isConfigured) return <ConfigRequiredScreen />

  return (
    <BrowserRouter>
      <Routes>
        {/* Public: OAuth callback. Must live OUTSIDE AdminGate so the
            unauthenticated round-trip from Google can complete. */}
        <Route path="/auth/callback" element={<AdminAuthCallback />} />

        <Route
          path="/login"
          element={
            auth.user && auth.isSuperAdmin
              ? <Navigate to="/" replace />
              : <AdminLoginPage auth={auth} />
          }
        />
        <Route
          path="/*"
          element={
            <AdminGate auth={auth}>
              <AdminShell user={auth.user} onSignOut={auth.signOut}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/companies" element={<Companies />} />
                  <Route path="/companies/:id" element={<CompanyDetail />} />
                  <Route path="/staff" element={<Staff />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/perf" element={<Perf />} />
                  <Route
                    path="/observability"
                    element={
                      <Suspense
                        fallback={
                          <div className="flex items-center justify-center py-24">
                            <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                          </div>
                        }
                      >
                        <Observability />
                      </Suspense>
                    }
                  />
                  <Route path="/ai" element={<AI />} />
                  <Route path="/ai/usage" element={<AIUsage />} />
                  <Route path="/audit"          element={<L Component={AuditLog} />} />
                  <Route path="/search"         element={<L Component={CrossSearch} />} />
                  <Route path="/announcements"  element={<L Component={Announcements} />} />
                  <Route path="/sql"            element={<L Component={SqlRunner} />} />
                  <Route path="/api-tester"     element={<L Component={ApiTester} />} />
                  <Route path="/auth-log"       element={<L Component={AuthLog} />} />
                  {/* Wave 2 */}
                  <Route path="/revenue"     element={<L Component={Revenue} />} />
                  <Route path="/payments"    element={<L Component={Payments} />} />
                  <Route path="/trials"      element={<L Component={Trials} />} />
                  <Route path="/storage"     element={<L Component={Storage} />} />
                  <Route path="/flags"       element={<L Component={Flags} />} />
                  <Route path="/campaigns"   element={<L Component={Campaigns} />} />
                  <Route path="/onboarding"  element={<L Component={Onboarding} />} />
                  <Route path="/quotas"      element={<L Component={Quotas} />} />
                  <Route path="/edge-logs"   element={<L Component={EdgeLogs} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AdminShell>
            </AdminGate>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
