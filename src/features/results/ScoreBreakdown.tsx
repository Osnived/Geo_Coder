import { FIELD_LABELS, isNormalizedField } from '@/domain/models/fields'
import { cx } from '@/shared/cx'

/**
 * Desglose del score de un candidato. Responde a "por que se acepto o se
 * rechazo esto" (spec principio 7).
 */

const EXTRA_LABELS: Record<string, string> = {
  country: 'Pais',
  rank: 'Posicion del proveedor',
  fixed: 'Valor fijo',
  sinDatos: 'Sin datos comparables',
}

function labelFor(signal: string): string {
  if (isNormalizedField(signal)) return FIELD_LABELS[signal]
  return EXTRA_LABELS[signal] ?? signal
}

function toneFor(value: number): string {
  if (value >= 0.75) return 'bg-ok'
  if (value >= 0.4) return 'bg-warn'
  return 'bg-danger'
}

export function ScoreBreakdown({ signals }: { signals: Readonly<Record<string, number>> }) {
  const entries = Object.entries(signals)
  if (entries.length === 0) return null

  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {entries.map(([signal, value]) => (
        <div key={signal} className="flex items-center gap-2 text-xs">
          <dt className="text-ink-muted w-40 shrink-0 truncate" title={labelFor(signal)}>
            {labelFor(signal)}
          </dt>
          <dd className="flex flex-1 items-center gap-2">
            <span className="bg-surface-sunken h-1.5 flex-1 overflow-hidden rounded-full">
              <span
                className={cx('block h-full', toneFor(value))}
                style={{ width: `${String(Math.round(value * 100))}%` }}
              />
            </span>
            <span className="text-ink-muted w-9 text-right tabular-nums">
              {Math.round(value * 100)}%
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
