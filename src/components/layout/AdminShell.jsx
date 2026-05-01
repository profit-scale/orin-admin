import AdminSidebar from './AdminSidebar'
import AdminHeader from './AdminHeader'

export default function AdminShell({ user, onSignOut, children }) {
  return (
    <div className="min-h-screen flex">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader user={user} onSignOut={onSignOut} />
        <main className="flex-1 px-8 py-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
