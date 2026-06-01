import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mail, Send, Sun, Moon, Smartphone, Monitor, X, Code2, Eye, FileText, Loader2 } from 'lucide-react'
import { supabase } from '../services/supabase'
import PageTitle from '../components/ui/PageTitle'
import ErrorCard from '../components/ui/ErrorCard'

// ----------------------------------------------------------------------------
// Email Templates admin page
//
// Lists every renderable template (mig 158 + email-system v2). Click a card
// → drawer opens with:
//   * Live preview iframe (full size)
//   * Light / dark, mobile / desktop toggles
//   * Sample-data editor (JSON) with re-render on every keystroke
//   * "Send test to me" → fires the template to the admin's auth email
//   * Source view tab — rendered HTML + plain-text fallback
//
// All renders go through the admin-email-template-preview edge function,
// which gates on super_admins server-side.
// ----------------------------------------------------------------------------

// Static catalogue of templates surfaced in the UI. Synced manually with
// SAMPLE_DATA in supabase/functions/_shared/email/index.ts — server is the
// source of truth, this is just for the card grid + initial JSON until the
// drawer fetches the live render.
const TEMPLATES = [
  { name: 'welcome',                    label: 'Welcome',                    description: 'Sent right after signup. Friendly tone, onboarding checklist.' },
  { name: 'org-invite',                 label: 'Org invite',                 description: 'Teammate invitation with inviter card + role + personal note.' },
  { name: 'password-reset',             label: 'Password reset',             description: 'Minimal, security-focused. Single CTA + expiry note.' },
  { name: 'new-location-signin',        label: 'New-location sign-in',       description: 'Security alert with time, IP, city, browser, device.' },
  { name: 'migration-started',          label: 'Migration started',          description: 'Lark workspace import kickoff — sets expectations.' },
  { name: 'migration-completed',        label: 'Migration completed',        description: 'Admin reconciliation report. Showcase template.' },
  { name: 'org-invite-from-migration',  label: 'Org invite (migration)',     description: 'Set-password email for users auto-created by an import.' },
  { name: 'weekly-digest',              label: 'Weekly digest',              description: 'Pipeline activity recap with AI-suggested actions.' },
  { name: 'receipt',                    label: 'Receipt',                    description: 'Stripe-style payment receipt with line items + plan.' },
  { name: 'generic-notification',       label: 'Generic notification',       description: 'Fallback transactional template with title + body + CTA.' },
]

// Indigo-violet thumbnail gradients keyed by template name. Pure decoration —
// gives the cards distinct visual weight without rendering full HTML.
const THUMB_GRADIENTS = {
  'welcome':                   'linear-gradient(135deg, #6366F1, #8B5CF6)',
  'org-invite':                'linear-gradient(135deg, #4F46E5, #6366F1)',
  'password-reset':            'linear-gradient(135deg, #1F2937, #4338CA)',
  'new-location-signin':       'linear-gradient(135deg, #B45309, #F59E0B)',
  'migration-started':         'linear-gradient(135deg, #2563EB, #7C3AED)',
  'migration-completed':       'linear-gradient(135deg, #047857, #059669)',
  'org-invite-from-migration': 'linear-gradient(135deg, #6366F1, #EC4899)',
  'weekly-digest':             'linear-gradient(135deg, #8B5CF6, #EC4899)',
  'receipt':                   'linear-gradient(135deg, #0F172A, #475569)',
  'generic-notification':      'linear-gradient(135deg, #475569, #6366F1)',
}

// The supabase client doesn't expose `supabaseUrl` publicly in the v2 SDK,
// so we resolve the functions URL the same way the rest of the admin codebase
// does: env var first, hard-coded project URL fallback.
const FUNCTIONS_URL =
  (import.meta.env.VITE_SUPABASE_URL || 'https://zvopcktyvffcyvbjrisj.supabase.co') + '/functions/v1'

async function callPreview(op, payload = {}) {
  const session = (await supabase.auth.getSession()).data.session
  if (!session?.access_token) throw new Error('Not signed in')
  const resp = await fetch(`${FUNCTIONS_URL}/admin-email-template-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ op, ...payload }),
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json?.error || `HTTP ${resp.status}`)
  return json
}

function TemplateCard({ template, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(template)}
      className="group text-left rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:border-indigo-500/60 transition-all overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div
        className="h-28 w-full flex items-center justify-center"
        style={{ background: THUMB_GRADIENTS[template.name] || 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
      >
        <Mail className="w-7 h-7 text-white/80" aria-hidden="true" />
      </div>
      <div className="p-4">
        <div className="text-sm font-semibold text-slate-100 mb-1">{template.label}</div>
        <div className="text-xs text-slate-400 line-clamp-2">{template.description}</div>
        <div className="mt-3 text-[10px] uppercase tracking-[0.16em] font-medium text-slate-500 font-mono">{template.name}</div>
      </div>
    </button>
  )
}

function PreviewDrawer({ template, onClose }) {
  const [json, setJson]               = useState('{}')
  const [parseError, setParseError]   = useState(null)
  const [rendered, setRendered]       = useState(null)
  const [renderError, setRenderError] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [tab, setTab]                 = useState('preview')   // 'preview' | 'html' | 'text'
  const [device, setDevice]           = useState('desktop')   // 'desktop' | 'mobile'
  const [theme, setTheme]             = useState('light')     // 'light' | 'dark'
  const [sending, setSending]         = useState(false)
  const [sentMsg, setSentMsg]         = useState(null)
  const debounceRef = useRef(null)

  // Initial fetch — pulls SAMPLE_DATA from server so we don't drift.
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        setLoading(true)
        const list = await callPreview('list-templates')
        if (cancelled) return
        const sample = (list?.templates || []).find((t) => t.name === template.name)?.sample || {}
        const initialJson = JSON.stringify(sample, null, 2)
        setJson(initialJson)
        // Trigger initial render with sample.
        await renderNow(sample)
      } catch (e) {
        if (!cancelled) setRenderError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.name])

  const renderNow = useCallback(async (data) => {
    setRenderError(null)
    try {
      const result = await callPreview('render', { template: template.name, data })
      setRendered({ subject: result.subject, html: result.html, text: result.text })
    } catch (e) {
      setRenderError(e.message)
    }
  }, [template.name])

  // Debounce JSON edits → re-render.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        const parsed = JSON.parse(json)
        setParseError(null)
        renderNow(parsed)
      } catch (e) {
        setParseError(e.message)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [json, renderNow])

  // Compose iframe srcdoc with optional dark wrapper. Some clients render
  // dark-mode previews differently — the wrapper here is just a quick sanity
  // check for "does the email survive a dark BG?".
  const iframeSrcDoc = useMemo(() => {
    if (!rendered?.html) return ''
    if (theme === 'dark') {
      return `<!DOCTYPE html><html><head><meta name="color-scheme" content="dark"><style>html,body{background:#0F172A;}</style></head><body>${rendered.html}</body></html>`
    }
    return rendered.html
  }, [rendered, theme])

  const sendTestToMe = useCallback(async () => {
    setSentMsg(null)
    setSending(true)
    try {
      const parsed = JSON.parse(json)
      const result = await callPreview('send-test', { template: template.name, data: parsed })
      setSentMsg(`Sent → ${result.sent_to}`)
    } catch (e) {
      setSentMsg(`Send failed: ${e.message}`)
    } finally {
      setSending(false)
    }
  }, [json, template.name])

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={`Preview: ${template.label}`}>
      {/* Backdrop */}
      <div className="flex-1 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      {/* Drawer */}
      <div className="w-full max-w-[min(96vw,1280px)] bg-slate-950 border-l border-slate-800 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-mono">{template.name}</div>
            <div className="text-base font-semibold text-slate-100">{template.label}</div>
            {rendered?.subject && (
              <div className="text-xs text-slate-400 mt-0.5">Subject: <span className="text-slate-200">{rendered.subject}</span></div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close preview" className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — split panel */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] overflow-hidden">
          {/* Left: data editor */}
          <div className="border-r border-slate-800 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" /> Sample data</span>
              {parseError ? (
                <span className="text-[11px] text-amber-400">{parseError.slice(0, 64)}</span>
              ) : (
                <span className="text-[11px] text-emerald-400">JSON ok</span>
              )}
            </div>
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              className="flex-1 bg-slate-950 text-slate-200 font-mono text-[12px] leading-snug p-4 outline-none resize-none border-none"
              aria-label="Sample data JSON"
            />
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={sendTestToMe}
                disabled={sending || !!parseError}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send test to me
              </button>
              {sentMsg && <span className="text-[11px] text-slate-400">{sentMsg}</span>}
            </div>
          </div>

          {/* Right: preview / source */}
          <div className="flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 flex-wrap">
              <Tab active={tab === 'preview'} onClick={() => setTab('preview')} icon={Eye}     label="Preview" />
              <Tab active={tab === 'html'}    onClick={() => setTab('html')}    icon={Code2}   label="HTML" />
              <Tab active={tab === 'text'}    onClick={() => setTab('text')}    icon={FileText} label="Plain text" />
              <span className="ml-auto" />
              {tab === 'preview' && (
                <>
                  <Toggle
                    options={[
                      { value: 'desktop', icon: Monitor, label: 'Desktop' },
                      { value: 'mobile',  icon: Smartphone, label: 'Mobile' },
                    ]}
                    value={device}
                    onChange={setDevice}
                  />
                  <Toggle
                    options={[
                      { value: 'light', icon: Sun,  label: 'Light' },
                      { value: 'dark',  icon: Moon, label: 'Dark' },
                    ]}
                    value={theme}
                    onChange={setTheme}
                  />
                </>
              )}
            </div>
            <div className="flex-1 overflow-auto bg-slate-900/40">
              {renderError && (
                <div className="p-6">
                  <ErrorCard title="Render error" message={renderError} />
                </div>
              )}
              {!renderError && tab === 'preview' && rendered?.html && (
                <div className={`flex justify-center p-6 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-200'} min-h-full`}>
                  <iframe
                    title={`Preview: ${template.label}`}
                    srcDoc={iframeSrcDoc}
                    sandbox=""
                    style={{
                      width: device === 'mobile' ? 380 : 720,
                      height: '90vh',
                      maxWidth: '100%',
                      border: '1px solid rgba(15,23,42,0.15)',
                      background: '#fff',
                      borderRadius: 8,
                    }}
                  />
                </div>
              )}
              {!renderError && tab === 'html' && (
                <pre className="p-6 text-[12px] font-mono text-slate-200 leading-snug whitespace-pre-wrap break-words">{rendered?.html || ''}</pre>
              )}
              {!renderError && tab === 'text' && (
                <pre className="p-6 text-[13px] font-mono text-slate-200 leading-relaxed whitespace-pre-wrap">{rendered?.text || ''}</pre>
              )}
              {loading && !rendered && (
                <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading preview…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors',
        active
          ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent',
      ].join(' ')}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function Toggle({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-800 overflow-hidden" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={[
            'inline-flex items-center gap-1 text-xs px-2.5 py-1.5 transition-colors',
            value === opt.value ? 'bg-slate-800/80 text-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30',
          ].join(' ')}
        >
          <opt.icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function EmailTemplates() {
  const [active, setActive] = useState(null)

  return (
    <>
      <PageTitle title="Email templates" />
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-100">Email templates</h1>
          <p className="mt-1 text-sm text-slate-400">
            Live preview every transactional template. Click a card to open the inspector — edit the sample data,
            check light + dark + mobile, and send a test to yourself.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t.name} template={t} onOpen={setActive} />
          ))}
        </div>
      </div>
      {active && <PreviewDrawer template={active} onClose={() => setActive(null)} />}
    </>
  )
}
