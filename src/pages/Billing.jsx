import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  CreditCard,
  DollarSign,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import Banner from '../components/ui/Banner'
import Tabs from '../components/ui/Tabs'
import EmptyState from '../components/ui/EmptyState'
import PaymentGallery from '../components/integrations/PaymentGallery'

/**
 * Billing & Payments — admin portal v1.
 *
 * Two tabs:
 *
 *   1. "Platform processors" — the same payment-processor gallery used by
 *      tenants, but pointed at a single "platform org": the organization row
 *      that represents Orin (the company) for billing purposes.
 *
 *      For v1 there's no first-class "platform org" concept in the schema;
 *      the super admin picks which org acts as the platform via a small
 *      dropdown at top. The dropdown defaults to `VITE_PLATFORM_ORG_ID` if
 *      set; otherwise we show a setup banner.
 *
 *   2. "Customer subscription revenue" — placeholder for the OTHER side of
 *      payments (Orin charging its customers via Stripe subscriptions). This
 *      depends on subscription work that hasn't shipped; stub for now.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Cross-cutting TODO (read this before deleting):
 *
 *   The `payment-test` edge function (in the customer-app repo) derives the
 *   organization from the user's JWT (auth.uid() → org_members → org). For
 *   the admin portal flow to work, the signed-in super admin MUST also be a
 *   member of the platform org (with role 'owner' or 'admin' so RLS lets us
 *   write `payment_processor_connections`).
 *
 *   v2 plan: add a dedicated `payment-test-admin` edge function that takes
 *   the org_id from the request body after checking `super_admins`. Until
 *   then: when you set `VITE_PLATFORM_ORG_ID`, also add yourself as an
 *   org_member of that org with role='owner'.
 * ─────────────────────────────────────────────────────────────────────────
 */

const TABS = [
  { id: 'processors',   label: 'Platform processors' },
  { id: 'subscriptions', label: 'Customer subscription revenue' },
]

// ────────────────────────────────────────────────────────────────────────
// Small dropdown to pick the "platform org" (the org we collect payments for).
// ────────────────────────────────────────────────────────────────────────

function OrgDropdown({ orgs, selectedId, onSelect, loading }) {
  const [open, setOpen] = useState(false)
  const selected = orgs.find((o) => o.id === selectedId)

  // close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (!e.target.closest('[data-org-dropdown]')) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div data-org-dropdown className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading || orgs.length === 0}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 text-sm text-slate-200 transition disabled:opacity-50"
      >
        <span className="text-slate-500 text-xs">Org:</span>
        <span className="font-medium truncate max-w-[200px]">
          {loading
            ? 'Loading…'
            : (selected?.name || selected?.slug || (selectedId ? `${selectedId.slice(0, 8)}…` : 'Pick an org'))}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && orgs.length > 0 && (
        <div className="absolute right-0 mt-1.5 w-72 max-h-80 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/95 backdrop-blur shadow-xl shadow-black/40 py-1 z-20">
          {orgs.map((o) => {
            const isSelected = o.id === selectedId
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelect(o.id); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  isSelected
                    ? 'bg-indigo-500/15 text-indigo-200'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="font-medium truncate">{o.name || o.slug || o.id}</div>
                {o.slug && o.name && (
                  <div className="text-[10px] text-slate-500 font-mono truncate">{o.slug}</div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Tab 2 placeholder — Stripe subscription revenue from Orin's customers.
// ────────────────────────────────────────────────────────────────────────

function CustomerRevenuePlaceholder() {
  return (
    <div className="space-y-4">
      <Banner tone="info" title="Coming next">
        This view will show Stripe subscription revenue from Orin's paying customers.
        Depends on the subscription billing work that hasn't shipped yet.
      </Banner>

      {/* Stat row preview — ghosted */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MRR',            icon: DollarSign },
          { label: 'Churn (30d)',    icon: TrendingUp },
          { label: 'Active subs',    icon: Users },
          { label: 'Open invoices',  icon: Receipt },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4 opacity-60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">{s.label}</span>
              <s.icon className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="text-2xl font-semibold text-slate-700">—</div>
            <div className="text-[10px] text-slate-600 mt-1">awaiting Stripe sync</div>
          </div>
        ))}
      </div>

      {/* TODO list */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Coming next</h3>
        <ul className="space-y-2 text-xs text-slate-400">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 mt-1.5 shrink-0" />
            <span>Total MRR + 12-month trend (combined Orin subscriptions)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 mt-1.5 shrink-0" />
            <span>Churn rate (30/60/90-day rolling)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 mt-1.5 shrink-0" />
            <span>Recent invoices feed (paid · failed · refunded)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 mt-1.5 shrink-0" />
            <span>Plan distribution across active subscriptions</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 mt-1.5 shrink-0" />
            <span>Pull Stripe events into the same `webhook_events` ledger from migration 078</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// page
// ────────────────────────────────────────────────────────────────────────

const ENV_PLATFORM_ORG_ID = import.meta.env.VITE_PLATFORM_ORG_ID || ''

export default function Billing() {
  const [activeTab, setActiveTab] = useState('processors')

  // Org list — needed for the dropdown. We try the admin RPC first, then fall
  // back to a direct table query if the RPC is missing (graceful with the
  // same migration story other admin pages use).
  const [orgs, setOrgs]               = useState([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError]     = useState(null)
  const [orgsMissing, setOrgsMissing] = useState(false)

  const [platformOrgId, setPlatformOrgId] = useState(ENV_PLATFORM_ORG_ID || '')

  // Persist the user's pick across reloads (super admin habit: stays on the
  // same "platform" org). localStorage; nothing sensitive.
  useEffect(() => {
    if (!ENV_PLATFORM_ORG_ID) {
      const saved = localStorage.getItem('orin-admin:platform-org-id')
      if (saved) setPlatformOrgId(saved)
    }
  }, [])

  function selectOrg(id) {
    setPlatformOrgId(id)
    localStorage.setItem('orin-admin:platform-org-id', id)
  }

  // Load orgs for the dropdown.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setOrgsLoading(true)
      setOrgsError(null)
      setOrgsMissing(false)

      // Try the admin RPC first.
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_orgs_list', {
        p_limit: 200,
        p_offset: 0,
        p_search: null,
        p_sort: 'created_at_desc',
      })

      if (cancelled) return

      if (!rpcErr) {
        const rows = (rpcData || []).map((r) => ({
          id: r.id, name: r.name, slug: r.slug,
        }))
        setOrgs(rows)
        setOrgsLoading(false)
        return
      }

      // Fall back to direct table query if the RPC isn't available.
      const isMissingFn = /function .* does not exist/i.test(rpcErr.message || '') ||
                         ['42883', 'PGRST202', 'PGRST116'].includes(rpcErr.code)
      if (isMissingFn) {
        const { data, error } = await supabase
          .from('organizations')
          .select('id, name, slug, created_at')
          .order('created_at', { ascending: false })
          .limit(200)
        if (cancelled) return
        if (error) {
          if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
            setOrgsMissing(true)
          } else {
            setOrgsError(error.message || 'Failed to load orgs')
          }
        } else {
          setOrgs(Array.isArray(data) ? data : [])
        }
      } else {
        setOrgsError(rpcErr.message || 'Failed to load orgs')
      }
      setOrgsLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Validate the env-supplied platform org id against the loaded list — if
  // it doesn't exist, show an inline warning rather than silently using a
  // bad UUID.
  const envOrgIsValid = useMemo(() => {
    if (!ENV_PLATFORM_ORG_ID) return null
    if (orgsLoading || orgs.length === 0) return null
    return orgs.some((o) => o.id === ENV_PLATFORM_ORG_ID)
  }, [orgsLoading, orgs])

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Billing &amp; Payments</h1>
          <p className="text-sm text-slate-500">
            Configure how Orin collects subscription fees from its customers.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === 'processors' && (
        <div className="space-y-4">
          {/* Platform-org picker row */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-300">
              <span className="text-slate-500">Currently managing payments for:</span>
            </div>
            <OrgDropdown
              orgs={orgs}
              selectedId={platformOrgId}
              onSelect={selectOrg}
              loading={orgsLoading}
            />
          </div>

          {/* Setup / configuration warnings */}
          {!ENV_PLATFORM_ORG_ID && !platformOrgId && !orgsMissing && (
            <Banner tone="warning" title="Pick a platform org">
              Set <code className="px-1 py-0.5 bg-black/30 rounded">VITE_PLATFORM_ORG_ID</code>{' '}
              in <code className="px-1 py-0.5 bg-black/30 rounded">.env</code> to your platform org's
              ID, or pick one from the dropdown above. Your selection is persisted in this browser.
            </Banner>
          )}

          {ENV_PLATFORM_ORG_ID && envOrgIsValid === false && (
            <Banner tone="warning" title="VITE_PLATFORM_ORG_ID does not match any org">
              The org id <code className="px-1 py-0.5 bg-black/30 rounded">{ENV_PLATFORM_ORG_ID}</code>{' '}
              isn't in the loaded list. Either fix the env value or pick a different org from the dropdown.
            </Banner>
          )}

          {orgsMissing && (
            <Banner tone="warning" title="Migrations not yet applied">
              The <code className="px-1 py-0.5 bg-black/30 rounded">organizations</code> table is missing.
              Apply the base schema migrations to your Supabase project to enable this page.
            </Banner>
          )}

          {orgsError && (
            <Banner tone="danger" title="Failed to load organizations">
              {orgsError}
            </Banner>
          )}

          {/* JWT/edge-function caveat. Hidden until an org is picked so the
              user isn't bombarded with dev notes before they configure. */}
          {platformOrgId && (
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-2 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400/70" />
              <span>
                The shared <code className="px-1 bg-slate-800/60 rounded">payment-test</code> edge
                function derives the organization from your JWT. For the admin flow to work end-to-end,
                the signed-in super admin must also be an{' '}
                <code className="px-1 bg-slate-800/60 rounded">org_members</code> row of this platform
                org with role <code className="px-1 bg-slate-800/60 rounded">owner</code> or{' '}
                <code className="px-1 bg-slate-800/60 rounded">admin</code>. (TODO: dedicated{' '}
                <code className="px-1 bg-slate-800/60 rounded">payment-test-admin</code> function that
                accepts org_id from the body.)
              </span>
            </div>
          )}

          {/* Gallery */}
          {platformOrgId ? (
            <PaymentGallery organizationId={platformOrgId} />
          ) : (
            <EmptyState
              icon={CreditCard}
              title="No platform org selected"
              description="Pick which organization should hold Orin's payment-processor connections, then come back to wire them up."
            />
          )}
        </div>
      )}

      {activeTab === 'subscriptions' && (
        <CustomerRevenuePlaceholder />
      )}
    </div>
  )
}
