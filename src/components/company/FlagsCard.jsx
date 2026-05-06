import { useCallback, useEffect, useState } from 'react'
import { ToggleLeft, RotateCcw } from 'lucide-react'
import { supabase } from '../../services/supabase'
import Skeleton from '../ui/Skeleton'

export default function FlagsCard({ orgId }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy]       = useState({})
  const [msg, setMsg]         = useState(null)

  const refresh = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    supabase.rpc('admin_list_org_flags', { p_org_id: orgId }).then(({ data, error }) => {
      if (error) {
        if (error.code === '42883' || /function .* does not exist/i.test(error.message || '')) setMissing(true)
        setRows([])
      } else {
        setRows(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })
  }, [orgId])

  useEffect(() => { refresh() }, [refresh])

  async function setOverride(key, enabled) {
    setBusy((b) => ({ ...b, [key]: true }))
    setMsg(null)
    const { error } = await supabase.rpc('admin_set_org_flag', {
      p_org_id: orgId,
      p_key: key,
      p_enabled: enabled,
    })
    if (error) { setMsg({ tone:'err', text: error.message }) }
    else refresh()
    setBusy((b) => { const c = { ...b }; delete c[key]; return c })
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur">
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-2">
        <ToggleLeft className="w-4 h-4 text-indigo-300" />
        <h3 className="text-sm font-medium text-slate-100">Feature flags</h3>
      </div>
      <div className="px-5 py-4">
        {missing ? (
          <p className="text-xs text-amber-300">Apply migration 125 to enable.</p>
        ) : loading ? (
          <Skeleton width="100%" height={100} />
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500">No flags defined yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const isOverride = r.override_enabled !== null && r.override_enabled !== undefined
              const eff = r.effective_enabled
              return (
                <div key={r.key} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] text-slate-200 truncate">{r.key}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      default {r.default_enabled ? 'on' : 'off'}
                      {r.rollout_pct != null && r.default_enabled && ` · ${r.rollout_pct}% rollout`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={[
                      'inline-flex px-2 py-0.5 rounded-full border text-[10px]',
                      eff
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                        : 'bg-slate-700/30 text-slate-400 border-slate-700',
                    ].join(' ')}>
                      {eff ? 'on' : 'off'}
                    </span>
                    <select
                      value={isOverride ? (r.override_enabled ? 'on' : 'off') : 'default'}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === 'default') setOverride(r.key, null)
                        else setOverride(r.key, v === 'on')
                      }}
                      disabled={busy[r.key]}
                      className="px-1.5 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-200 disabled:opacity-50"
                    >
                      <option value="default">use default</option>
                      <option value="on">force on</option>
                      <option value="off">force off</option>
                    </select>
                    {isOverride && (
                      <button onClick={() => setOverride(r.key, null)} disabled={busy[r.key]}
                        className="text-slate-500 hover:text-slate-200" title="Clear override">
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {msg && <p className="mt-2 text-[11px] text-rose-300">{msg.text}</p>}
      </div>
    </div>
  )
}
