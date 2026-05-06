import { useEffect, useRef, useState } from 'react'
import { Radio } from 'lucide-react'
import { supabase } from '../../services/supabase'

const SURFACE_TONE = {
  'chat-widget':       'bg-indigo-500/15 border-indigo-500/30 text-indigo-200',
  'compass-narrative': 'bg-violet-500/15 border-violet-500/30 text-violet-200',
  'message-assistant': 'bg-sky-500/15 border-sky-500/30 text-sky-200',
  'quick-reply':       'bg-emerald-500/15 border-emerald-500/30 text-emerald-200',
  'data-extractor':    'bg-amber-500/15 border-amber-500/30 text-amber-200',
}

function formatCents(c) {
  if (c == null) return '—'
  const n = Number(c)
  if (n < 100) return `$${(n / 100).toFixed(2)}`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n / 100)
}

function timestamp(ts) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) } catch { return ts }
}

/**
 * Realtime feed of ai_usage rows. Shows the last 50 calls; new rows
 * fade in at the top. Uses Supabase realtime — no polling.
 */
export default function AIUsageLive() {
  const [rows, setRows] = useState([])
  const [connected, setConnected] = useState(false)
  const channelRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    // Seed with the last 50.
    ;(async () => {
      const { data, error } = await supabase
        .from('ai_usage')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (cancelled) return
      if (!error) setRows(data || [])
    })()

    const channel = supabase
      .channel('rt:ai_usage:admin-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_usage' }, (payload) => {
        const row = payload?.new
        if (!row) return
        setRows((prev) => [row, ...prev].slice(0, 50))
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })
    channelRef.current = channel
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${connected ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200' : 'border-slate-700/60 bg-slate-800/40 text-slate-400'}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {connected ? 'Live' : 'Connecting…'}
          </span>
          <h3 className="text-sm font-medium text-slate-100">AI calls live feed</h3>
          <Radio className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <span className="text-[11px] text-slate-500 tabular-nums">{rows.length} recent</span>
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900/95">
            <tr className="border-b border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-medium px-3 py-2">When</th>
              <th className="text-left font-medium px-3 py-2">Surface</th>
              <th className="text-left font-medium px-3 py-2">Org</th>
              <th className="text-left font-medium px-3 py-2">Model</th>
              <th className="text-right font-medium px-3 py-2">Tokens</th>
              <th className="text-right font-medium px-3 py-2">Cost</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Waiting for AI calls…</td></tr>
            ) : rows.map((r) => {
              const surfTone = SURFACE_TONE[r.surface] || 'bg-slate-700/30 border-slate-700/60 text-slate-200'
              return (
                <tr key={r.id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/30 transition">
                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap font-mono">{timestamp(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] ${surfTone}`}>{r.surface}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 font-mono">{(r.organization_id || '').slice(0, 8)}</td>
                  <td className="px-3 py-2 text-slate-300 font-mono truncate max-w-[200px]" title={`${r.provider}/${r.model}`}>
                    {r.model}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300 tabular-nums">
                    {(Number(r.input_tokens || 0) + Number(r.output_tokens || 0)).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-200 tabular-nums">{formatCents(r.cost_cents)}</td>
                  <td className="px-3 py-2">
                    {r.status === 'ok' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">ok</span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/15 border border-rose-500/30 text-rose-200" title={r.error_message || ''}>{r.status}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
