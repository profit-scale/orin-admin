import { useEffect, useState } from 'react'
import { HardDrive, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Skeleton from '../ui/Skeleton'

function formatBytes(b) {
  if (b == null) return '—'
  const u = ['B','KB','MB','GB','TB']
  let n = Number(b), i = 0
  while (n >= 1024 && i < u.length-1) { n /= 1024; i++ }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`
}

/**
 * Per-org storage breakdown card. Lazily loads when expanded.
 */
export default function StorageCard({ orgId }) {
  const [data, setData]       = useState(null)
  const [topFiles, setTopFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!orgId) return
    let cancel = false
    setLoading(true)
    setError(null)
    supabase.rpc('admin_storage_per_org').then(({ data, error }) => {
      if (cancel) return
      if (error) { setError(error.message); setLoading(false); return }
      const row = (data || []).find((r) => r.organization_id === orgId)
      setData(row || { total_bytes: 0, file_count: 0, by_bucket: [] })
      setLoading(false)
    })
    return () => { cancel = true }
  }, [orgId])

  useEffect(() => {
    if (!expanded || !orgId) return
    supabase.rpc('admin_storage_top_files', { p_org_id: orgId, p_limit: 25 }).then(({ data }) => {
      setTopFiles(Array.isArray(data) ? data : [])
    })
  }, [expanded, orgId])

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-100">Storage</h3>
      </div>
      <div className="px-5 py-4">
        {loading ? (
          <Skeleton width="60%" height={20} />
        ) : error ? (
          <p className="text-xs text-rose-300">{error}</p>
        ) : data ? (
          <>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl font-semibold text-slate-100 tabular-nums">{formatBytes(data.total_bytes)}</span>
              <span className="text-xs text-slate-500">{Number(data.file_count).toLocaleString()} files</span>
            </div>
            {(data.by_bucket || []).length > 0 && (
              <div className="space-y-2 mb-2">
                {data.by_bucket.map((b, i) => (
                  <div key={i} className="flex items-baseline justify-between text-xs">
                    <span className="font-mono text-slate-300">{b.bucket}</span>
                    <span className="text-slate-400 tabular-nums">{formatBytes(b.bytes)} <span className="text-slate-600">· {Number(b.count).toLocaleString()}</span></span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setExpanded((x) => !x)}
              className="text-[11px] text-slate-500 hover:text-slate-200 inline-flex items-center gap-1">
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              View biggest files
            </button>
            {expanded && (
              <div className="mt-3 rounded-lg border border-slate-800 overflow-hidden">
                {topFiles.length === 0 ? (
                  <p className="text-[11px] text-slate-500 px-3 py-3">No files indexed.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-950/80">
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="text-left font-medium px-3 py-1.5">Bucket</th>
                        <th className="text-left font-medium px-3 py-1.5">Path</th>
                        <th className="text-right font-medium px-3 py-1.5">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topFiles.map((f, i) => (
                        <tr key={i} className="border-t border-slate-800/40">
                          <td className="px-3 py-1.5 font-mono text-[10px] text-slate-300">{f.bucket_id}</td>
                          <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400 truncate max-w-[300px]">{f.path}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{formatBytes(f.bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
