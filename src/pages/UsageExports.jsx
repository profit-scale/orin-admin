import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCcw, ExternalLink } from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'

function fmt(s) { return s ? new Date(s).toLocaleString() : '—' }
function bytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

function lastNMonths(n) {
  const out = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      label: d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }),
    })
  }
  return out
}

export default function UsageExports() {
  const [orgs, setOrgs]       = useState([])
  const [history, setHistory] = useState([])
  const [missing, setMissing] = useState(false)
  const [loadingOrgs, setLoadingOrgs]       = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [orgId, setOrgId]   = useState('')
  const [month, setMonth]   = useState(lastNMonths(1)[0].iso)
  const [format, setFormat] = useState('csv')
  const [busy, setBusy]     = useState(false)

  const months = useMemo(() => lastNMonths(12), [])

  const loadOrgs = async () => {
    setLoadingOrgs(true)
    const { data, error } = await supabase.from('organizations').select('id, name').order('name').limit(500)
    if (!error) setOrgs(data || [])
    setLoadingOrgs(false)
  }
  const loadHistory = async () => {
    setLoadingHistory(true)
    const { data, error } = await supabase.rpc('admin_usage_exports_recent', { p_limit: 50 })
    if (error) {
      if (isMissingFunction(error)) setMissing(true)
      else toast.error('Failed to load history', { description: error.message })
    } else {
      setHistory(data || [])
    }
    setLoadingHistory(false)
  }
  useEffect(() => { loadOrgs(); loadHistory() }, [])

  const generate = async () => {
    if (!orgId) {
      toast.error('Pick an organization first')
      return
    }
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-export-usage', {
        body: { org_id: orgId, month, format },
      })
      if (error) throw new Error(error.message || 'Export failed')
      if (!data?.ok) throw new Error(data?.message || 'Export failed')
      toast.success('Export generated', {
        description: `${data.row_count} rows · ${bytes(data.byte_size)}`,
      })
      // Pop the URL into a new tab to download
      if (data.signed_url) window.open(data.signed_url, '_blank')
      loadHistory()
    } catch (e) {
      toast.error('Export failed', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-indigo-300" />
          Usage exports
        </h1>
        <p className="text-sm text-slate-500">
          Per-org per-month CSV/JSON for invoicing. Each row contains the day&apos;s AI calls, AI cost cents, contacts added, deals, and messages.
        </p>
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 141 not applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">141_usage_exports.sql</code>.
        </Banner>
      )}

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3">
        <div className="text-sm font-medium text-slate-100">Generate export</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Organization">
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={loadingOrgs}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
              <option value="">— pick —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Month">
            <select value={month} onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
              {months.map((m) => <option key={m.iso} value={m.iso}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button onClick={generate} disabled={busy || !orgId}
              className="w-full px-4 py-2 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white inline-flex items-center justify-center gap-2">
              <Download className="w-3.5 h-3.5" /> {busy ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-slate-100">Recent exports</h2>
          <button onClick={loadHistory} disabled={loadingHistory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50">
            <RefreshCcw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loadingHistory ? (
          <Skeleton width="100%" height={180} rounded="rounded-2xl" />
        ) : history.length === 0 ? (
          <EmptyState icon={FileSpreadsheet}
            title="No exports yet"
            description="Pick an org + month above and hit Generate." />
        ) : (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2 text-left">Generated</th>
                  <th className="px-3 py-2 text-left">Org</th>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-left">Format</th>
                  <th className="px-3 py-2 text-right">Rows</th>
                  <th className="px-3 py-2 text-right">Size</th>
                  <th className="px-3 py-2 text-left">By</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-slate-800/50">
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{fmt(h.generated_at)}</td>
                    <td className="px-3 py-2 text-slate-200">{h.organization_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-300">{h.month?.slice(0, 7)}</td>
                    <td className="px-3 py-2 text-slate-300 uppercase">{h.format}</td>
                    <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{Number(h.row_count || 0)}</td>
                    <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{bytes(h.byte_size)}</td>
                    <td className="px-3 py-2 text-slate-400 text-[11px]">{h.generated_by_email || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {h.signed_url ? (
                        <a href={h.signed_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-indigo-500 hover:bg-indigo-400 text-white">
                          <ExternalLink className="w-3 h-3" /> Download
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">expired</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}
