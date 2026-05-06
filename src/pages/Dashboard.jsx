// ─────────────────────────────────────────────────────────────────────
// Admin dashboard — registry-driven.
//
// Was: a hand-coded big-card layout (and we kept it stable for a while).
// Now: every super admin gets a personal layout stored in
// `admin_dashboard_layouts` (mig 132). Edit mode lets you drag/hide
// widgets. The widget catalog lives in components/admin-dashboard/registry.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { Pencil, Save, X, RotateCcw } from 'lucide-react'
import { supabase } from '../services/supabase'
import { ADMIN_DEFAULT_LAYOUT, reconcileLayout } from '../components/admin-dashboard/registry'
import { AdminDashboardLayoutEngine } from '../components/admin-dashboard/DashboardLayoutEngine'
import Banner from '../components/ui/Banner'
import PageTitle from '../components/ui/PageTitle'
import { toast } from '../components/ui/Toast'

function useAdminDashboardLayout() {
  const [layout, setLayout]   = useState(reconcileLayout(ADMIN_DEFAULT_LAYOUT))
  const [loading, setLoading] = useState(true)
  const [savedHash, setSavedHash] = useState(null)
  const [missing, setMissing] = useState(false)

  const hashOf = (l) => JSON.stringify(l)

  // Load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from('admin_dashboard_layouts')
        .select('layout')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message || ''))) {
        setMissing(true)
      } else if (!error && data?.layout) {
        const reconciled = reconcileLayout(data.layout)
        setLayout(reconciled)
        setSavedHash(hashOf(reconciled))
      } else {
        setSavedHash(hashOf(layout))
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save
  const save = useCallback(async (next) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'unauthenticated' }
    const payload = { version: 1, widgets: next }
    const { error } = await supabase.from('admin_dashboard_layouts').upsert({
      user_id: user.id,
      layout: payload,
      updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    setSavedHash(hashOf(next))
    return { ok: true }
  }, [])

  const reset = useCallback(() => {
    setLayout(reconcileLayout(ADMIN_DEFAULT_LAYOUT))
  }, [])

  const dirty = savedHash !== hashOf(layout)

  return { layout, setLayout, loading, save, reset, dirty, missing }
}

export default function Dashboard() {
  const { layout, setLayout, loading, save, reset, dirty, missing } = useAdminDashboardLayout()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)

  const onReorder = (next) => setLayout(next)
  const onHide = (id) => setLayout(layout.map((e) => e.id === id ? { ...e, visible: false } : e))
  const onShow = (id) => setLayout(layout.map((e) => e.id === id ? { ...e, visible: true } : e))

  const persist = async () => {
    setSaving(true); setErr(null)
    const r = await save(layout)
    setSaving(false)
    if (r?.error) {
      setErr(r.error)
      toast.error("Couldn't save layout", { description: r.error })
    } else {
      setEditing(false)
      toast.success('Layout saved')
    }
  }

  return (
    <div className="space-y-6 max-w-[1500px]">
      <PageTitle title="Dashboard" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Dashboard</h1>
          <p className="text-sm text-slate-500">Platform overview · personal layout</p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => { reset() }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40">
                <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
              </button>
              <button onClick={() => { setEditing(false) }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button onClick={persist} disabled={saving || !dirty}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save layout'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40">
              <Pencil className="w-3.5 h-3.5" /> Edit dashboard
            </button>
          )}
        </div>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 132 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">132_admin_dashboard_layouts.sql</code> to persist personal layouts.
        </Banner>
      )}
      {err && <Banner tone="danger" title="Save failed">{err}</Banner>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="h-32 rounded-2xl bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <AdminDashboardLayoutEngine
          layout={layout}
          ctx={{}}
          editing={editing}
          onReorder={onReorder}
          onHide={onHide}
          onShow={onShow}
        />
      )}
    </div>
  )
}
