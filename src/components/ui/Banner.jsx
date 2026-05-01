import { AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react'

const TONES = {
  info:    { box: 'border-sky-500/30 bg-sky-500/10',     text: 'text-sky-200',    title: 'text-sky-100',    icon: Info,           iconColor: 'text-sky-400' },
  warning: { box: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-200',  title: 'text-amber-100',  icon: AlertTriangle,  iconColor: 'text-amber-400' },
  success: { box: 'border-emerald-500/30 bg-emerald-500/10', text: 'text-emerald-200', title: 'text-emerald-100', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  danger:  { box: 'border-red-500/30 bg-red-500/10',     text: 'text-red-200',    title: 'text-red-100',    icon: XCircle,        iconColor: 'text-red-400' },
}

/**
 * Inline banner for migrations / errors / hints.
 * Supports 4 tones and an optional title with body content.
 */
export default function Banner({ tone = 'info', title, children, className = '' }) {
  const cfg = TONES[tone] || TONES.info
  const Icon = cfg.icon

  return (
    <div className={`rounded-xl border ${cfg.box} px-4 py-3 flex items-start gap-3 ${className}`}>
      <Icon className={`w-4 h-4 ${cfg.iconColor} mt-0.5 shrink-0`} />
      <div className={`text-xs ${cfg.text} leading-relaxed`}>
        {title && <strong className={`${cfg.title} block mb-0.5`}>{title}</strong>}
        {children}
      </div>
    </div>
  )
}
