import { useCallback, useEffect, useState } from 'react'
import { Terminal, Play, Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../services/supabase'
import Banner from '../components/ui/Banner'

const STORAGE_KEY = 'orin-admin:last-sql-query'

function rowsToCsv(rows) {
  if (!rows?.length) return ''
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))))
  const esc = (v) => {
    if (v == null) return ''
    if (typeof v === 'object') v = JSON.stringify(v)
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r?.[h])).join(','))
  return lines.join('\n')
}

function downloadCsv(rows) {
  const csv = rowsToCsv(rows || [])
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sql-result-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function ResultsTable({ rows }) {
  if (!rows?.length) return <div className="text-xs text-slate-500 py-6 text-center">No rows returned.</div>
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))))
  return (
    <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-lg border border-slate-800/60">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-950">
          <tr className="border-b border-slate-800/80">
            {headers.map((h) => (
              <th key={h} className="text-left font-medium px-3 py-2 text-slate-400 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/30">
              {headers.map((h) => (
                <td key={h} className="px-3 py-2 text-slate-200 font-mono align-top break-all max-w-md">
                  {r?.[h] == null
                    ? <span className="text-slate-600">null</span>
                    : typeof r[h] === 'object'
                      ? JSON.stringify(r[h])
                      : String(r[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SqlRunner() {
  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    try { setQuery(localStorage.getItem(STORAGE_KEY) || 'SELECT now() AS server_time;') } catch { /* */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, query) } catch { /* */ }
  }, [query])

  const run = useCallback(async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const { data, error: err } = await supabase.functions.invoke('admin-sql-run', {
        body: { query },
      })
      if (err) throw err
      if (!data?.ok) {
        setError(data?.message || 'Query failed')
        setResult(null)
        return
      }
      setResult(data)
    } catch (e) {
      setError(e?.message || 'Failed to run query')
    } finally {
      setRunning(false)
    }
  }, [query])

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
    }
  }

  return (
    <div className="space-y-4 max-w-[1300px]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1 flex items-center gap-3">
            <Terminal className="w-6 h-6 text-indigo-300" />
            SQL runner
          </h1>
          <p className="text-sm text-slate-500">
            Run one statement at a time. DROP/TRUNCATE/multi-statement is blocked.
            DELETE/UPDATE without WHERE is blocked. Every run is audited.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result?.rows?.length > 0 && (
            <button
              onClick={() => downloadCsv(result.rows)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
          <button
            onClick={run}
            disabled={running || !query.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Running…' : 'Run (⌘↵)'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-3">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          rows={10}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:border-indigo-500 focus:outline-none"
          placeholder="SELECT * FROM organizations LIMIT 10;"
        />
        <div className="text-[11px] text-slate-500 px-1 pt-2">
          Tip: ⌘+Enter / Ctrl+Enter to run. Single statement only. 10s timeout.
        </div>
      </div>

      {error && <Banner tone="danger" title="Query failed">{error}</Banner>}

      {result && (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
          <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-3 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300">
              {result.row_count} {result.row_count === 1 ? 'row' : 'rows'}
              {' · '}
              {result.duration_ms}ms
              {result.command && <> · {result.command}</>}
            </span>
          </div>
          <div className="p-3">
            <ResultsTable rows={result.rows} />
          </div>
        </div>
      )}
    </div>
  )
}
