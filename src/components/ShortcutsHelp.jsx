// ShortcutsHelp — modal listing every keyboard shortcut.
// Reads from src/lib/shortcuts.js so this stays in sync with the
// command palette and the global shortcut hook automatically.

import { Keyboard } from 'lucide-react'
import Modal from './ui/Modal'
import FocusTrap from './ui/FocusTrap'
import { SHORTCUTS } from '../lib/shortcuts'

function Kbd({ k }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded-md border border-slate-700 bg-slate-800/60 text-[11px] font-mono text-slate-200 shadow-sm">
      {k}
    </kbd>
  )
}

function Row({ keys, desc }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-300">{desc}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            <Kbd k={k} />
            {i < keys.length - 1 && <span className="text-slate-600 text-[10px]">+</span>}
          </span>
        ))}
      </span>
    </div>
  )
}

export default function ShortcutsHelp({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-indigo-300" aria-hidden="true" />
          Keyboard shortcuts
        </span>
      }
    >
      <FocusTrap active={open}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2">
              Global
            </h3>
            <div className="divide-y divide-slate-800/40">
              {SHORTCUTS.global.map((s, i) => (
                <Row key={i} keys={s.keys} desc={s.desc} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2">
              Navigation (press g, then…)
            </h3>
            <div className="divide-y divide-slate-800/40">
              {SHORTCUTS.navigate.map((s) => (
                <Row key={s.key} keys={['g', s.key]} desc={s.label} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2">
              Create new (press n, then…)
            </h3>
            <div className="divide-y divide-slate-800/40">
              {SHORTCUTS.create.map((s) => (
                <Row key={s.key} keys={['n', s.key]} desc={s.label} />
              ))}
            </div>
          </div>
        </div>
      </FocusTrap>
    </Modal>
  )
}
