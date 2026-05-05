import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plug,
  Save,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'

// ────────────────────────────────────────────────────────────────────
// constants
// ────────────────────────────────────────────────────────────────────

// Single-vendor architecture (consolidated to Anthropic in migration 101).
// The provider dropdown is a one-option list now; we keep the field so we
// can re-add other providers later if needed without a schema change.
const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
]

// Haiku is listed first and recommended — it's the cheapest Claude.
// Super-admins can still override per surface (Sonnet/Opus options remain).
const MODELS_BY_PROVIDER = {
  anthropic: [
    { id: 'claude-haiku-4-5',           label: 'claude-haiku-4-5 (recommended)' },
    { id: 'claude-sonnet-4-5-20251022', label: 'claude-sonnet-4-5' },
    { id: 'claude-opus-4-5',            label: 'claude-opus-4-5' },
  ],
}

const SURFACES = [
  { id: 'chat-widget',        label: 'Chat widget',        hint: 'In-app conversational helper' },
  { id: 'compass-narrative',  label: 'Compass narrative',  hint: 'Daily/weekly executive summary' },
  { id: 'message-assistant',  label: 'Message assistant',  hint: 'Inline message rewrite/expand' },
  { id: 'quick-reply',        label: 'Quick reply',        hint: 'One-tap reply suggestions' },
  { id: 'data-extractor',     label: 'Data extractor',     hint: 'Pull structured fields from text' },
]

const SUPABASE_PROJECT_REF = 'tnafbfjthhykvecepxla'
const SECRETS_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/functions`

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

function emptyConfig() {
  return {
    is_enabled: true,
    provider: 'anthropic',
    default_model: 'claude-haiku-4-5',
    surface_models: {},
    system_prompts: {},
    max_tokens_per_call: 4000,
    max_cost_cents_per_call: 50,
  }
}

function formatDollarsFromCents(cents) {
  const v = Number(cents) || 0
  return `$${(v / 100).toFixed(2)}`
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
      className={[
        'inline-flex items-center gap-2 px-1 py-1 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed',
      ].join(' ')}
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
        // 42P01 = relation does not exist
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
        const merged = { ...emptyConfig(), ...data }
        // Defensive: ensure JSONB fields are always objects
        merged.surface_models = merged.surface_models || {}
        merged.system_prompts = merged.system_prompts || {}
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

  function patchSystemPrompt(surfaceId, text) {
    setConfig((prev) => {
      const next = { ...(prev.system_prompts || {}) }
      if (text == null || text === '') delete next[surfaceId]
      else next[surfaceId] = text
      return { ...prev, system_prompts: next }
    })
    setSaveOk(false)
    setSaveError(null)
  }

  // When the provider changes, snap the default model to the first option
  // for the new provider if the current selection is from the wrong provider.
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
      const payload = {
        is_enabled: !!config.is_enabled,
        provider: config.provider,
        default_model: config.default_model,
        surface_models: config.surface_models || {},
        system_prompts: config.system_prompts || {},
        max_tokens_per_call: Number(config.max_tokens_per_call) || 4000,
        max_cost_cents_per_call: Number(config.max_cost_cents_per_call) || 0,
      }

      // Singleton row pattern: try update first, fall back to insert.
      let updateRes
      if (config.id) {
        updateRes = await supabase
          .from('platform_ai_config')
          .update(payload)
          .eq('id', config.id)
          .select('*')
          .single()
      } else {
        // No row yet — insert.
        updateRes = await supabase
          .from('platform_ai_config')
          .insert(payload)
          .select('*')
          .single()
      }
      if (updateRes.error) throw updateRes.error

      const next = { ...emptyConfig(), ...updateRes.data }
      next.surface_models = next.surface_models || {}
      next.system_prompts = next.system_prompts || {}
      setConfig(next)
      setOriginal(next)
      setSaveOk(true)

      // Best-effort audit log; don't fail the save if audit is unavailable.
      await supabase.rpc('log_admin_action', {
        p_action: 'ai_config_update',
        p_metadata: {
          provider: payload.provider,
          default_model: payload.default_model,
          is_enabled: payload.is_enabled,
          surfaces_with_overrides: Object.keys(payload.surface_models).length,
          surfaces_with_prompts: Object.keys(payload.system_prompts).length,
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-indigo-300" />
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
        <Banner tone="warning" title="Migrations 083/084 not yet applied">
          The <code className="px-1 py-0.5 bg-black/30 rounded">platform_ai_config</code> table
          and supporting RPCs are missing. Apply migrations{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">083_*</code> and{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">084_admin_ai_usage_rpcs.sql</code>{' '}
          to your Supabase project.
        </Banner>
      )}

      {error && !missingMigrations && (
        <Banner tone="danger" title="Failed to load configuration">{error}</Banner>
      )}

      {/* Connection health card — runs a real Anthropic API ping */}
      <ConnectionHealthCard />

      {/* API key location notice */}
      <Banner tone="warning" title="API key is managed in Supabase, not here">
        <p>
          The Anthropic master key is set as{' '}
          <code className="px-1 py-0.5 bg-black/30 rounded">ANTHROPIC_API_KEY</code>{' '}
          in Supabase edge function secrets. Manage it via the Supabase dashboard.
        </p>
        <p className="mt-2">
          <a
            href={SECRETS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-100 underline underline-offset-2"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Open Edge Function secrets in Supabase
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </Banner>

      {/* Recommendation note — Haiku is the cheapest Claude and the right
          default for almost everything. Surface overrides exist for the
          rare cases where Sonnet/Opus is genuinely worth the cost. */}
      <Banner tone="info" title="Haiku is recommended for the best price/performance">
        <p>
          <code className="px-1 py-0.5 bg-black/30 rounded">claude-haiku-4-5</code>{' '}
          costs roughly <strong>$0.80 per 1M input tokens</strong> and{' '}
          <strong>$4 per 1M output tokens</strong>. That's 4×–10× cheaper than Sonnet
          on the same task. Use Haiku unless a specific surface really needs more horsepower.
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

      {/* System prompts */}
      <SectionCard
        title="System prompts"
        subtitle="Override the system prompt sent to the model for each surface"
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={80} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {SURFACES.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-slate-500">
                    {s.label} prompt
                  </label>
                  <code className="text-[10px] text-slate-600">{s.id}</code>
                </div>
                <textarea
                  rows={4}
                  value={config.system_prompts?.[s.id] || ''}
                  onChange={(e) => patchSystemPrompt(s.id, e.target.value)}
                  placeholder={`System prompt for the ${s.label.toLowerCase()} surface…`}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none font-mono leading-relaxed"
                />
              </div>
            ))}
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
// ConnectionHealthCard — calls admin-ai-status edge function
// ────────────────────────────────────────────────────────────────────
//
// Real-time check of:
//   • Is ANTHROPIC_API_KEY set in Supabase?
//   • Does the key actually work (1-token Anthropic ping via Haiku)?
//   • What's the latency from edge fn → Anthropic?
// ────────────────────────────────────────────────────────────────────
function ConnectionHealthCard() {
  const [status, setStatus] = useState(null)   // null | { ok, checks, hint? }
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const runCheck = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.functions.invoke('admin-ai-status', {
        body: {},
      })
      if (err) throw err
      setStatus(data)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setRunning(false)
    }
  }, [])

  // Run once on mount so the card is informative immediately
  useEffect(() => { runCheck() }, [runCheck])

  // Compute the visual state
  const checks = status?.checks || {}
  const tier = !status
    ? 'loading'
    : status.ok
      ? 'healthy'
      : !checks.secret_set
        ? 'missing-key'
        : !checks.api_reachable
          ? 'unreachable'
          : 'broken'

  const tierMeta = {
    loading:     { color: 'slate',   icon: Loader2,    label: 'Checking…',          dot: 'bg-slate-400 animate-pulse' },
    healthy:     { color: 'emerald', icon: CheckCircle2, label: 'Connected',         dot: 'bg-emerald-400' },
    'missing-key':{color: 'amber',   icon: KeyRound,   label: 'API key missing',     dot: 'bg-amber-400' },
    unreachable: { color: 'rose',    icon: XCircle,    label: 'Unreachable',         dot: 'bg-rose-400' },
    broken:      { color: 'rose',    icon: AlertTriangle, label: 'Connection error', dot: 'bg-rose-400 animate-pulse' },
  }[tier]

  const Icon = tierMeta.icon

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Plug className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-200">Anthropic connection</h3>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-${tierMeta.color}-500/15 text-${tierMeta.color}-300`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${tierMeta.dot}`} />
              {tierMeta.label}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            One-call ping using your default model. Verifies the key, the network, and the Anthropic API in one shot.
          </p>
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/60 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {running ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Testing…
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              Test connection
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Could not call admin-ai-status: {error}
        </div>
      )}

      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CheckRow
            ok={checks.secret_set}
            label="ANTHROPIC_API_KEY is set"
            detail={checks.secret_set ? 'Found in edge function secrets' : 'Not configured'}
          />
          <CheckRow
            ok={checks.secret_format_ok}
            label="Key format looks valid"
            detail={checks.secret_format_ok ? 'sk-ant-* pattern' : 'Doesn\'t match expected pattern'}
          />
          <CheckRow
            ok={checks.api_reachable}
            label="Anthropic API reachable"
            detail={
              checks.api_reachable
                ? `${checks.api_latency_ms}ms latency`
                : checks.api_error
                  ? checks.api_error.slice(0, 100)
                  : 'No response'
            }
          />
          <CheckRow
            ok={checks.api_reachable}
            label="Default model responds"
            detail={
              checks.api_model
                ? `${checks.api_model} returned: "${(checks.api_response_text || '').trim() || '...'}"`
                : 'No response yet'
            }
          />
        </div>
      )}

      {status && !status.ok && status.hint && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200 whitespace-pre-line">
          <div className="font-semibold mb-1">How to fix</div>
          {status.hint}
        </div>
      )}

      {checks.last_checked_at && (
        <div className="mt-3 text-[11px] text-slate-500">
          Last checked: {new Date(checks.last_checked_at).toLocaleString()}
        </div>
      )}
    </div>
  )
}

function CheckRow({ ok, label, detail }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
      <div className="flex items-center gap-2 mb-0.5">
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        )}
        <span className="text-xs font-medium text-slate-200">{label}</span>
      </div>
      <div className="text-[11px] text-slate-400 pl-5.5">{detail}</div>
    </div>
  )
}
