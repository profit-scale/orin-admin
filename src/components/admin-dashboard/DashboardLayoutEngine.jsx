// ─────────────────────────────────────────────────────────────────────
// Admin DashboardLayoutEngine — same UX as the main app's, scoped to
// the admin widget catalog. HTML5 drag-and-drop (no new deps).
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { GripVertical, X, Plus } from 'lucide-react'
import { ADMIN_WIDGETS_BY_ID, colSpanClass, packIntoRows } from './registry.js'

function WidgetShell({ widget, ctx, editing, onHide, dragHandlers, isDragging, isOver }) {
  if (!editing) {
    return <widget.component ctx={ctx} />
  }
  return (
    <div
      className={`relative rounded-2xl transition-all
        ${isDragging ? 'opacity-40' : ''}
        ${isOver ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-950' : 'ring-1 ring-dashed ring-slate-700'}
      `}
      {...dragHandlers}
    >
      <div className="absolute -top-3 left-3 z-10 flex items-center gap-1.5">
        <button
          type="button"
          className="cursor-move flex items-center gap-1 px-2 h-7 rounded-md bg-slate-900 border border-slate-700 shadow-sm text-slate-300 hover:text-white"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium">{widget.label}</span>
        </button>
      </div>
      <div className="absolute -top-3 right-3 z-10">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onHide(widget.id) }}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-900 border border-slate-700 shadow-sm text-slate-400 hover:text-rose-400 hover:border-rose-500/40"
          aria-label={`Hide ${widget.label}`}
          title={`Hide ${widget.label}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="pointer-events-none">
        <widget.component ctx={ctx} />
      </div>
    </div>
  )
}

export function AdminDashboardLayoutEngine({
  layout,
  ctx,
  editing,
  onReorder,
  onHide,
  onShow,
}) {
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  const visibleEntries = layout
    .filter((e) => e.visible !== false)
    .map((e) => ({ entry: e, widget: ADMIN_WIDGETS_BY_ID[e.id] }))
    .filter(({ widget }) => !!widget)

  const hiddenEntries = layout
    .filter((e) => e.visible === false)
    .map((e) => ({ entry: e, widget: ADMIN_WIDGETS_BY_ID[e.id] }))
    .filter(({ widget }) => !!widget)

  const visibleWidgets = visibleEntries.map((v) => v.widget)
  const rows = packIntoRows(visibleWidgets)

  const handleDragStart = (e, id) => {
    setDragId(id)
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    } catch { /* noop */ }
  }
  const handleDragOver = (e, overTargetId) => {
    if (!dragId || dragId === overTargetId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== overTargetId) setOverId(overTargetId)
  }
  const handleDrop = (e, targetId) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) {
      setDragId(null); setOverId(null); return
    }
    const next = layout.slice()
    const fromIdx = next.findIndex((x) => x.id === dragId)
    const toIdx = next.findIndex((x) => x.id === targetId)
    if (fromIdx === -1 || toIdx === -1) {
      setDragId(null); setOverId(null); return
    }
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onReorder(next)
    setDragId(null); setOverId(null)
  }
  const handleDragEnd = () => { setDragId(null); setOverId(null) }

  return (
    <>
      <div className="space-y-4">
        {rows.map((row, rIdx) => (
          <div key={rIdx} className="grid grid-cols-6 gap-4 items-stretch">
            {row.items.map((widget) => {
              const dragHandlers = editing
                ? {
                    draggable: true,
                    onDragStart: (e) => handleDragStart(e, widget.id),
                    onDragOver: (e) => handleDragOver(e, widget.id),
                    onDrop: (e) => handleDrop(e, widget.id),
                    onDragEnd: handleDragEnd,
                  }
                : {}
              return (
                <div key={widget.id} className={colSpanClass(widget.defaultRow)}>
                  <WidgetShell
                    widget={widget}
                    ctx={ctx}
                    editing={editing}
                    onHide={onHide}
                    dragHandlers={dragHandlers}
                    isDragging={dragId === widget.id}
                    isOver={overId === widget.id}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {editing && hiddenEntries.length > 0 && (
        <div className="mt-8 p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-700">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Hidden widgets
          </h4>
          <div className="flex flex-wrap gap-2">
            {hiddenEntries.map(({ widget }) => (
              <button
                key={widget.id}
                type="button"
                onClick={() => onShow(widget.id)}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-indigo-500/50 transition-colors text-[11px]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{widget.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
