import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plug,
  Save,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import PageTitle from '../components/ui/PageTitle'

// ────────────────────────────────────────────────────────────────────
// constants
// ────────────────────────────────────────────────────────────────────

// Single-vendor architecture (consolidated to Anthropic in migration 101).
// Provider is hard-locked to 'anthropic' but kept as a select for the
// rare future where a second provider ships.
const PROVIDERS = [
  { id: 'anthropic', label: 'Orin AI' },
]

// Haiku is listed first and recommended — it's the cheapest Claude.
// Super-admins can still override per surface (Sonnet/Opus options remain).
// Model IDs (claude-haiku-4-5 etc.) are the literal API model identifiers
// sent to the Anthropic endpoint — they MUST stay correct. The labels
// shown to admins are the rebrand-friendly names.
const MODELS_BY_PROVIDER = {
  anthropic: [
    { id: 'claude-haiku-4-5',           label: 'Orin AI · Fast (recommended · cheapest)' },
    { id: 'claude-sonnet-4-5-20251022', label: 'Orin AI · Standard' },
    { id: 'claude-opus-4-5',            label: 'Orin AI · Heavy' },
  ],
}

// Surfaces that the platform AI is responsible for. The model dropdown
// is per-surface (a UX choice, not a security one).
//
// NOTE: System prompts USED to be edited here as raw textareas. That
// was footgun-y — a typo in a customer-facing prompt could break the
// AI for every tenant. Prompts now live in `platform_ai_config.system_prompts`
// as DB-only state with sane defaults baked into the edge function.
// If someone really needs to override a prompt, do it via SQL.
const SURFACES = [
  { id: 'chat-widget',        label: 'Chat widget',        hint: 'In-app conversational helper' },
  { id: 'compass-narrative',  label: 'Compass narrative',  hint: 'Daily/weekly executive summary' },
  { id: 'message-assistant',  label: 'Message assistant',  hint: 'Inline message rewrite/expand' },
  { id: 'quick-reply',        label: 'Quick reply',        hint: 'One-tap reply suggestions' },
  { id: 'data-extractor',     label: 'Data extractor',     hint: 'Pull structured fields from text' },
]

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

function emptyConfig() {
  return {
    is_enabled: true,
    provider: 'anthropic',
    default_model: 'claude-haiku-4-5',
    surface_models: {},
    max_tokens_per_call: 4000,
    max_cost_cents_per_call: 50,
  }
}

function formatDollarsFromCents(cents) {
  const v = Number(cents) || 0
  return `$${(v / 100).toFixed(2)}`
}

function formatRelative(s) {
  if (!s) return null
  try {
    const diff = Math.max(0, Date.now() - new Date(s).getTime())
    const m = Math.floor(diff / 60_000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    return new Date(s).toLocaleDateString()
  } catch { return s }
}

// Mask an in-progress key for display — the user-typed key never leaves
// the page until they click Save.
function clientMask(key) {
  if (!key) return ''
  if (key.length < 12) return '•'.repeat(key.length)
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

// ────────────────────────────────────────────────────────────────────
// reusable bits
// ────────────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, action, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur ${className}`}>
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 pb-5 space-y-4">{children}</div>
    </div>
  )
}

function StatusBadge({ enabled }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium',
        enabled
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          : 'bg-slate-800/60 border-slate-700/60 text-slate-300',
      ].join(' ')}
    >
      {enabled ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-600 mt-1">{hint}</span>}
    </label>
  )
}

function Select({ value, onChange, options, disabled }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  )
}

function NumberInput({ value, onChange, min, max, step = 1, disabled }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      disabled={disabled}
      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:border-indigo-500 focus:outline-none tabular-nums disabled:opacity-50"
    />
  )
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-1 py-1 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
      aria-pressed={checked}
    >
      <span
        className={[
          'relative w-9 h-5 rounded-full transition',
          checked ? 'bg-indigo-500' : 'bg-slate-700',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
      {label && <span className="text-sm text-slate-200">{label}</span>}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────
// page
// ────────────────────────────────────────────────────────────────────

export default function AIPage() {
  const [config, setConfig] = useState(emptyConfig())
  const [original, setOriginal] = useState(emptyConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveOk, setSaveOk] = useState(false)
  const [missingMigrations, setMissingMigrations] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('platform_ai_config')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (err) {
        if (err.code === '42P01' || /relation .* does not exist/i.test(err.message || '')) {
          setMissingMigrations(true)
        } else if (isMissingFunction(err)) {
          setMissingMigrations(true)
        } else {
          throw err
        }
        setConfig(emptyConfig())
        setOriginal(emptyConfig())
      } else if (!data) {
        setConfig(emptyConfig())
        setOriginal(emptyConfig())
      } else {
        // Strip out system_prompts on the way in — we no longer surface
        // them in the UI (see SURFACES comment above). Keep everything
        // else.
        const { system_prompts: _ignored, ...safe } = data
        const merged = { ...emptyConfig(), ...safe }
        merged.surface_models = merged.surface_models || {}
        setConfig(merged)
        setOriginal(merged)
      }
    } catch (e) {
      setError(e?.message || 'Failed to load platform_ai_config')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const dirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(original),
    [config, original]
  )

  function patch(p) {
    setConfig((prev) => ({ ...prev, ...p }))
    setSaveOk(false)
    setSaveError(null)
  }

  function patchSurfaceModel(surfaceId, model) {
    setConfig((prev) => {
      const next = { ...(prev.surface_models || {}) }
      if (!model) delete next[surfaceId]
      else next[surfaceId] = model
      return { ...prev, surface_models: next }
    })
    setSaveOk(false)
    setSaveError(null)
  }

  function changeProvider(provider) {
    const list = (MODELS_BY_PROVIDER[provider] || []).map((m) => m.id)
    setConfig((prev) => ({
      ...prev,
      provider,
      default_model: list.includes(prev.default_model) ? prev.default_model : list[0] || '',
    }))
    setSaveOk(false)
    setSaveError(null)
  }

  async function onSave() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      // Note: NOT writing system_prompts. The DB column is preserved for
      // backwards compatibility with the edge function's defaults.
      const payload = {
        is_enabled: !!config.is_enabled,
        provider: config.provider,
        default_model: config.default_model,
        surface_models: config.surface_models || {},
        max_tokens_per_call: Number(config.max_tokens_per_call) || 4000,
        max_cost_cents_per_call: Number(config.max_cost_cents_per_call) || 0,
      }

      let updateRes
      if (config.id) {
        updateRes = await supabase
          .from('platform_ai_config')
          .update(payload)
          .eq('id', config.id)
          .select('*')
          .single()
      } else {
        updateRes = await supabase
          .from('platform_ai_config')
          .insert(payload)
          .select('*')
          .single()
      }
      if (updateRes.error) throw updateRes.error

      const { system_prompts: _ignored, ...safe } = updateRes.data
      const next = { ...emptyConfig(), ...safe }
      next.surface_models = next.surface_models || {}
      setConfig(next)
      setOriginal(next)
      setSaveOk(true)

      // Best-effort audit log
      await supabase.rpc('log_admin_action', {
        p_action: 'ai_config_update',
        p_metadata: {
          provider: payload.provider,
          default_model: payload.default_model,
          is_enabled: payload.is_enabled,
          surfaces_with_overrides: Object.keys(payload.surface_models).length,
        },
      }).catch(() => {})
    } catch (e) {
      setSaveError(e?.message || 'Failed to save AI configuration')
    } finally {
      setSaving(false)
    }
  }

  function onReset() {
    setConfig(original)
    setSaveOk(false)
    setSaveError(null)
  }

  // ── UI ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-[1100px]">
      <PageTitle title="AI Settings" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-indigo-300" aria-hidden="true" />
            AI Settings
          </h1>
          <p className="text-sm text-slate-500">
            Platform-wide configuration for Orin's centralized AI service.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge enabled={!!config.is_enabled} />
        </div>
      </div>

      {missingMigrations && (
        <Banner tone="warning" title="platform_ai_config table missing">
          The <code className="px-1 py-0.5 bg-black/30 rounded">platform_ai_config</code> table
          is not deployed. Apply migration{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">103_platform_ai_secret.sql</code>{' '}
          to your Supabase project.
        </Banner>
      )}

      {error && !missingMigrations && (
        <Banner tone="danger" title="Failed to load configuration">{error}</Banner>
      )}

      {/* API key card — paste, test, save without leaving the dashboard. */}
      <APIKeyCard
        config={config}
        onPersisted={(persisted) => {
          // After a successful save, reload the config so the masked key
          // / set_at / health all show the new state.
          load()
        }}
      />

      {/* Recommendation note */}
      <Banner tone="info" title="Fast tier is recommended for the best price/performance">
        <p>
          <strong>Orin AI · Fast</strong> costs roughly{' '}
          <strong>$0.80 per 1M input tokens</strong> and{' '}
          <strong>$4 per 1M output tokens</strong>. That's 4×–10× cheaper than the
          Standard tier on the same task. Use Fast unless a specific surface really
          needs more horsepower.
        </p>
      </Banner>

      {/* Master switch */}
      <SectionCard
        title="Master switch"
        subtitle="Globally enable or disable AI features across the platform"
      >
        {loading ? (
          <Skeleton width="60%" height={28} />
        ) : (
          <div className="flex items-center justify-between gap-4 py-1">
            <div>
              <div className="text-sm text-slate-100 font-medium">
                AI is {config.is_enabled ? 'enabled' : 'disabled'} platform-wide
              </div>
              <div className="text-xs text-slate-500 mt-1">
                When disabled, all AI surfaces refuse new requests at the edge function level.
                Existing in-flight calls will complete.
              </div>
            </div>
            <Toggle
              checked={!!config.is_enabled}
              onChange={(v) => patch({ is_enabled: v })}
              disabled={loading}
            />
          </div>
        )}
      </SectionCard>

      {/* Provider + default model */}
      <SectionCard
        title="Provider & default model"
        subtitle="The model used for any surface that doesn't override it"
      >
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton width="100%" height={36} />
            <Skeleton width="100%" height={36} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Provider">
              <Select
                value={config.provider}
                onChange={changeProvider}
                options={PROVIDERS}
                disabled={loading}
              />
            </Field>
            <Field label="Default model">
              <Select
                value={config.default_model}
                onChange={(v) => patch({ default_model: v })}
                options={MODELS_BY_PROVIDER[config.provider] || []}
                disabled={loading}
              />
            </Field>
          </div>
        )}
      </SectionCard>

      {/* Per-surface model overrides */}
      <SectionCard
        title="Per-surface model overrides"
        subtitle="Pin specific surfaces to a different model than the default"
      >
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={36} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {SURFACES.map((s) => {
              const list = MODELS_BY_PROVIDER[config.provider] || []
              const surfaceModel = config.surface_models?.[s.id] || ''
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-slate-800/40 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 font-medium">{s.label}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      <code className="text-slate-400">{s.id}</code> · {s.hint}
                    </div>
                  </div>
                  <div className="w-56 shrink-0">
                    <Select
                      value={surfaceModel}
                      onChange={(v) => patchSurfaceModel(s.id, v)}
                      options={[
                        { id: '', label: `Use default (${config.default_model})` },
                        ...list,
                      ]}
                      disabled={loading}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Limits */}
      <SectionCard
        title="Per-call limits"
        subtitle="Hard caps applied to every AI request, regardless of surface or org"
      >
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton width="100%" height={36} />
            <Skeleton width="100%" height={36} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Max tokens per call"
              hint="Upper bound on input + output tokens for any single request."
            >
              <NumberInput
                value={config.max_tokens_per_call}
                onChange={(v) => patch({ max_tokens_per_call: v })}
                min={1}
                max={1_000_000}
                disabled={loading}
              />
            </Field>
            <Field
              label="Max cost per call (cents)"
              hint={`${formatDollarsFromCents(config.max_cost_cents_per_call)} hard cap per call`}
            >
              <NumberInput
                value={config.max_cost_cents_per_call}
                onChange={(v) => patch({ max_cost_cents_per_call: v })}
                min={0}
                max={1_000_000}
                disabled={loading}
              />
            </Field>
          </div>
        )}
      </SectionCard>

      {/* Save bar */}
      <div className="sticky bottom-4 z-10">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/95 backdrop-blur shadow-xl shadow-black/40 px-5 py-3 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            {saveError ? (
              <span className="inline-flex items-center gap-1.5 text-red-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                {saveError}
              </span>
            ) : saveOk ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved.
              </span>
            ) : dirty ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <Bot className="w-3.5 h-3.5" />
                Up to date.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={!dirty || saving || loading}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving || loading || missingMigrations}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save AI settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// APIKeyCard — paste, test, save the Anthropic key without leaving here.
// ────────────────────────────────────────────────────────────────────
//
// Flow:
//   1. On mount, call admin-ai-status → shows current key state, masked
//      key from the saved row, last health check.
//   2. User types a new key → "Test connection" calls
//      admin-ai-status({ key }) which validates the candidate key against
//      Anthropic without persisting.
//   3. "Save key" calls admin-ai-set-key({ key }), which validates AND
//      persists via the set_platform_ai_key RPC. The card then reloads
//      itself so the masked key, set_at, and health pill all reflect the
//      new state.
//
// We never echo the typed key back. We never store it client-side.

function APIKeyCard({ config, onPersisted }) {
  const [status, setStatus] = useState(null)     // health snapshot (admin-ai-status)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState(null)

  const [draftKey, setDraftKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)  // { ok, message, latency_ms }
  const [savingKey, setSavingKey] = useState(false)
  const [saveResult, setSaveResult] = useState(null)  // { ok, message, masked, latency_ms }

  // Load current status on mount + after any save
  const reloadStatus = useCallback(async () => {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-ai-status', {
        body: {},
      })
      if (error) throw error
      setStatus(data)
    } catch (e) {
      setStatusError(e?.message || String(e))
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => { reloadStatus() }, [reloadStatus])

  const checks = status?.checks || {}

  // Compute a single health tier for the pill at the top of the card.
  const tier = !status
    ? 'loading'
    : status.ok
      ? 'healthy'
      : !checks.secret_set
        ? 'missing'
        : !checks.api_reachable
          ? 'broken'
          : 'broken'

  const tierMeta = {
    loading: { color: 'slate',   label: 'Checking…',         dot: 'bg-slate-400 animate-pulse' },
    healthy: { color: 'emerald', label: 'Connected',         dot: 'bg-emerald-400' },
    missing: { color: 'amber',   label: 'No key set',        dot: 'bg-amber-400' },
    broken:  { color: 'rose',    label: 'Connection error',  dot: 'bg-rose-400' },
  }[tier] || { color: 'slate', label: 'Unknown', dot: 'bg-slate-400' }

  // ── Test the candidate key against Anthropic without persisting.
  async function onTest() {
    setTesting(true)
    setTestResult(null)
    setSaveResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-ai-status', {
        body: { key: draftKey.trim() },
      })
      if (error) throw error
      // admin-ai-status returns { ok, checks: {...} }
      const innerChecks = data?.checks || {}
      if (data?.ok) {
        setTestResult({
          ok: true,
          message: `Connected · ${innerChecks.api_latency_ms}ms · ${innerChecks.api_model}`,
          latency_ms: innerChecks.api_latency_ms,
        })
      } else {
        setTestResult({
          ok: false,
          message:
            innerChecks.api_error ||
            (innerChecks.secret_format_ok === false
              ? "Doesn't match the expected key pattern (sk-ant-…)"
              : 'Orin AI rejected the key.'),
        })
      }
    } catch (e) {
      setTestResult({ ok: false, message: e?.message || String(e) })
    } finally {
      setTesting(false)
    }
  }

  // ── Save: validates + persists in one round trip.
  async function onSaveKey() {
    setSavingKey(true)
    setTestResult(null)
    setSaveResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('admin-ai-set-key', {
        body: { key: draftKey.trim(), mode: 'save' },
      })
      if (error) throw error
      if (data?.ok) {
        setSaveResult({
          ok: true,
          message: `Saved · ${data.masked} · ${data.latency_ms}ms ping`,
          masked: data.masked,
          latency_ms: data.latency_ms,
        })
        setDraftKey('')   // clear the typed key from memory
        setShowKey(false)
        // Refresh local status + parent config (so page-level state matches)
        reloadStatus()
        onPersisted?.(data)
      } else {
        setSaveResult({
          ok: false,
          message: data?.message || 'Save failed.',
          code: data?.code,
        })
      }
    } catch (e) {
      setSaveResult({ ok: false, message: e?.message || String(e) })
    } finally {
      setSavingKey(false)
    }
  }

  const draftValid = draftKey.trim().length > 0
  const lastSetMasked  = config?.api_key_masked || null
  const lastSetAt      = config?.api_key_set_at || null
  const consecutiveFailures = Number(config?.consecutive_failures || 0)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Plug className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-200">API key</h3>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-${tierMeta.color}-500/15 text-${tierMeta.color}-300`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${tierMeta.dot}`} />
              {tierMeta.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Paste the Orin AI API key below. Hit <strong>Test</strong> to ping the
            real API without saving, or <strong>Save</strong> to validate AND persist
            in one step. The key is masked after save and never echoed back.
          </p>
        </div>
        <button
          type="button"
          onClick={reloadStatus}
          disabled={statusLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {statusLoading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</>
          ) : (
            <><Zap className="w-3.5 h-3.5" /> Re-check</>
          )}
        </button>
      </div>

      {/* Current state row — masked key, set-at, source */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <CurrentField
          icon={KeyRound}
          label="Saved key"
          value={lastSetMasked || '— none saved —'}
          mono
        />
        <CurrentField
          icon={CheckCircle2}
          label="Saved at"
          value={lastSetAt ? formatRelative(lastSetAt) : '— never —'}
        />
        <CurrentField
          icon={Plug}
          label="Source"
          value={
            checks.secret_source === 'database'  ? 'Database (this page)' :
            checks.secret_source === 'env'       ? 'Edge function env (legacy)' :
            checks.secret_source === 'candidate' ? 'Candidate (testing)' :
            checks.secret_source === 'none'      ? 'None set' :
            statusLoading                        ? 'Checking…' :
            'Unknown'
          }
        />
      </div>

      {consecutiveFailures > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 inline-flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>{consecutiveFailures}</strong> consecutive health-check failure{consecutiveFailures === 1 ? '' : 's'}
            {' '}— the saved key may have been rotated upstream.
          </span>
        </div>
      )}

      {/* Paste-a-new-key row */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type={showKey ? 'text' : 'password'}
              value={draftKey}
              onChange={(e) => { setDraftKey(e.target.value); setTestResult(null); setSaveResult(null) }}
              placeholder="sk-ant-api03-…"
              autoComplete="off"
              spellCheck={false}
              className="w-full pl-8 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 transition"
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            type="button"
            onClick={onTest}
            disabled={!draftValid || testing || savingKey}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {testing
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…</>
              : <><Zap className="w-3.5 h-3.5" /> Test</>
            }
          </button>

          <button
            type="button"
            onClick={onSaveKey}
            disabled={!draftValid || testing || savingKey}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {savingKey
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : <><Save className="w-3.5 h-3.5" /> Save</>
            }
          </button>

          {draftKey && !savingKey && !testing && (
            <button
              type="button"
              onClick={() => { setDraftKey(''); setTestResult(null); setSaveResult(null) }}
              className="inline-flex items-center gap-1 px-2 py-2 text-xs rounded-lg text-slate-500 hover:text-slate-200 transition shrink-0"
              aria-label="Clear"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Live preview of typed key (always masked) — reassures the user
            their paste worked without leaking the secret. */}
        {draftKey && !showKey && (
          <div className="text-[11px] text-slate-500 font-mono pl-1">
            Typing: <span className="text-slate-400">{clientMask(draftKey)}</span>
            <span className="ml-2 text-slate-600">({draftKey.length} chars)</span>
          </div>
        )}

        {/* Test/save feedback */}
        {testResult && (
          <ResultPill ok={testResult.ok} text={testResult.message} />
        )}
        {saveResult && (
          <ResultPill ok={saveResult.ok} text={saveResult.message} />
        )}
      </div>

      {/* Initial-status error (network failure to even reach the edge fn) */}
      {statusError && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Could not reach admin-ai-status: {statusError}
        </div>
      )}
    </div>
  )
}

function CurrentField({ icon: Icon, label, value, mono }) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`text-sm text-slate-200 ${mono ? 'font-mono' : ''} truncate`} title={value}>
        {value}
      </div>
    </div>
  )
}

function ResultPill({ ok, text }) {
  return (
    <div
      className={[
        'rounded-lg border px-3 py-2 text-xs flex items-start gap-2',
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-100',
      ].join(' ')}
    >
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-300" />
      ) : (
        <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-300" />
      )}
      <span>{text}</span>
    </div>
  )
}
