import { useAppStore } from '@/app/store'
import { CONFIDENCE_CAPS, CONFIDENCE_THRESHOLDS } from '@/shared/config/geocoding'

import type { ReviewSummary } from './reviewFilters'

/**
 * Cabecera compacta de la vista de revision.
 *
 * Antes ocupaba varios bloques con el archivo, las columnas, los ajustes y la
 * configuracion de la busqueda: media pantalla de contexto que se lee una vez y
 * despues estorba. Ahora son dos lineas, y el detalle se despliega si se pide.
 */
export function ReviewSummaryBar({ summary }: { summary: ReviewSummary }) {
  const country = useAppStore((state) => state.country)
  const useFallbackProvider = useAppStore((state) => state.useFallbackProvider)
  const retry = useAppStore((state) => state.retry)
  const ai = useAppStore((state) => state.ai)

  const providers = useFallbackProvider ? 'Nominatim + Photon' : 'Nominatim'

  return (
    <div className="border-border-subtle bg-surface shrink-0 rounded-lg border px-4 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">Revision</h2>
        <p className="text-ink-muted text-xs tabular-nums">
          <span className="text-ink font-medium">{summary.total.toLocaleString('es')}</span>{' '}
          registros · <span className="text-ink font-medium">{summary.groups}</span> grupos ·{' '}
          <span className="text-ink font-medium">{summary.locatedPercentage}%</span> geocodificados
          {summary.pending > 0 ? (
            <>
              {' · '}
              <span className="text-warn font-medium">
                <span aria-hidden="true">⚠ </span>
                {summary.pending} pendientes
              </span>
            </>
          ) : (
            <>
              {' · '}
              <span className="text-ok font-medium">
                <span aria-hidden="true">✓ </span>nada pendiente
              </span>
            </>
          )}
        </p>

        <p className="text-ink-muted ml-auto text-xs">
          Busqueda: {country?.name ?? 'sin pais fijado'} · {providers} · acepta desde{' '}
          {Math.round(CONFIDENCE_THRESHOLDS.accept * 100)}%
        </p>

        <details className="text-xs">
          <summary className="text-accent cursor-pointer rounded underline underline-offset-2">
            Ver configuracion
          </summary>
          {/* Flotante: el detalle no debe empujar el mapa hacia abajo. */}
          <dl className="border-border-subtle bg-surface absolute right-4 z-20 mt-2 grid max-w-md gap-x-4 gap-y-1 rounded-md border p-3 shadow-lg sm:grid-cols-2">
            <Entry label="Pais de sesion" value={country?.name ?? 'ninguno'} />
            <Entry label="Proveedores" value={providers} />
            <Entry
              label="Umbral de aceptacion"
              value={`${String(Math.round(CONFIDENCE_THRESHOLDS.accept * 100))}%`}
            />
            <Entry
              label="Umbral de revision"
              value={`${String(Math.round(CONFIDENCE_THRESHOLDS.review * 100))}%`}
            />
            <Entry
              label="Tope por poca especificidad"
              value={`${String(Math.round(CONFIDENCE_CAPS.lowSpecificity * 100))}%`}
            />
            <Entry
              label="Tope por ambiguedad"
              value={`${String(Math.round(CONFIDENCE_CAPS.ambiguous * 100))}%`}
            />
            <Entry
              label="Porcentaje minimo de exito"
              value={`${String(retry.minimumSuccessPercentage)}%`}
            />
            <Entry label="Maximo de reintentos" value={String(retry.maxRetries)} />
            <Entry label="Asistente de IA" value={ai.enabled ? 'activo' : 'apagado'} />
          </dl>
        </details>
      </div>
    </div>
  )
}

function Entry({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
