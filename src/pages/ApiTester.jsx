import { useCallback, useState } from 'react'
import { Send, Play, Copy, Code } from 'lucide-react'
import { supabase } from '../services/supabase'
import Banner from '../components/ui/Banner'

// Hard-coded list. The Supabase Functions list endpoint requires a
// service-role key + the Management API to enumerate, which we don't
// want from the browser. Keeping this list in code keeps the experience
// snappy and predictable; new functions just need a one-line add.
const FUNCTIONS = [
  { id: 'admin-ai-status',                bodyHint: '{}', desc: 'Check current AI key + Anthropic ping.' },
  { id: 'admin-ai-set-key',               bodyHint: '{"key":"sk-ant-…","mode":"test"}', desc: 'Validate (mode=test) or persist (mode=save) Anthropic key.' },
  { id: 'admin-impersonate',              bodyHint: '{"target_user_id":"<uuid>","target_org_id":"<uuid>"}', desc: 'Mint a magic link for a target user.' },
  { id: 'admin-sql-run',                  bodyHint: '{"query":"SELECT now()"}', desc: 'Run a single SQL statement (super-admin only).' },
  { id: 'admin-force-refresh-tokens',     bodyHint: '{"organization_id":"<uuid>"}', desc: 'Mark org integrations for OAuth refresh.' },
  { id: 'record-auth-event',              bodyHint: '{"event_type":"signin_success","user_id":"<uuid>"}', desc: 'Test auth event sink.' },
  { id: 'ai-completion',                  bodyHint: '{"prompt":"hi","surface":"chat-widget"}', desc: 'Run an AI completion (uses platform key).' },
  { id: 'observe-capture',                bodyHint: '{"events":[{"kind":"test","payload":{}}]}', desc: 'Send observability events.' },
  { id: 'reach-knowledge-ingest',         bodyHint: '{"widget_id":"<uuid>","sources":[]}', desc: 'Re-ingest knowledge for a widget.' },
  { id: 'send-message',                   bodyHint: '{}', desc: 'Generic message sender.' },
  { id: 'inbound-lead',                   bodyHint: '{}', desc: 'Inbound lead webhook handler.' },
  { id: 'send-invite',                    bodyHint: '{}', desc: 'Send an org invite email.' },
  { id: 'accept-invite',                  bodyHint: '{}', desc: 'Accept an org invite.' },
  { id: 'ghl-proxy',                      bodyHint: '{}', desc: 'GHL proxy.' },
  { id: 'ghl-sync',                       bodyHint: '{}', desc: 'Trigger GHL sync.' },
  { id: 'ghl-webhook',                    bodyHint: '{}', desc: 'GHL webhook handler.' },
  { id: 'meta-ads-sync',                  bodyHint: '{}', desc: 'Trigger Meta ads sync.' },
  { id: 'meta-ads-action',                bodyHint: '{}', desc: 'Meta ads action endpoint.' },
  { id: 'whatsapp-proxy',                 bodyHint: '{}', desc: 'WhatsApp proxy.' },
  { id: 'twilio-webhook',                 bodyHint: '{}', desc: 'Twilio webhook handler.' },
  { id: 'public-event',                   bodyHint: '{}', desc: 'Public event metadata.' },
  { id: 'public-invoice',                 bodyHint: '{}', desc: 'Public invoice metadata.' },
  { id: 'public-offer',                   bodyHint: '{}', desc: 'Public offer metadata.' },
  { id: 'booking-public-availability',    bodyHint: '{}', desc: 'Public booking availability.' },
  { id: 'booking-public-create',          bodyHint: '{}', desc: 'Public booking create.' },
  { id: 'booking-public-cancel',          bodyHint: '{}', desc: 'Public booking cancel.' },
  { id: 'booking-public-reschedule',      bodyHint: '{}', desc: 'Public booking reschedule.' },
  { id: 'contract-ai',                    bodyHint: '{}', desc: 'Contract AI endpoint.' },
  { id: 'contract-sign',                  bodyHint: '{}', desc: 'Contract sign endpoint.' },
  { id: 'email-send',                     bodyHint: '{}', desc: 'Send a transactional email.' },
  { id: 'payment-create-link',            bodyHint: '{}', desc: 'Create a payment link.' },
  { id: 'payment-test',                   bodyHint: '{}', desc: 'Payment test endpoint.' },
  { id: 'payment-webhook',                bodyHint: '{}', desc: 'Payment webhook handler.' },
  { id: 'compass-thresholds-check',       bodyHint: '{}', desc: 'Compass thresholds checker.' },
  { id: 'observe-alert-cron',             bodyHint: '{}', desc: 'Observability alert cron.' },
  { id: 'payment-health-cron',            bodyHint: '{}', desc: 'Payment health cron.' },
  { id: 'booking-reminder-cron',          bodyHint: '{}', desc: 'Booking reminder cron.' },
  { id: 'reach-knowledge-source',         bodyHint: '{}', desc: 'Reach knowledge source.' },
  { id: 'widget-public-event',            bodyHint: '{}', desc: 'Widget public event.' },
  { id: 'widget-public-handoff',          bodyHint: '{}', desc: 'Widget public handoff.' },
  { id: 'widget-public-message',          bodyHint: '{}', desc: 'Widget public message.' },
]

export default function ApiTester() {
  const [fnId, setFnId] = useState(FUNCTIONS[0].id)
  const [body, setBody] = useState('{}')
  const [running, setRunning] = useState(false)
  const [response, setResponse] = useState(null)
  const [error, setError] = useState(null)
  const meta = FUNCTIONS.find((f) => f.id === fnId) || FUNCTIONS[0]

  function onPickFn(id) {
    setFnId(id)
    setBody(FUNCTIONS.find((f) => f.id === id)?.bodyHint || '{}')
    setResponse(null)
    setError(null)
  }

  const run = useCallback(async () => {
    setRunning(true)
    setError(null)
    setResponse(null)
    let parsed
    try { parsed = JSON.parse(body || '{}') } catch (e) {
      setError(`Invalid JSON in body: ${e.message}`)
      setRunning(false)
      return
    }
    const start = Date.now()
    try {
      const { data, error: err } = await supabase.functions.invoke(fnId, { body: parsed })
      const duration_ms = Date.now() - start
      if (err) {
        setError(`${err.message || 'Function returned an error'} (after ${duration_ms}ms)`)
      } else {
        setResponse({ ok: true, status: 200, duration_ms, data })
      }
      // best-effort audit
      supabase.rpc('record_admin_action', {
        p_action: 'edge_function_test',
        p_target_type: 'edge_function',
        p_target_id: null,
        p_payload: { function: fnId, status: err ? 'error' : 'ok', duration_ms },
      }).catch(() => {})
    } catch (e) {
      setError(e?.message || 'Failed to invoke')
    } finally {
      setRunning(false)
    }
  }, [fnId, body])

  function copyResponse() {
    if (!response) return
    navigator.clipboard?.writeText(JSON.stringify(response.data, null, 2)).catch(() => {})
  }

  return (
    <div className="space-y-4 max-w-[1300px]">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
          <Send className="w-6 h-6 text-indigo-300" />
          Edge function tester
        </h1>
        <p className="text-sm text-slate-500">
          Pick a deployed function, send a JSON body, see the response. Each call is recorded in the audit log.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-4 space-y-4">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Function</span>
          <select value={fnId} onChange={(e) => onPickFn(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 font-mono focus:border-indigo-500 focus:outline-none">
            {FUNCTIONS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
          </select>
          <span className="block text-[11px] text-slate-500 mt-1">{meta.desc}</span>
        </label>

        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Body (JSON)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {error && <Banner tone="danger" title="Request failed">{error}</Banner>}

      {response && (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
          <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-slate-300 inline-flex items-center gap-2">
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              Status {response.status} · {response.duration_ms}ms
            </span>
            <button onClick={copyResponse} className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition">
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
          <pre className="p-3 text-xs text-slate-200 font-mono overflow-auto max-h-[480px]">
{typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
