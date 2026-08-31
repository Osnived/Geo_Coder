import type { GeocodingProgress } from '@/app/store/types'
import { Callout } from '@/components/ui/primitives'
import { cx } from '@/shared/cx'

/**
 * Estado del procesamiento, contado como una historia.
 *
 * No basta un girador: cuando la aplicacion decide reintentar por su cuenta,
 * quien mira la pantalla tiene que poder saber por que lo hizo, en que intento
 * va y con que resultado acabo cada vuelta.
 */

function Bar({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100)

  return (
    <div
      className="bg-surface-sunken h-2 overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      aria-valuetext={`${String(value)} de ${String(total)} registros`}
    >
      <div className="bg-accent h-full transition-all" style={{ width: `${String(percent)}%` }} />
    </div>
  )
}

/** Barra de exito: la que de verdad decide si habra reintento. */
function SuccessBar({ percentage, minimum }: { percentage: number; minimum: number }) {
  const reached = percentage >= minimum

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-muted">Exito</span>
        <span className={cx('font-semibold tabular-nums', reached ? 'text-ok' : 'text-warn')}>
          <span aria-hidden="true">{reached ? '✓ ' : '⚠ '}</span>
          {percentage}% <span className="text-ink-muted font-normal">/ minimo {minimum}%</span>
        </span>
      </div>
      <div className="bg-surface-sunken relative h-2 overflow-hidden rounded-full">
        <div
          className={cx('h-full transition-all', reached ? 'bg-ok' : 'bg-warn')}
          style={{ width: `${String(Math.min(100, percentage))}%` }}
        />
        {/* Marca del minimo configurado, para ver de un golpe cuanto falta. */}
        <span
          aria-hidden="true"
          className="bg-ink/50 absolute inset-y-0 w-0.5"
          style={{ left: `${String(Math.min(100, minimum))}%` }}
        />
      </div>
    </div>
  )
}

const STOP_MESSAGES = {
  'threshold-met': 'Se alcanzo el porcentaje minimo.',
  'no-retries-left': 'Se alcanzo el maximo de reintentos.',
  'nothing-to-retry':
    'No queda nada que reintentar: los registros que faltan ya tienen un candidato y necesitan una decision humana.',
} as const

export function GeocodingProgressPanel({
  progress,
  minimumSuccessPercentage,
}: {
  progress: GeocodingProgress
  minimumSuccessPercentage: number
}) {
  const idle = progress.phase === 'idle' && progress.rounds.length === 0
  if (idle) return null

  const isRetry = progress.attempt > 0
  const lastRound = progress.rounds[progress.rounds.length - 1]

  return (
    <div className="border-border-subtle bg-surface-muted flex shrink-0 flex-col gap-3 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {progress.isRunning
            ? isRetry
              ? `Reintentando… intento ${String(progress.attempt)} de ${String(progress.maxRetries)}`
              : 'Procesando registros…'
            : progress.phase === 'cancelled'
              ? 'Procesamiento detenido'
              : 'Procesamiento terminado'}
        </p>
        <p className="text-ink-muted text-xs tabular-nums">
          {progress.processed} / {progress.total} en esta vuelta
        </p>
      </div>

      <Bar value={progress.processed} total={progress.total} />

      <SuccessBar percentage={progress.percentage} minimum={minimumSuccessPercentage} />

      {/* Historial: una linea por vuelta, para poder comparar. */}
      {progress.rounds.length > 0 ? (
        <ol className="text-ink-muted flex flex-col gap-0.5 text-xs">
          {progress.rounds.map((round) => (
            <li key={round.attempt} className="flex flex-wrap gap-x-2 tabular-nums">
              <span className="text-ink font-medium">
                {round.attempt === 0 ? 'Pasada inicial' : `Reintento ${String(round.attempt)}`}
              </span>
              <span>
                {round.success} / {round.total} geocodificados
              </span>
              <span>· {round.percentage}%</span>
            </li>
          ))}
        </ol>
      ) : null}

      {/* Por que se reintenta, dicho en el momento en que ocurre. */}
      {progress.isRunning && isRetry && lastRound ? (
        <Callout tone="warn">
          El resultado {lastRound.percentage}% quedo por debajo del minimo configurado (
          {minimumSuccessPercentage}%). Se estan reintentando solo los registros sin resultado.
        </Callout>
      ) : null}

      {!progress.isRunning && progress.stopReason ? (
        <Callout tone={progress.phase === 'completed' ? 'ok' : 'warn'}>
          Resultado final: <strong>{progress.percentage}%</strong>.{' '}
          {STOP_MESSAGES[progress.stopReason]}
        </Callout>
      ) : null}

      {!progress.isRunning && progress.phase === 'cancelled' ? (
        <Callout tone="warn">
          Se detuvo a mitad. Lo ya procesado se conserva; puedes volver a lanzarlo.
        </Callout>
      ) : null}

      {progress.lastError ? (
        <Callout tone="danger">Ultimo error del proveedor: {progress.lastError}</Callout>
      ) : null}
    </div>
  )
}
