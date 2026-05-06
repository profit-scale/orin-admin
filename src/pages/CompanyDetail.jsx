import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  ListChecks,
  Search,
  Settings,
  StickyNote,
  Trash2,
  UserCircle2,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import Tabs from '../components/ui/Tabs'
import Modal from '../components/ui/Modal'
import RoleBadge from '../components/admin/RoleBadge'
import StatusBadge from '../components/admin/StatusBadge'
import ImpersonateButton from '../components/admin/ImpersonateButton'
import UsageTab from '../components/company/UsageTab'
import OrgFreezeCard from '../components/company/OrgFreezeCard'
import OrgBudgetCard from '../components/company/OrgBudgetCard'
import ForceActionsCard from '../components/company/ForceActionsCard'
import HealthCard from '../components/company/HealthCard'
import StorageCard from '../components/company/StorageCard'
import OnboardingCard from '../components/company/OnboardingCard'
import FlagsCard from '../components/company/FlagsCard'

const FN_NOT_FOUND_CODES = new Set(['42883', 'PGRST202'])
const APP_URL = 'https://app.orinsuite.com'

// ---------- formatters ----------

function formatDate(s, opts = {}) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(opts.withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    })
  } catch {
    return s
  }
}

function formatRelative(s) {
  if (!s) return '—'
  try {
    const diff = Math.max(0, Date.now() - new Date(s).getTime())
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    return formatDate(s)
  } catch {
    return s
  }
}

function formatCents(c) {
  if (c == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(c / 100)
}

function formatNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

// ---------- shared bits ----------

function PlanBadge({ plan, status }) {
  const isTrial = (plan === 'trial') || (status === 'trialing')
  const cls = isTrial
    ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
    : 'bg-violet-500/15 text-violet-200 border-violet-500/30'
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium tracking-wide ${cls}`}>
      {plan || 'unknown'}
    </span>
  )
}

function Card({ title, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur ${className}`}>
      {(title || action) && (
        <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-100">{title}</h3>
          {action}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ---------- main ----------

export default function CompanyDetail() {
  const { id } = useParams()
  const [activeTab, setActiveTab] = useState('usage')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [partial, setPartial] = useState(false)

  // Allow child tabs (Usage) to request a tab jump via custom event.
  useEffect(() => {
    const onJump = (e) => {
      const target = e?.detail
      if (typeof target === 'string') setActiveTab(target)
    }
    window.addEventListener('admin-tab-jump', onJump)
    return () => window.removeEventListener('admin-tab-jump', onJump)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPartial(false)
    try {
      const { data, error } = await supabase.rpc('admin_org_detail', { p_org_id: id })
      if (error) {
        const isMissing =
          FN_NOT_FOUND_CODES.has(error.code) ||
          /function .* does not exist/i.test(error.message || '')
        if (!isMissing) throw error
        // ---- Fallback to direct queries ----
        setPartial(true)
        const [orgRes, subRes, membersRes, invoicesRes, auditRes] = await Promise.all([
          supabase.from('organizations').select('*').eq('id', id).single(),
          supabase.from('subscriptions').select('*').eq('organization_id', id).maybeSingle(),
          supabase.from('org_members').select('*').eq('organization_id', id),
          supabase.from('billing_invoices').select('*').eq('organization_id', id).order('created_at', { ascending: false }).limit(12),
          supabase.from('admin_audit_log').select('*').eq('target_org_id', id).order('created_at', { ascending: false }).limit(25),
        ])
        if (orgRes.error) throw orgRes.error
        setDetail({
          organization:         orgRes.data || null,
          subscription:         subRes.data || null,
          members:              membersRes.data || [],
          recent_invoices:      invoicesRes.data || [],
          recent_admin_actions: auditRes.data || [],
          usage: {
            members_count:  (membersRes.data || []).filter((m) => m.is_active).length,
            // The rest stays null in fallback mode.
            deals_count:    null,
            contacts_count: null,
            invoices_count: null,
          },
        })
      } else {
        setDetail(data || null)
      }
    } catch (e) {
      setError(e?.message || 'Failed to load company detail')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const org    = detail?.organization || null
  const sub    = detail?.subscription || null
  const members = detail?.members || []
  const invoices = detail?.recent_invoices || []
  const adminActions = detail?.recent_admin_actions || []

  const tabs = useMemo(() => ([
    { id: 'usage',      label: 'Usage' },
    { id: 'members',    label: 'Members',  count: members.length || undefined },
    { id: 'activity',   label: 'Activity' },
    { id: 'operations', label: 'Operations' },
    { id: 'billing',    label: 'Billing',  count: invoices.length || undefined },
    { id: 'ai',         label: 'AI' },
    { id: 'settings',   label: 'Settings' },
  ]), [members.length, invoices.length])

  if (loading) {
    return (
      <div>
        <div className="mb-4 h-4 w-32 bg-slate-800/60 rounded animate-pulse" />
        <div className="mb-6 h-8 w-64 bg-slate-800/60 rounded animate-pulse" />
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 px-5 py-12 text-center">
          <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading company…</p>
        </div>
      </div>
    )
  }

  if (error || !org) {
    return (
      <div>
        <Link
          to="/companies"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to companies
        </Link>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-medium text-red-200 mb-1">Couldn't load this company</h2>
              <p className="text-xs text-red-300">{error || 'Organization not found.'}</p>
              <p className="text-[11px] text-red-400/70 mt-2 font-mono">id: {id}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link
        to="/companies"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to companies
      </Link>

      <CompanyHeader org={org} sub={sub} members={members} />

      {partial && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200">
            <strong className="text-amber-100">Some data may be limited until migrations apply.</strong>{' '}
            The <code className="px-1 py-0.5 bg-black/30 rounded">admin_org_detail</code> RPC is missing — falling back to direct table queries.
            Apply migrations 073-077 to enable richer detail.
          </div>
        </div>
      )}

      <div className="mt-6">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      <div className="mt-6">
        {activeTab === 'usage' && (
          <UsageTab orgId={id} fallbackOrg={org} fallbackSub={sub} members={members} />
        )}
        {activeTab === 'members' && (
          <MembersTab members={members} orgId={id} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab adminActions={adminActions} invoices={invoices} />
        )}
        {activeTab === 'operations' && (
          <OperationsTab orgId={id} org={org} onChanged={load} />
        )}
        {activeTab === 'billing' && (
          <BillingTab orgId={id} sub={sub} invoices={invoices} onRefresh={load} />
        )}
        {activeTab === 'ai' && (
          <AITab orgId={id} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab org={org} orgId={id} onRefresh={load} />
        )}
      </div>
    </div>
  )
}

// ---------- header ----------

function CompanyHeader({ org, sub, members }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const ownerEmail = useMemo(() => {
    const owner = (members || []).find((m) => m.role === 'owner')
    return owner?.email || null
  }, [members])
  const ownerUserId = useMemo(() => {
    const owner = (members || []).find((m) => m.role === 'owner')
    return owner?.user_id || null
  }, [members])

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-indigo-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-slate-100 truncate">
                {org?.name || org?.slug || org?.id}
              </h1>
              {(sub?.plan || sub?.status) && (
                <PlanBadge plan={sub?.plan_label || sub?.plan} status={sub?.status} />
              )}
              {sub?.status && <StatusBadge status={sub.status} />}
              {org?.frozen_at && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-wide bg-rose-500/15 text-rose-200 border-rose-500/30"
                  title={org?.frozen_reason || 'Tenancy frozen'}
                >
                  Frozen
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
              {org?.slug ? `${org.slug} · ` : ''}{org?.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {ownerUserId && (
            <ImpersonateButton
              targetUserId={ownerUserId}
              targetOrgId={org?.id}
              userLabel={ownerEmail || 'owner'}
              size="md"
            >
              Login as Owner
            </ImpersonateButton>
          )}
          <a
            href={`${APP_URL}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in app
          </a>
          <button
            onClick={() => setNotesOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"
          >
            <StickyNote className="w-3.5 h-3.5" />
            Notes
          </button>
        </div>
      </div>

      <Modal
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="Internal notes"
        footer={
          <button
            onClick={() => setNotesOpen(false)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition"
          >
            Close
          </button>
        }
      >
        <p className="text-slate-400">
          Notes are not yet wired up. A future migration will add an{' '}
          <code className="px-1 mx-1 bg-slate-800 rounded text-slate-300">admin_org_notes</code>{' '}
          table for free-form CS notes per organization.
        </p>
      </Modal>
    </div>
  )
}

// ---------- members tab ----------

function MembersTab({ members, orgId }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [expanded, setExpanded] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = members
    if (q) {
      list = members.filter((m) => {
        return [m.full_name, m.email, m.user_id, m.role]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q))
      })
    }
    const arr = [...list]
    if (sortBy === 'name') {
      arr.sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''))
    } else if (sortBy === 'role') {
      arr.sort((a, b) => (a.role || '').localeCompare(b.role || ''))
    } else if (sortBy === 'joined') {
      arr.sort((a, b) => new Date(b.accepted_at || b.invited_at || 0) - new Date(a.accepted_at || a.invited_at || 0))
    }
    return arr
  }, [members, search, sortBy])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members"
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
        >
          <option value="name">Sort: Name</option>
          <option value="role">Sort: Role</option>
          <option value="joined">Sort: Joined</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400 text-center py-6">
            {members.length === 0 ? 'No members yet.' : 'No members match your search.'}
          </p>
        </Card>
      ) : (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium px-4 py-3">Member</th>
                  <th className="text-left font-medium px-4 py-3">Email</th>
                  <th className="text-left font-medium px-4 py-3">Role</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Last seen</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const isOpen = expanded === m.user_id
                  const isInvited = !m.accepted_at
                  return (
                    <Fragment key={m.user_id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : m.user_id)}
                        className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {isOpen
                              ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                              : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                            {m.avatar_url
                              ? <img src={m.avatar_url} alt="" className="w-7 h-7 rounded-full border border-slate-700/60" />
                              : (
                                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center">
                                  <UserCircle2 className="w-4 h-4 text-slate-500" />
                                </div>
                              )
                            }
                            <span className="text-slate-100">
                              {m.full_name || <span className="text-slate-500 italic">unnamed</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{m.email || <span className="text-slate-500">—</span>}</td>
                        <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                        <td className="px-4 py-3">
                          {m.is_active === false ? (
                            <StatusBadge status="paused" />
                          ) : isInvited ? (
                            <StatusBadge status="trialing" />
                          ) : (
                            <StatusBadge status="active" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatRelative(m.last_login)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end">
                            <ImpersonateButton
                              targetUserId={m.user_id}
                              targetOrgId={orgId}
                              userLabel={m.email || m.full_name || 'this user'}
                              size="sm"
                            >
                              Login as
                            </ImpersonateButton>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-950/40 border-b border-slate-800/40">
                          <td colSpan={6} className="px-4 py-3">
                            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                              <div>
                                <dt className="text-slate-500">user_id</dt>
                                <dd className="text-slate-300 font-mono break-all">{m.user_id}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Joined</dt>
                                <dd className="text-slate-300">{formatDate(m.accepted_at || m.invited_at)}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Invited</dt>
                                <dd className="text-slate-300">{formatDate(m.invited_at)}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-500">Active</dt>
                                <dd className="text-slate-300">{m.is_active === false ? 'No' : 'Yes'}</dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- activity tab ----------

function ActivityTab({ adminActions, invoices }) {
  const [filter, setFilter] = useState('all') // 'all' | 'admin' | 'customer'

  const merged = useMemo(() => {
    const items = []
    for (const a of adminActions) {
      items.push({
        kind: 'admin',
        id: a.id,
        when: a.created_at,
        who: a.super_admin_email || a.super_admin_id,
        title: a.action,
        meta: a.metadata,
      })
    }
    for (const inv of invoices) {
      if (inv.status === 'paid') {
        items.push({
          kind: 'customer',
          id: 'inv-paid-' + inv.id,
          when: inv.paid_at || inv.updated_at || inv.created_at,
          who: inv.number || 'Invoice',
          title: 'invoice_paid',
          meta: { amount_cents: inv.amount_paid_cents, hosted: inv.hosted_invoice_url },
        })
      } else {
        items.push({
          kind: 'customer',
          id: 'inv-' + inv.id,
          when: inv.created_at,
          who: inv.number || 'Invoice',
          title: 'invoice_' + (inv.status || 'created'),
          meta: { amount_cents: inv.amount_due_cents, hosted: inv.hosted_invoice_url },
        })
      }
    }
    items.sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))
    return items
  }, [adminActions, invoices])

  const filtered = useMemo(() => {
    if (filter === 'all') return merged
    return merged.filter((i) => i.kind === (filter === 'admin' ? 'admin' : 'customer'))
  }, [merged, filter])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {[
          { id: 'all', label: 'All' },
          { id: 'admin', label: 'Admin actions' },
          { id: 'customer', label: 'Customer activity' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={[
              'px-3 py-1 text-xs rounded-full border transition',
              filter === f.id
                ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400 text-center py-6">No activity to show.</p>
        </Card>
      ) : (
        <Card>
          <ol className="relative pl-5">
            <span className="absolute left-1.5 top-1 bottom-1 w-px bg-slate-800/80" aria-hidden />
            {filtered.map((it) => (
              <ActivityRow key={it.id} item={it} />
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}

function ActivityRow({ item }) {
  const [open, setOpen] = useState(false)
  const isAdmin = item.kind === 'admin'
  return (
    <li className="relative pb-4 last:pb-0 ml-1">
      <span className={[
        'absolute -left-[14px] top-1 w-3 h-3 rounded-full border-2',
        isAdmin
          ? 'bg-indigo-500 border-slate-950'
          : 'bg-emerald-500 border-slate-950',
      ].join(' ')} aria-hidden />
      <div className="text-xs text-slate-200 flex items-center gap-2 flex-wrap">
        <span className="font-medium">{item.who || '—'}</span>
        <span className="text-slate-500">{item.title}</span>
        {item.meta?.amount_cents != null && (
          <span className="text-slate-300">{formatCents(item.meta.amount_cents)}</span>
        )}
        {item.meta?.hosted && (
          <a
            href={item.meta.hosted}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1"
          >
            view
            <ArrowUpRight className="w-3 h-3" />
          </a>
        )}
      </div>
      <p className="text-[11px] text-slate-500">{formatDate(item.when, { withTime: true })}</p>
      {item.meta && Object.keys(item.meta).length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-[11px] text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          metadata
        </button>
      )}
      {open && (
        <pre className="mt-1 p-2 bg-slate-950 border border-slate-800/60 rounded text-[11px] text-slate-400 overflow-auto">
          {JSON.stringify(item.meta, null, 2)}
        </pre>
      )}
    </li>
  )
}

// ---------- billing tab ----------

function BillingTab({ orgId, sub, invoices: rpcInvoices, onRefresh }) {
  const [invoices, setInvoices] = useState(rpcInvoices || [])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)

  // Always re-fetch invoices directly so we have a controllable refresh path.
  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoadingInvoices(true)
      const { data, error } = await supabase
        .from('billing_invoices')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (cancelled) return
      if (!error) setInvoices(data || [])
      setLoadingInvoices(false)
    }
    run()
    return () => { cancelled = true }
  }, [orgId])

  return (
    <div className="space-y-6">
      <Card
        title="Current subscription"
        action={
          <button
            onClick={() => setOverrideOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"
          >
            <Settings className="w-3 h-3" />
            Override plan
          </button>
        }
      >
        {!sub ? (
          <p className="text-sm text-slate-400">No subscription on file. The customer-facing trigger will create one when the org is next written.</p>
        ) : (
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">Plan</dt>
              <dd className="text-slate-100 mt-1">{sub.plan_label || sub.plan}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">Status</dt>
              <dd className="mt-1"><StatusBadge status={sub.status} /></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">Seats</dt>
              <dd className="text-slate-100 mt-1 tabular-nums">{sub.seats ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">MRR</dt>
              <dd className="text-slate-100 mt-1 tabular-nums">
                {sub.unit_amount_cents != null
                  ? formatCents((sub.unit_amount_cents || 0) * (sub.seats || 1) * (sub.interval === 'year' ? 1 / 12 : 1))
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">Period start</dt>
              <dd className="text-slate-200 mt-1">{formatDate(sub.current_period_starts_at)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">Period end</dt>
              <dd className="text-slate-200 mt-1">{formatDate(sub.current_period_ends_at)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">Trial ends</dt>
              <dd className="text-slate-200 mt-1">{formatDate(sub.trial_ends_at)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">Cancel at</dt>
              <dd className="text-slate-200 mt-1">{formatDate(sub.cancel_at)}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title="Invoices">
        {loadingInvoices ? (
          <p className="text-xs text-slate-500 text-center py-6">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium px-5 py-2.5">Number</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-right font-medium px-3 py-2.5">Amount</th>
                  <th className="text-left font-medium px-3 py-2.5">Due</th>
                  <th className="text-left font-medium px-3 py-2.5">Paid</th>
                  <th className="text-right font-medium px-5 py-2.5">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-800/40 last:border-0">
                    <td className="px-5 py-2.5 text-slate-200 font-mono">{inv.number || inv.stripe_invoice_id || inv.id.slice(0, 8)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={inv.status} /></td>
                    <td className="px-3 py-2.5 text-right text-slate-200 tabular-nums">{formatCents(inv.amount_due_cents)}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{formatDate(inv.due_date)}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{formatDate(inv.paid_at)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {inv.hosted_invoice_url || inv.invoice_pdf ? (
                        <a
                          href={inv.hosted_invoice_url || inv.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 text-xs"
                        >
                          <FileText className="w-3 h-3" />
                          open
                        </a>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <OverridePlanModal
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        sub={sub}
        orgId={orgId}
        onSaved={() => {
          setOverrideOpen(false)
          onRefresh?.()
        }}
      />
    </div>
  )
}

function OverridePlanModal({ open, onClose, sub, orgId, onSaved }) {
  const [plan, setPlan] = useState(sub?.plan || 'trial')
  const [status, setStatus] = useState(sub?.status || 'trialing')
  const [seats, setSeats] = useState(sub?.seats ?? 1)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setPlan(sub?.plan || 'trial')
      setStatus(sub?.status || 'trialing')
      setSeats(sub?.seats ?? 1)
      setReason('')
      setError(null)
    }
  }, [open, sub])

  async function onSave() {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        plan,
        status,
        seats: Number(seats) || 1,
        organization_id: orgId,
      }
      if (sub?.id) {
        const { error } = await supabase
          .from('subscriptions')
          .update(payload)
          .eq('id', sub.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('subscriptions')
          .upsert(payload, { onConflict: 'organization_id' })
        if (error) throw error
      }

      await supabase.rpc('log_admin_action', {
        p_action: 'change_plan',
        p_target_org_id: orgId,
        p_metadata: {
          previous: {
            plan: sub?.plan,
            status: sub?.status,
            seats: sub?.seats,
          },
          next: payload,
          reason: reason.trim() || null,
        },
      }).catch(() => {})

      onSaved?.()
    } catch (e) {
      setError(e?.message || 'Failed to override plan')
    } finally {
      setBusy(false)
    }
  }

  const PLANS    = ['trial', 'starter', 'growth', 'scale', 'enterprise']
  const STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused']

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose?.()}
      title="Override plan"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-400 mb-3">
        Manually change plan, status, or seats. This bypasses Stripe and writes directly to the
        local <code className="px-1 bg-slate-800 rounded text-slate-300">subscriptions</code> table.
        Use only for support corrections.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Plan</span>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Seats</span>
          <input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none tabular-nums"
          />
        </label>
      </div>
      <label className="block mt-3">
        <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Reason</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this manual override needed?"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
        />
      </label>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </Modal>
  )
}

// ---------- ai tab ----------

function AITab({ orgId }) {
  const [quota, setQuota] = useState(null)
  const [recentCalls, setRecentCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [recentLoading, setRecentLoading] = useState(true)
  const [missingMigrations, setMissingMigrations] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Editable form state for the limits override.
  const [form, setForm] = useState({
    monthly_call_limit: '',
    monthly_token_limit: '',
    monthly_cost_limit_cents: '',
    allow_overage: false,
    is_throttled: false,
  })

  const FN_NOT_FOUND_CODES = new Set(['42883', 'PGRST202'])

  const loadQuota = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('org_ai_quotas')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle()
      if (err) {
        if (err.code === '42P01' || /relation .* does not exist/i.test(err.message || '')) {
          setMissingMigrations(true)
          setQuota(null)
        } else {
          throw err
        }
      } else {
        setQuota(data || null)
        setForm({
          monthly_call_limit:        data?.monthly_call_limit ?? '',
          monthly_token_limit:       data?.monthly_token_limit ?? '',
          monthly_cost_limit_cents:  data?.monthly_cost_limit_cents ?? '',
          allow_overage:             !!data?.allow_overage,
          is_throttled:              !!data?.is_throttled,
        })
      }
    } catch (e) {
      setError(e?.message || 'Failed to load AI quota')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const loadRecent = useCallback(async () => {
    setRecentLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('admin_ai_org_recent_calls', {
        p_org_id: orgId,
        p_limit: 50,
      })
      if (err) {
        const isMissing =
          FN_NOT_FOUND_CODES.has(err.code) ||
          /function .* does not exist/i.test(err.message || '')
        if (isMissing) {
          setMissingMigrations(true)
        }
        setRecentCalls([])
      } else {
        setRecentCalls(Array.isArray(data) ? data : [])
      }
    } finally {
      setRecentLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  useEffect(() => {
    loadQuota()
    loadRecent()
  }, [loadQuota, loadRecent])

  function patch(p) {
    setForm((prev) => ({ ...prev, ...p }))
    setSaveOk(false)
    setSaveError(null)
  }

  async function onSave() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const payload = {
        organization_id:          orgId,
        monthly_call_limit:       form.monthly_call_limit === '' ? null : Number(form.monthly_call_limit),
        monthly_token_limit:      form.monthly_token_limit === '' ? null : Number(form.monthly_token_limit),
        monthly_cost_limit_cents: form.monthly_cost_limit_cents === '' ? null : Number(form.monthly_cost_limit_cents),
        allow_overage:            !!form.allow_overage,
        is_throttled:             !!form.is_throttled,
      }
      if (quota?.id) {
        const { error: err } = await supabase
          .from('org_ai_quotas')
          .update(payload)
          .eq('id', quota.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('org_ai_quotas')
          .upsert(payload, { onConflict: 'organization_id' })
        if (err) throw err
      }

      await supabase.rpc('log_admin_action', {
        p_action: 'ai_quota_update',
        p_target_org_id: orgId,
        p_metadata: {
          previous: {
            monthly_call_limit:       quota?.monthly_call_limit,
            monthly_token_limit:      quota?.monthly_token_limit,
            monthly_cost_limit_cents: quota?.monthly_cost_limit_cents,
            allow_overage:            quota?.allow_overage,
            is_throttled:             quota?.is_throttled,
          },
          next: payload,
        },
      }).catch(() => {})

      setSaveOk(true)
      await loadQuota()
    } catch (e) {
      setSaveError(e?.message || 'Failed to save quota')
    } finally {
      setSaving(false)
    }
  }

  async function onResetUsage() {
    if (!window.confirm('Reset usage counters for this org? This zeroes calls/tokens/cost for the current period.')) return
    setSaving(true)
    setSaveError(null)
    try {
      const { error: err } = await supabase.rpc('admin_ai_reset_org_usage', {
        p_org_id: orgId,
        p_reason: 'Admin-triggered reset from CompanyDetail',
      })
      if (err) throw err
      await loadQuota()
      await loadRecent()
    } catch (e) {
      setSaveError(e?.message || 'Failed to reset usage')
    } finally {
      setSaving(false)
    }
  }

  async function onToggleThrottle() {
    setSaving(true)
    setSaveError(null)
    try {
      const next = !quota?.is_throttled
      if (quota?.id) {
        const { error: err } = await supabase
          .from('org_ai_quotas')
          .update({ is_throttled: next })
          .eq('id', quota.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('org_ai_quotas')
          .upsert(
            { organization_id: orgId, is_throttled: next },
            { onConflict: 'organization_id' }
          )
        if (err) throw err
      }
      await supabase.rpc('log_admin_action', {
        p_action: next ? 'ai_throttle_on' : 'ai_throttle_off',
        p_target_org_id: orgId,
      }).catch(() => {})
      await loadQuota()
    } catch (e) {
      setSaveError(e?.message || 'Failed to toggle throttle')
    } finally {
      setSaving(false)
    }
  }

  // ── derived values
  const callsUsed   = quota?.calls_used_this_period ?? 0
  const tokensUsed  = quota?.tokens_used_this_period ?? 0
  const costUsed    = quota?.cost_cents_used_this_period ?? 0
  const callLimit   = quota?.monthly_call_limit
  const tokenLimit  = quota?.monthly_token_limit
  const costLimit   = quota?.monthly_cost_limit_cents

  const callPct  = callLimit  ? Math.min(100, (callsUsed  / callLimit)  * 100) : null
  const costPct  = costLimit  ? Math.min(100, (costUsed   / costLimit)  * 100) : null
  const tokenPct = tokenLimit ? Math.min(100, (tokensUsed / tokenLimit) * 100) : null

  return (
    <div className="space-y-6">
      {missingMigrations && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200">
            <strong className="text-amber-100">Migrations 083/084 not yet applied.</strong>{' '}
            The <code className="px-1 bg-black/30 rounded">org_ai_quotas</code> table and{' '}
            <code className="px-1 bg-black/30 rounded">admin_ai_org_recent_calls</code> RPC are missing.
            Apply the AI control plane migrations to your Supabase project to enable this tab.
          </div>
        </div>
      )}

      <Card title="AI quota — current period">
        {loading ? (
          <p className="text-xs text-slate-500 text-center py-6">Loading quota…</p>
        ) : (
          <div className="space-y-5">
            <UsageBar
              label="Calls"
              used={callsUsed}
              limit={callLimit}
              pct={callPct}
              format={formatNumber}
            />
            <UsageBar
              label="Tokens"
              used={tokensUsed}
              limit={tokenLimit}
              pct={tokenPct}
              format={formatNumber}
            />
            <UsageBar
              label="Cost"
              used={costUsed}
              limit={costLimit}
              pct={costPct}
              format={formatCents}
            />
          </div>
        )}
      </Card>

      <Card
        title="Quota controls"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetUsage}
              disabled={saving || loading || missingMigrations}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset usage
            </button>
            <button
              type="button"
              onClick={onToggleThrottle}
              disabled={saving || loading || missingMigrations}
              className={[
                'px-2.5 py-1 text-[11px] rounded-lg border transition disabled:opacity-40 disabled:cursor-not-allowed',
                quota?.is_throttled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                  : 'border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20',
              ].join(' ')}
            >
              {quota?.is_throttled ? 'Unthrottle' : 'Throttle now'}
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="text-xs text-slate-500 text-center py-6">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                  Monthly call limit
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.monthly_call_limit}
                  onChange={(e) => patch({ monthly_call_limit: e.target.value })}
                  placeholder="(plan default)"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none tabular-nums"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                  Monthly token limit
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.monthly_token_limit}
                  onChange={(e) => patch({ monthly_token_limit: e.target.value })}
                  placeholder="(plan default)"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none tabular-nums"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                  Monthly cost limit (cents)
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.monthly_cost_limit_cents}
                  onChange={(e) => patch({ monthly_cost_limit_cents: e.target.value })}
                  placeholder="(plan default)"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none tabular-nums"
                />
                <span className="block text-[11px] text-slate-600 mt-1">
                  {form.monthly_cost_limit_cents
                    ? formatCents(Number(form.monthly_cost_limit_cents))
                    : 'plan default'}
                </span>
              </label>
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.allow_overage}
                  onChange={(e) => patch({ allow_overage: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500/40"
                />
                <span className="text-sm text-slate-200">Allow overage</span>
                <span className="text-[11px] text-slate-500">(don't auto-throttle when over limit)</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {saveError && (
                <span className="text-xs text-red-300 inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {saveError}
                </span>
              )}
              {saveOk && !saveError && (
                <span className="text-xs text-emerald-300">Saved.</span>
              )}
              <button
                type="button"
                onClick={onSave}
                disabled={saving || loading || missingMigrations}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save quota'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Recent AI calls (last 50)">
        {recentLoading ? (
          <p className="text-xs text-slate-500 text-center py-6">Loading calls…</p>
        ) : recentCalls.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            {missingMigrations ? 'AI usage tracking not yet available.' : 'No AI calls recorded yet for this org.'}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-medium px-5 py-2.5">When</th>
                  <th className="text-left font-medium px-3 py-2.5">Surface</th>
                  <th className="text-left font-medium px-3 py-2.5">Model</th>
                  <th className="text-right font-medium px-3 py-2.5">Tokens</th>
                  <th className="text-right font-medium px-3 py-2.5">Cost</th>
                  <th className="text-left font-medium px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/40 last:border-0">
                    <td className="px-5 py-2.5 text-slate-300 whitespace-nowrap">
                      {formatDate(c.created_at, { withTime: true })}
                    </td>
                    <td className="px-3 py-2.5 text-slate-200 font-mono text-xs">{c.surface || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-200 font-mono text-xs">
                      {c.provider ? `${c.provider}/${c.model}` : (c.model || '—')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                      {formatNumber(c.total_tokens)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">
                      {formatCents(c.cost_cents)}
                    </td>
                    <td className="px-5 py-2.5">
                      {c.status === 'error' || c.error ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-500/15 border border-red-500/30 text-red-200" title={c.error || ''}>
                          error
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
                          {c.status || 'ok'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function UsageBar({ label, used, limit, pct, format }) {
  const fmt = format || ((v) => v)
  const pctTone =
    pct == null    ? 'bg-slate-600' :
    pct >= 95      ? 'bg-red-400'   :
    pct >= 80      ? 'bg-amber-400' :
    'bg-indigo-400'
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1.5">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className="tabular-nums text-slate-400">
          <span className="text-slate-100">{fmt(used)}</span>
          <span className="text-slate-500">{' / '}{limit == null ? '∞' : fmt(limit)}</span>
          {pct != null && (
            <span className="text-slate-600 ml-2">
              ({pct.toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
      <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden ring-1 ring-inset ring-slate-800/40">
        <div
          className={`h-full ${pctTone} transition-all duration-500 rounded-full`}
          style={{ width: `${pct == null ? 0 : Math.max(pct, used > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  )
}

// ---------- operations tab ----------

function OperationsTab({ orgId, org, onChanged }) {
  return (
    <div className="space-y-6">
      <OrgFreezeCard org={org} onChanged={onChanged} />
      <HealthCard orgId={orgId} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OnboardingCard orgId={orgId} />
        <StorageCard orgId={orgId} />
      </div>
      <FlagsCard orgId={orgId} />
      <OrgBudgetCard orgId={orgId} />
      <ForceActionsCard orgId={orgId} />
    </div>
  )
}

// ---------- settings tab ----------

function SettingsTab({ org, orgId, onRefresh }) {
  const [myRole, setMyRole] = useState(null)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    supabase.rpc('super_admin_role').then(({ data, error }) => {
      if (!error && typeof data === 'string') setMyRole(data)
    })
  }, [])

  const isOwner = myRole === 'owner'

  return (
    <div className="space-y-6">
      <Card title="Organization metadata">
        <dl className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {Object.entries(org || {}).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
              <dd className="text-slate-200 mt-1 break-all font-mono text-xs">
                {v == null
                  ? <span className="text-slate-600">null</span>
                  : typeof v === 'object'
                    ? JSON.stringify(v)
                    : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-200 mb-1">Danger zone</h3>
            <p className="text-xs text-red-300/80 mb-4">
              These actions affect customer data. Restricted to <code className="px-1 bg-black/30 rounded">owner</code> super admins.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setSuspendOpen(true)}
                disabled={!isOwner}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ListChecks className="w-3.5 h-3.5" />
                Suspend account
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                disabled={!isOwner}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hard delete
              </button>
            </div>
            {!isOwner && (
              <p className="text-[11px] text-red-400/60 mt-3">
                Your role ({myRole || 'unknown'}) does not permit destructive actions.
              </p>
            )}
          </div>
        </div>
      </div>

      <DangerConfirmModal
        kind="suspend"
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        org={org}
        orgId={orgId}
        onDone={onRefresh}
      />
      <DangerConfirmModal
        kind="delete"
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        org={org}
        orgId={orgId}
        onDone={onRefresh}
      />
    </div>
  )
}

function DangerConfirmModal({ kind, open, onClose, org, orgId, onDone }) {
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const matchPhrase = org?.slug || org?.name || orgId

  useEffect(() => {
    if (open) {
      setConfirm('')
      setReason('')
      setError(null)
    }
  }, [open])

  async function onSubmit() {
    setBusy(true)
    setError(null)
    try {
      // v1: log the intent. The actual destructive operations require a
      // SECURITY DEFINER RPC that's not yet shipped (it has too much blast
      // radius to do from the client).
      await supabase.rpc('log_admin_action', {
        p_action: kind === 'suspend' ? 'suspend_org' : 'hard_delete_org',
        p_target_org_id: orgId,
        p_metadata: {
          requested: true,
          reason: reason.trim() || null,
          via: 'admin_portal_v0.1',
          implemented: false,
        },
      }).catch((e) => { throw e })

      onDone?.()
      onClose?.()
      window.alert(
        `${kind === 'suspend' ? 'Suspension' : 'Hard delete'} request logged.\n\n` +
        `The destructive operation itself is not yet implemented in v0.1 — ` +
        `the request has been recorded in admin_audit_log only. ` +
        `A platform engineer must complete the action manually.`
      )
    } catch (e) {
      setError(e?.message || 'Failed to log action')
    } finally {
      setBusy(false)
    }
  }

  const title = kind === 'suspend' ? 'Suspend account' : 'Hard delete organization'
  const verb  = kind === 'suspend' ? 'suspend' : 'delete'

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose?.()}
      title={title}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy || confirm !== matchPhrase}
            className={[
              'px-3 py-1.5 text-xs rounded-lg text-white transition disabled:opacity-50',
              kind === 'suspend' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-red-600 hover:bg-red-500',
            ].join(' ')}
          >
            {busy ? 'Working…' : `Confirm ${verb}`}
          </button>
        </>
      }
    >
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 mb-3">
        <strong>Not yet implemented in v0.1.</strong> Submitting will only write an entry to{' '}
        <code className="px-1 bg-black/30 rounded">admin_audit_log</code>; the actual {verb} must
        be performed manually by a platform engineer until the corresponding SECURITY DEFINER RPC ships.
      </div>
      <p className="text-sm text-slate-300 mb-2">
        Type <span className="text-slate-100 font-mono">{matchPhrase}</span> to confirm:
      </p>
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-slate-100 focus:border-red-500 focus:outline-none"
        autoFocus
      />
      <label className="block mt-3">
        <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Reason</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this action needed?"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
        />
      </label>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </Modal>
  )
}
