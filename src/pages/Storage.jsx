import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HardDrive,
  Files,
  Trash2,
} from 'lucide-react'
import { supabase } from '../services/supabase'
import { isMissingFunction } from '../lib/rpcErrors'
import Banner from '../components/ui/Banner'
import Skeleton from '../components/ui/Skeleton'
import StatCard from '../components/ui/StatCard'
import PageTitle from '../components/ui/PageTitle'
import RefreshButton from '../components/ui/RefreshButton'
import { toast } from '../components/ui/Toast'

function formatBytes(bytes) {
  if (bytes == null) return '—'
  const u = ['B','KB','MB','GB','TB']
  let n = Number(bytes), i = 0
  while (n >= 1024 && i < u.length-1) { n /= 1024; i++ }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`
}

export default function Storage() {
  const [totals, setTotals]   = useState(null)
  const [perOrg, setPerOrg]   = useState([])
  const [orphans, setOrphans] = useState([])
  const [selected, setSelected] = useState({})
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy]       = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const [tRes, oRes, orRes] = await Promise.all([
      supabase.rpc('admin_storage_platform_totals'),
      supabase.rpc('admin_storage_per_org'),
      supabase.rpc('admin_storage_orphans'),
    ])
    let m = false
    if (tRes.error)  { if (isMissingFunction(tRes.error))  m = true; setTotals(null) } else setTotals(tRes.data)
    if (oRes.error)  { if (isMissingFunction(oRes.error))  m = true; setPerOrg([]) }   else setPerOrg(Array.isArray(oRes.data)?oRes.data:[])
    if (orRes.error) { if (isMissingFunction(orRes.error)) m = true; setOrphans([]) } else setOrphans(Array.isArray(orRes.data)?orRes.data:[])
    setMissing(m)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const selectedIds = Object.keys(selected).filter((id) => selected[id])
  const selectedCount = selectedIds.length

  function toggle(id) { setSelected((s) => ({ ...s, [id]: !s[id] })) }
  function toggleAll() {
    if (selectedCount === orphans.length) setSelected({})
    else setSelected(Object.fromEntries(orphans.map((o) => [o.storage_object_id, true])))
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Permanently delete ${selectedIds.length} orphaned file${selectedIds.length===1?'':'s'}? This is logged in audit.`)) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('admin_storage_bulk_delete_orphans', { p_object_ids: selectedIds })
      if (error) throw error
      toast.success(`Deleted ${data?.deleted || 0} file${(data?.deleted || 0) === 1 ? '' : 's'}`)
      setSelected({})
      refresh()
    } catch (e) {
      toast.error('Bulk delete failed', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageTitle title="Storage" />
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-1">Storage</h1>
          <p className="text-sm text-slate-500">Per-org footprint and orphan cleanup queue.</p>
        </div>
        <RefreshButton onClick={refresh} loading={loading} label="Refresh storage stats" />
      </div>

      {missing && (
        <Banner tone="warning" title="Migration 122 not yet applied">
          Apply <code className="px-1 py-0.5 bg-black/30 rounded">122_storage_intel.sql</code>.
        </Banner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total stored" value={totals ? formatBytes(totals.total_bytes) : '—'} icon={HardDrive} loading={loading} />
        <StatCard label="Total files" value={totals ? Number(totals.file_count).toLocaleString() : '—'} icon={Files} loading={loading} />
        <StatCard label="Orphans found" value={orphans.length} icon={Trash2} accent="from-rose-500/40 to-pink-500/40" loading={loading} />
      </div>

      {/* Bucket breakdown */}
      {totals?.by_bucket && totals.by_bucket.length > 0 && (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-5">
          <h3 className="text-sm font-medium text-slate-100 mb-3">Bucket breakdown</h3>
          <div className="space-y-2">
            {totals.by_bucket.map((b) => {
              const pct = totals.total_bytes > 0 ? (Number(b.bytes) / Number(totals.total_bytes)) * 100 : 0
              return (
                <div key={b.bucket_id}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="font-mono text-slate-200">{b.bucket_id}</span>
                    <span className="text-slate-400 tabular-nums">{formatBytes(b.bytes)} <span className="text-slate-600">· {Number(b.count).toLocaleString()} files</span></span>
                  </div>
                  <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500/70 to-violet-500/70 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per-org */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        <div className="px-5 py-3 border-b border-slate-800/60">
          <h3 className="text-sm font-medium text-slate-100">Per-org footprint (top 50)</h3>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={28} rounded="rounded" />))}
          </div>
        ) : perOrg.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">No usage data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-medium px-5 py-2.5">Org</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Total</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Files</th>
                  <th scope="col" className="text-left font-medium px-5 py-2.5">By bucket</th>
                </tr>
              </thead>
              <tbody>
                {perOrg.slice(0, 50).map((o) => (
                  <tr key={o.organization_id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-5 py-2.5">
                      <Link to={`/companies/${o.organization_id}`} className="text-slate-200 hover:text-indigo-300 truncate inline-block max-w-[200px]">
                        {o.name || o.slug}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatBytes(o.total_bytes)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{Number(o.file_count).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-[11px] text-slate-400 truncate max-w-[400px]">
                      {(o.by_bucket || []).slice(0, 4).map((b, i) => (
                        <span key={i} className="inline-block mr-3">
                          <span className="font-mono">{b.bucket}</span>
                          <span className="text-slate-600 ml-1">{formatBytes(b.bytes)}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Orphans */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
        <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-100">Orphan cleanup queue</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Files older than 7d with no parent row. Review then bulk-delete.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleAll}
              disabled={loading || orphans.length===0}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800/60 disabled:opacity-40">
              {selectedCount === orphans.length && orphans.length > 0 ? 'Deselect all' : 'Select all'}
            </button>
            <button onClick={bulkDelete}
              disabled={busy || selectedCount === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:opacity-40">
              <Trash2 className="w-3.5 h-3.5" />
              {busy ? 'Deleting…' : `Delete ${selectedCount}`}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({length:5}).map((_,i)=>(<Skeleton key={i} width="100%" height={28} rounded="rounded" />))}
          </div>
        ) : orphans.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">No orphans found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-medium px-5 py-2.5 w-10"></th>
                  <th scope="col" className="text-left font-medium px-3 py-2.5">Bucket</th>
                  <th scope="col" className="text-left font-medium px-3 py-2.5">Path</th>
                  <th scope="col" className="text-right font-medium px-3 py-2.5">Size</th>
                  <th scope="col" className="text-left font-medium px-3 py-2.5">Reason</th>
                  <th scope="col" className="text-right font-medium px-5 py-2.5">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {orphans.map((o) => (
                  <tr key={o.storage_object_id} className="border-b border-slate-800/40 last:border-0 hover:bg-slate-800/20">
                    <td className="px-5 py-2.5">
                      <input type="checkbox" checked={!!selected[o.storage_object_id]}
                        onChange={() => toggle(o.storage_object_id)}
                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-950 text-indigo-500"/>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-300">{o.bucket_id}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400 truncate max-w-[400px]">{o.path}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{formatBytes(o.bytes)}</td>
                    <td className="px-3 py-2.5 text-[11px]">
                      <span className="inline-flex px-2 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-200">
                        {o.reason}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-[11px] text-slate-500">
                      {o.uploaded_at ? new Date(o.uploaded_at).toLocaleDateString() : '—'}
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
