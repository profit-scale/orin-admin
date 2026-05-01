import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../services/supabase'

/**
 * Side drawer that handles BOTH "connect" and "manage" flows.
 *
 * The credential form is rendered entirely from `processor.credential_schema`
 * — there is NO per-processor logic in this component. To add a new processor
 * tomorrow, the SQL catalog INSERT is enough. That's the whole point of the
 * schema-driven design from migration 078.
 *
 * Connection lifecycle:
 *
 *   1. User fills form → "Test connection" calls the `payment-test` Supabase
 *      edge function. We pass the platform org_id explicitly via the body so
 *      the function can record the test result on the right org.
 *
 *      NOTE: The customer app's `payment-test` derives the org from the JWT.
 *      This works for the admin portal IFF the super admin is also an
 *      org_member of the platform org. Documented as a TODO at the top of
 *      Billing.jsx and again in this file's "Test connection" handler.
 *
 *   2. On success the function upserts a `payment_processor_connections` row
 *      and returns it. We refresh the parent's connections list via onSaved.
 *
 *   3. "Disconnect" deletes the connections row directly via Supabase REST
 *      (RLS lets the org's owner/admin do this; the super admin must be a
 *      member of the platform org with one of those roles).
 *
 * Props:
 *   open       : boolean
 *   onClose    : () => void
 *   processor  : payment_processors row (catalog)
 *   connection : payment_processor_connections row | null
 *   organizationId : string — the platform org we're managing payments for
 *   onSaved    : () => void  (callback after a successful save / delete)
 */
export default function ProcessorConnectionDrawer({
  open,
  onClose,
  processor,
  connection,
  organizationId,
  onSaved,
}) {
  // Field schema is JSONB — coerce to array, default to empty.
  const fields = useMemo(() => {
    if (!processor) return []
    const raw = processor.credential_schema
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return [] }
    }
    return []
  }, [processor])

  // Form state, keyed by field.key.
  const [values, setValues]       = useState({})
  const [revealed, setRevealed]   = useState({}) // per-field secret reveal toggle
  const [busy, setBusy]           = useState(false)
  const [busyAction, setBusyAction] = useState(null) // 'test' | 'save' | 'delete'
  const [result, setResult]       = useState(null)   // { ok: bool, message: string }
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset form whenever drawer opens for a new processor/connection.
  useEffect(() => {
    if (!open || !processor) return
    const initial = {}
    const existingCreds = (connection?.credentials && typeof connection.credentials === 'object')
      ? connection.credentials : {}
    const existingConfig = (connection?.config && typeof connection.config === 'object')
      ? connection.config : {}
    for (const f of fields) {
      // Credentials live in `credentials`; non-secret config (like `mode`) lives in `config`.
      // We look in both blobs and prefer the credentials side if both have the key.
      if (f.key in existingCreds) initial[f.key] = existingCreds[f.key] ?? ''
      else if (f.key in existingConfig) initial[f.key] = existingConfig[f.key] ?? ''
      else initial[f.key] = f.placeholder && (f.type === 'enum' ? '' : '')
        // Don't pre-fill a placeholder into the value — the placeholder is just visual hint.
        || ''
    }
    setValues(initial)
    setRevealed({})
    setResult(null)
    setConfirmDelete(false)
    setBusy(false)
    setBusyAction(null)
  }, [open, processor, connection, fields])

  if (!open || !processor) return null

  const isManage = Boolean(connection)

  function setField(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }))
    // any edit invalidates a previous test result
    if (result) setResult(null)
  }

  function toggleReveal(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function validate() {
    for (const f of fields) {
      if (f.required && !String(values[f.key] ?? '').trim()) {
        return `Missing required field: ${f.label || f.key}`
      }
    }
    return null
  }

  // ── actions ───────────────────────────────────────────────────────

  async function onTest() {
    setResult(null)
    const err = validate()
    if (err) {
      setResult({ ok: false, message: err })
      return
    }
    setBusy(true)
    setBusyAction('test')
    try {
      // The edge function is shared with the customer app. We pass the
      // organization_id explicitly in the body so the function can record
      // the test against the right org. (See JWT-derivation note above.)
      const { data, error } = await supabase.functions.invoke('payment-test', {
        body: {
          processor_slug:  processor.slug,
          processor_id:    processor.id,
          organization_id: organizationId,
          credentials:     values,
        },
        headers: {
          'x-platform-org-id': organizationId || '',
        },
      })
      if (error) {
        setResult({ ok: false, message: error.message || 'Test failed' })
      } else if (data?.ok === false) {
        setResult({ ok: false, message: data?.error || data?.message || 'Test failed' })
      } else {
        setResult({ ok: true, message: data?.message || 'Connection looks good.' })
      }
    } catch (e) {
      setResult({ ok: false, message: e?.message || 'Test failed' })
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  async function onSave() {
    setResult(null)
    const err = validate()
    if (err) {
      setResult({ ok: false, message: err })
      return
    }
    setBusy(true)
    setBusyAction('save')
    try {
      // Split values into credentials vs. config based on the schema's
      // declared `type`. Anything tagged 'secret' goes in credentials; the
      // rest (public, enum, url) is non-secret config. This mirrors the
      // shape the edge function expects, but lets us also write directly
      // for v1 even if the function isn't deployed yet.
      const credentials = {}
      const config      = {}
      let mode = connection?.mode || 'test'
      for (const f of fields) {
        const v = values[f.key]
        if (f.type === 'secret') credentials[f.key] = v
        else config[f.key] = v
        if (f.key === 'mode' && typeof v === 'string') mode = v
      }

      const { data: { user } } = await supabase.auth.getUser()

      const upsertPayload = {
        organization_id: organizationId,
        processor_id:    processor.id,
        processor_slug:  processor.slug,
        credentials,
        config,
        mode,
        is_active: true,
        updated_at: new Date().toISOString(),
        ...(connection ? {} : { created_by: user?.id || null }),
      }

      const { error } = await supabase
        .from('payment_processor_connections')
        .upsert(upsertPayload, { onConflict: 'organization_id,processor_id' })

      if (error) {
        if (error.code === '42501' || /policy/i.test(error.message || '')) {
          setResult({ ok: false, message: 'Permission denied. The signed-in admin must be an owner/admin of the platform org.' })
        } else {
          setResult({ ok: false, message: error.message || 'Failed to save' })
        }
        return
      }

      setResult({ ok: true, message: 'Saved.' })
      onSaved?.()
    } catch (e) {
      setResult({ ok: false, message: e?.message || 'Failed to save' })
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  async function onDelete() {
    if (!connection) return
    setBusy(true)
    setBusyAction('delete')
    setResult(null)
    try {
      const { error } = await supabase
        .from('payment_processor_connections')
        .delete()
        .eq('id', connection.id)
      if (error) {
        if (error.code === '42501' || /policy/i.test(error.message || '')) {
          setResult({ ok: false, message: 'Permission denied. The signed-in admin must be an owner/admin of the platform org.' })
        } else {
          setResult({ ok: false, message: error.message || 'Failed to disconnect' })
        }
        return
      }
      onSaved?.()
      onClose?.()
    } catch (e) {
      setResult({ ok: false, message: e?.message || 'Failed to disconnect' })
    } finally {
      setBusy(false)
      setBusyAction(null)
      setConfirmDelete(false)
    }
  }

  // ── render ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => { if (!busy) onClose?.() }}
      />

      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full sm:max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-indigo-500/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-indigo-200">
                {(processor.display_name || '?').slice(0, 1).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                {isManage ? 'Manage' : 'Connect'} {processor.display_name}
              </h2>
              {processor.tagline && (
                <p className="text-[11px] text-slate-500 truncate">{processor.tagline}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => { if (!busy) onClose?.() }}
            className="text-slate-500 hover:text-slate-200 transition shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Helper banner for first-time connect */}
          {!isManage && (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-200 leading-relaxed">
              Fill in your {processor.display_name} credentials, run "Test connection",
              then save. Test mode keys recommended until you've routed at least one invoice.
              {processor.docs_url && (
                <>
                  {' '}
                  <a
                    href={processor.docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-indigo-100 underline hover:text-white"
                  >
                    Docs
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </>
              )}
            </div>
          )}

          {/* Schema is empty → no fields. Nothing the UI can render. */}
          {fields.length === 0 && (
            <div className="text-xs text-slate-500 italic">
              This processor has no credential fields configured. Add a
              <code className="px-1 mx-1 bg-slate-800 rounded">credential_schema</code>
              entry in the catalog row to enable connecting it.
            </div>
          )}

          {/* Dynamic fields — driven entirely by credential_schema */}
          {fields.map((f) => {
            const id = `pp-field-${f.key}`
            const value = values[f.key] ?? ''
            const isSecret = f.type === 'secret'
            const showSecret = revealed[f.key]

            return (
              <div key={f.key}>
                <label htmlFor={id} className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                  {f.label || f.key}
                  {f.required && <span className="text-amber-400 ml-1">*</span>}
                </label>

                {f.type === 'enum' ? (
                  <select
                    id={id}
                    value={value}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">— select —</option>
                    {(f.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      id={id}
                      type={isSecret && !showSecret ? 'password' : 'text'}
                      value={value}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder || ''}
                      className={[
                        'w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none',
                        isSecret ? 'pr-9 font-mono' : '',
                      ].join(' ')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {isSecret && (
                      <button
                        type="button"
                        onClick={() => toggleReveal(f.key)}
                        aria-label={showSecret ? 'Hide value' : 'Show value'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 transition"
                      >
                        {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )}

                {f.help && (
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{f.help}</p>
                )}
              </div>
            )
          })}

          {/* Result feedback */}
          {result && (
            <div
              className={[
                'rounded-lg border px-3 py-2 text-xs flex items-start gap-2',
                result.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200',
              ].join(' ')}
            >
              {result.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
              }
              <span className="leading-relaxed">{result.message}</span>
            </div>
          )}

          {/* Last-test snippet for existing connections */}
          {isManage && connection?.last_test_at && (
            <div className="text-[11px] text-slate-500 leading-relaxed">
              Last tested {new Date(connection.last_test_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
              {connection.last_test_status && (
                <> · <span className={connection.last_test_status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                  {connection.last_test_status}
                </span></>
              )}
              {connection.last_test_error && (
                <div className="mt-0.5 text-red-300/80 truncate font-mono">
                  {connection.last_test_error}
                </div>
              )}
            </div>
          )}

          {/* Disconnect zone — only for existing connections */}
          {isManage && (
            <div className="pt-2 mt-2 border-t border-slate-800/60">
              {confirmDelete ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-red-200 leading-relaxed">
                    Disconnect {processor.display_name}? Existing invoices that route here
                    will fail until reconnected. Webhook history is preserved.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onDelete}
                      disabled={busy}
                      className="px-2.5 py-1 text-[11px] rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 transition disabled:opacity-50"
                    >
                      {busyAction === 'delete' ? 'Disconnecting…' : 'Yes, disconnect'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy}
                      className="px-2.5 py-1 text-[11px] rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-[11px] text-red-300/80 hover:text-red-300 transition disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Disconnect this processor
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800/60 flex items-center justify-end gap-2">
          <button
            onClick={onTest}
            disabled={busy || fields.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busyAction === 'test' && <Loader2 className="w-3 h-3 animate-spin" />}
            {busyAction === 'test' ? 'Testing…' : 'Test connection'}
          </button>
          <button
            onClick={onSave}
            disabled={busy || fields.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busyAction === 'save' && <Loader2 className="w-3 h-3 animate-spin" />}
            {busyAction === 'save' ? 'Saving…' : (isManage ? 'Save changes' : 'Connect')}
          </button>
        </div>
      </div>
    </div>
  )
}
