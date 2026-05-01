import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AdminGate from './components/auth/AdminGate'
import AdminLoginPage from './components/auth/AdminLoginPage'
import AdminShell from './components/layout/AdminShell'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Staff from './pages/Staff'

export default function App() {
  const auth = useAuth()

  return (
    <BrowserRouter>
      <Routes>
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
