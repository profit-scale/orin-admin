import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Gauge,
  Sparkles,
  BarChart3,
  Bug,
  ClipboardList,
  Search as SearchIcon,
  Megaphone,
  Terminal,
  Send,
  ShieldAlert,
  TrendingUp,
  AlertCircle,
  Hourglass,
  HardDrive,
  ToggleLeft,
  Mail,
  Route,
  ShieldCheck,
  Activity,
  Beaker,
  Grid3x3,
  ShieldX,
  Server,
  Webhook,
  Store,
  Globe,
  MessageCircle,
  Flame,
  FileSpreadsheet,
  KeyRound,
} from 'lucide-react'

const navSections = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/companies', label: 'Companies', icon: Building2 },
      { to: '/staff', label: 'Staff', icon: Users },
      { to: '/billing', label: 'Billing', icon: CreditCard },
      { to: '/perf', label: 'Perf', icon: Gauge },
      { to: '/observability', label: 'Observability', icon: Bug },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/revenue',       label: 'Revenue',         icon: TrendingUp },
      { to: '/payments',      label: 'Payments',        icon: AlertCircle },
      { to: '/trials',        label: 'Trials',          icon: Hourglass },
      { to: '/storage',       label: 'Storage',         icon: HardDrive },
      { to: '/flags',         label: 'Feature flags',   icon: ToggleLeft },
      { to: '/campaigns',     label: 'Campaigns',       icon: Mail },
      { to: '/onboarding',    label: 'Onboarding',      icon: Route },
      { to: '/quotas',        label: 'Plan quotas',     icon: ShieldCheck },
      { to: '/edge-logs',     label: 'Edge logs',       icon: Activity },
      { to: '/experiments',   label: 'AI experiments',  icon: Beaker },
      { to: '/cohort',        label: 'Cohort retention',icon: Grid3x3 },
      { to: '/power-users',   label: 'Power users',     icon: Flame },
      { to: '/usage-exports', label: 'Usage exports',   icon: FileSpreadsheet },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/gdpr',        label: 'GDPR',            icon: ShieldX },
      { to: '/incidents',   label: 'Incidents',       icon: Megaphone },
      { to: '/demo',        label: 'Demo orgs',       icon: Server },
      { to: '/webhooks',    label: 'Webhooks',        icon: Webhook },
      { to: '/api-keys',    label: 'Customer API',    icon: KeyRound },
      { to: '/marketplace', label: 'Marketplace',     icon: Store },
      { to: '/failover',    label: 'Failover',        icon: Globe },
      { to: '/feedback',    label: 'Feedback',        icon: MessageCircle },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/audit',        label: 'Audit log',   icon: ClipboardList },
      { to: '/auth-log',     label: 'Auth events', icon: ShieldAlert },
      { to: '/security',     label: 'Threats',     icon: ShieldAlert },
      { to: '/security/2fa', label: '2FA',         icon: ShieldCheck },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/search',         label: 'Search',         icon: SearchIcon },
      { to: '/announcements',  label: 'Announcements',  icon: Megaphone },
      { to: '/sql',            label: 'SQL runner',     icon: Terminal },
      { to: '/api-tester',     label: 'API tester',     icon: Send },
    ],
  },
  {
    label: 'AI',
    items: [
      { to: '/ai',       label: 'AI Settings', icon: Sparkles },
      { to: '/ai/usage', label: 'AI Usage',    icon: BarChart3 },
    ],
  },
]

export default function AdminSidebar({ mobile = false, onClose }) {
  return (
    <aside
      className={[
        'w-60 shrink-0 border-r border-slate-800/60 bg-slate-950/95 backdrop-blur flex flex-col',
        mobile ? 'h-full' : '',
      ].join(' ')}
      aria-label="Primary navigation"
    >
      {/* Logo + (on mobile) close */}
      <div className="px-6 pt-6 pb-8 flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-xl font-semibold tracking-tight bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
            ORIN
          </span>
          <span className="mt-0.5 text-[10px] tracking-[0.3em] text-indigo-400/80 font-medium">
            ADMIN
          </span>
        </div>
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-4 overflow-y-auto" aria-label="Sections">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {section.label && (
              <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-slate-600 font-medium">
                {section.label}
              </div>
            )}
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                    isActive
                      ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border border-transparent',
                  ].join(' ')
                }
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800/60">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Internal portal · v0.1<br />
          admin.orinsuite.com
        </p>
      </div>
    </aside>
  )
}
