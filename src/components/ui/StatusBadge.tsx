import { STATUS_LABELS, type RecordStatus } from '@/domain/models/status'
import { cx } from '@/shared/cx'

import { STATUS_PRESENTATION, type StatusTone } from './statusPresentation'

/** Estado de un registro, legible sin depender del color. */

const TONE_STYLES: Record<StatusTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-border-strong',
  accent: 'bg-accent-soft text-accent border-accent/30',
  ok: 'bg-ok-soft text-ok border-ok/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
}

export function StatusBadge({
  status,
  confidence,
  className,
}: {
  status: RecordStatus
  /** 0..1. Se muestra en porcentaje entero si se pasa. */
  confidence?: number | undefined
  className?: string | undefined
}) {
  const { tone, icon } = STATUS_PRESENTATION[status]

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_STYLES[tone],
        className,
      )}
    >
      {/* Decorativo: el texto que sigue ya dice el estado. */}
      <span aria-hidden="true">{icon}</span>
      {STATUS_LABELS[status]}
      {confidence === undefined ? null : (
        <span className="tabular-nums opacity-80">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  )
}
