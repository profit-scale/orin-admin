import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Mail,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCircle2,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import RoleBadge from '../components/admin/RoleBadge'
import Modal from '../components/ui/Modal'
import PageTitle from '../components/ui/PageTitle'

const FN_NOT_FOUND_CODES = new Set(['42883', 'PGRST202'])
const ROLES = ['owner', 'admin', 'support', 'readonly']

function formatDate(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return s
  }
}

function shortId(id) {
  if (!id) return '—'
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

/**
 * Returns rows shaped like:
 *   { user_id, role, granted_at, granted_by, revoked_at, notes,
 *     full_name, avatar_url, email }
 *
 * `super_admins.user_id` references `auth.users.id` directly — it does NOT
 * have a Postgres FK to `user_profiles`, so we can't use a Supabase nested
 * select. We do two queries and merge in JS. Email lives on auth.users and
 * is not readable from the client; surface as null and mark as TODO.
 */
async function loadStaff() {
  const { data: rows, error } = await supabase
    .from('super_admins')
    .select('user_id, role, granted_at, granted_by, revoked_at, notes')
    .order('granted_at', { ascending: true })

  if (error) throw error

  const userIds = Array.from(new Set((rows || []).map((r) => r.user_id).filter(Boolean)))
  let profiles = {}
  if (userIds.length) {
    const { data: profs } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)
    profiles = Object.fromEntries((profs || []).map((p) => [p.id, p]))
  }

  return (rows || []).map((r) => {
    const profile = profiles[r.user_id] || {}
    return {
      user_id:    r.user_id,
      role:       r.role,
      granted_at: r.granted_at,
      granted_by: r.granted_by,
      revoked_at: r.revoked_at,
      notes:      r.notes,
      full_name:  profile.full_name || null,
      avatar_url: profile.avatar_url || null,
      email:      null, // auth.users not readable from client; TODO: add admin RPC
    }
  })
}

function StaffAvatar({ row }) {
  if (row.avatar_url) {
    return (
      <img
        src={row.avatar_url}
        alt=""
        className="w-8 h-8 rounded-full border border-slate-700/60 shrink-0"
      />
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0">
      <UserCircle2 className="w-4 h-4 text-slate-500" />
    </div>
  )
}

function StaffTable({
  rows,
  showRevoked,
  canModify,
  onChangeRole,
  onRevoke,
  onRestore,
  busyId,
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 px-4 py-12 text-center">
        <ShieldCheck className="w-7 h-7 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">
          {showRevoked ? 'No revoked staff.' : 'No active super admins.'}
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="text-left font-medium px-4 py-3">User</th>
              <th scope="col" className="text-left font-medium px-4 py-3">Role</th>
              <th scope="col" className="text-left font-medium px-4 py-3">Granted by</th>
              <th scope="col" className="text-left font-medium px-4 py-3">
                {showRevoked ? 'Revoked at' : 'Granted at'}
              </th>
              <th scope="col" className="text-right font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.user_id}
                className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <StaffAvatar row={r} />
                    <div className="min-w-0">
                      <div className="text-slate-100 truncate">
                        {r.full_name || (
                          <span className="text-slate-500 font-mono text-xs">
                            {shortId(r.user_id)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {r.user_id}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {canModify && !showRevoked ? (
                    <select
                      value={r.role}
                      onChange={(e) => onChangeRole(r.user_id, e.target.value)}
                      disabled={busyId === r.user_id}
                      className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                    >
                      {ROLES.map((rr) => (
                        <option key={rr} value={rr}>{rr}</option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={r.role} />
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                  {r.granted_by ? shortId(r.granted_by) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                  {formatDate(showRevoked ? r.revoked_at : r.granted_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {showRevoked ? (
                      canModify && (
                        <button
                          onClick={() => onRestore(r.user_id)}
                          disabled={busyId === r.user_id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                      )
                    ) : (
                      canModify && (
                        <button
                          onClick={() => onRevoke(r.user_id)}
                          disabled={busyId === r.user_id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          Revoke
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AddStaffModal({ open, onClose, onAdded }) {
  const [mode, setMode] = useState('email') // 'email' | 'user_id'
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('support')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function reset() {
    setEmail('')
    setUserId('')
    setRole('support')
    setNotes('')
    setBusy(false)
    setError(null)
  }

  async function lookupByEmail(addr) {
    // Try a public RPC first if it exists, then fall back to user_profiles
    // joined view. user_profiles has no email column, but some installs
    // expose a `public_user_directory` view; we try a few options
    // gracefully so the v1 page still works as schemas evolve.
    const { data: rpcData, error: rpcErr } = await supabase.rpc('find_user_id_by_email', {
      p_email: addr,
    })
    if (!rpcErr && rpcData) {
      // RPC may return a uuid scalar, an array, or a row; normalize.
      if (typeof rpcData === 'string') return rpcData
      if (Array.isArray(rpcData) && rpcData[0]) {
        return rpcData[0].user_id || rpcData[0].id || rpcData[0]
      }
      if (typeof rpcData === 'object') return rpcData.user_id || rpcData.id || null
    }
    // RPC missing — surface a helpful message via thrown error.
    if (rpcErr && (FN_NOT_FOUND_CODES.has(rpcErr.code) || /function .* does not exist/i.test(rpcErr.message || ''))) {
      const e = new Error('Email lookup not available. Paste the user_id directly (visible in the user_profiles table) or apply the find_user_id_by_email RPC migration.')
      e.code = 'NO_LOOKUP'
      throw e
    }
    if (rpcErr) throw rpcErr
    return null
  }

  async function onSubmit(e) {
    e?.preventDefault?.()
    setError(null)
    setBusy(true)
    try {
      let targetUserId = null
      if (mode === 'email') {
        const trimmed = email.trim().toLowerCase()
        if (!trimmed) {
          setError('Please enter an email.')
          return
        }
        targetUserId = await lookupByEmail(trimmed)
        if (!targetUserId) {
          setError(`No account found for ${trimmed}. The user must already have an account at app.orinsuite.com — invite them there first.`)
          return
        }
      } else {
        const trimmed = userId.trim()
        if (!/^[0-9a-fA-F-]{32,40}$/.test(trimmed)) {
          setError('Invalid user_id. Paste a UUID from the user_profiles table.')
          return
        }
        targetUserId = trimmed
      }

      const { data: { user } } = await supabase.auth.getUser()
      const { error: insertError } = await supabase
        .from('super_admins')
        .upsert(
          {
            user_id:    targetUserId,
            role,
            granted_by: user?.id || null,
            granted_at: new Date().toISOString(),
            revoked_at: null,
            notes:      notes.trim() || null,
          },
          { onConflict: 'user_id' }
        )

      if (insertError) {
        if (insertError.code === '23503') {
          setError('No matching user. The provided user_id does not exist in auth.users.')
        } else if (insertError.code === '42501' || /policy/i.test(insertError.message || '')) {
          setError('Permission denied. Only owner / admin super admins can add staff.')
        } else {
          setError(insertError.message || 'Failed to add staff')
        }
        return
      }

      // Best-effort audit-log entry.
      await supabase.rpc('log_admin_action', {
        p_action: 'grant_super_admin',
        p_target_user_id: targetUserId,
        p_metadata: { role, via: 'admin_portal_v0.1' },
      }).catch(() => {})

      reset()
      onAdded?.()
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Unexpected error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) { reset(); onClose?.() } }}
      title="Add staff"
      size="md"
      footer={
        <>
          <button
            onClick={() => { if (!busy) { reset(); onClose?.() } }}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add staff'}
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setMode('email')}
            className={[
              'px-2.5 py-1 text-[11px] rounded-md transition',
              mode === 'email' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            By email
          </button>
          <button
            type="button"
            onClick={() => setMode('user_id')}
            className={[
              'px-2.5 py-1 text-[11px] rounded-md transition',
              mode === 'user_id' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            By user_id
          </button>
        </div>

        {mode === 'email' ? (
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Email</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@nctmediagroup.com"
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              The user must already have an account at app.orinsuite.com. Requires the
              <code className="px-1 mx-1 bg-slate-800 rounded text-slate-300">find_user_id_by_email</code>
              RPC.
            </p>
          </label>
        ) : (
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">User ID</span>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
              autoFocus
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Paste the UUID from
              <code className="px-1 mx-1 bg-slate-800 rounded text-slate-300">user_profiles.id</code>.
            </p>
          </label>
        )}

        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            <strong>owner</strong>: full control · <strong>admin</strong>: manage staff ·{' '}
            <strong>support</strong>: impersonate &amp; view · <strong>readonly</strong>: metrics only.
          </p>
        </label>

        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none resize-none"
            placeholder="e.g. CS lead, off-hours support"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}

export default function Staff() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missingMigrations, setMissingMigrations] = useState(false)

  const [myRole, setMyRole] = useState(null)
  const [showRevoked, setShowRevoked] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await loadStaff()
      setRows(list)
    } catch (e) {
      if (FN_NOT_FOUND_CODES.has(e.code) || /relation .* does not exist/i.test(e.message || '')) {
        setMissingMigrations(true)
      } else {
        setError(e.message || 'Failed to load staff')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Best-effort: my own role to gate write actions.
    supabase.rpc('super_admin_role').then(({ data, error }) => {
      if (!error && typeof data === 'string') setMyRole(data)
    })
  }, [refresh])

  const canModify = myRole === 'owner' || myRole === 'admin'

  const active   = useMemo(() => rows.filter((r) => !r.revoked_at), [rows])
  const revoked  = useMemo(() => rows.filter((r) =>  r.revoked_at), [rows])

  async function onChangeRole(userId, newRole) {
    setBusyId(userId)
    setError(null)
    const { error } = await supabase
      .from('super_admins')
      .update({ role: newRole })
      .eq('user_id', userId)
    if (error) {
      setError(error.message || 'Failed to update role')
    } else {
      await supabase.rpc('log_admin_action', {
        p_action: 'change_super_admin_role',
        p_target_user_id: userId,
        p_metadata: { new_role: newRole },
      }).catch(() => {})
      await refresh()
    }
    setBusyId(null)
  }

  async function onRevoke(userId) {
    if (!window.confirm('Revoke this user\'s super admin access? They will lose access immediately.')) return
    setBusyId(userId)
    setError(null)
    const { error } = await supabase
      .from('super_admins')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (error) {
      setError(error.message || 'Failed to revoke')
    } else {
      await supabase.rpc('log_admin_action', {
        p_action: 'revoke_super_admin',
        p_target_user_id: userId,
      }).catch(() => {})
      await refresh()
    }
    setBusyId(null)
  }

  async function onRestore(userId) {
    setBusyId(userId)
    setError(null)
    const { error } = await supabase
      .from('super_admins')
      .update({ revoked_at: null })
      .eq('user_id', userId)
    if (error) {
      setError(error.message || 'Failed to restore')
    } else {
      await supabase.rpc('log_admin_action', {
        p_action: 'grant_super_admin',
        p_target_user_id: userId,
        p_metadata: { restored: true },
      }).catch(() => {})
      await refresh()
    }
    setBusyId(null)
  }

  return (
    <div>
      <PageTitle title="Staff" />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Staff</h1>
          <p className="text-sm text-slate-500">Manage Orin super admins.</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && !missingMigrations && (
            <span className="text-xs text-slate-500">
              {active.length} active{revoked.length ? ` · ${revoked.length} revoked` : ''}
            </span>
          )}
          <button
            onClick={() => setAddOpen(true)}
            disabled={!canModify}
            title={canModify ? 'Add staff' : 'Only owners and admins can add staff'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add staff
          </button>
        </div>
      </div>

      {missingMigrations && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200">
            <strong className="text-amber-100">Migrations not yet applied.</strong>{' '}
            The <code className="px-1 py-0.5 bg-black/30 rounded">super_admins</code> table is missing.
            Apply migrations 073-077 to your Supabase project to enable this page.
          </div>
        </div>
      )}

      {error && !missingMigrations && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 px-4 py-12 text-center">
          <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading staff…</p>
        </div>
      ) : (
        <>
          <StaffTable
            rows={active}
            showRevoked={false}
            canModify={canModify}
            onChangeRole={onChangeRole}
            onRevoke={onRevoke}
            onRestore={onRestore}
            busyId={busyId}
          />

          <button
            onClick={() => setShowRevoked((v) => !v)}
            className="mt-6 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
          >
            {showRevoked ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Revoked staff ({revoked.length})
          </button>

          {showRevoked && (
            <div className="mt-3">
              <StaffTable
                rows={revoked}
                showRevoked
                canModify={canModify}
                onChangeRole={onChangeRole}
                onRevoke={onRevoke}
                onRestore={onRestore}
                busyId={busyId}
              />
            </div>
          )}
        </>
      )}

      <AddStaffModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={refresh}
      />
    </div>
  )
}
