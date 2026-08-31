import { useMemo, useState } from 'react'

import { useNavigation } from '@/app/navigationContext'
import { getCache, getCacheStats, useAppStore } from '@/app/store'
import { Button, Callout, EmptyState, Panel } from '@/components/ui/primitives'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { EstablishmentRecord } from '@/domain/models/record'
import { buildQueries } from '@/domain/services/queryBuilder'
import { selectRetryTargets, summarizeAttempt } from '@/domain/services/retryPolicy'

import { ScoreBreakdown } from '@/features/results/ScoreBreakdown'

import { GeocodingProgressPanel } from './GeocodingProgressPanel'
import { QueryPreview } from './QueryPreview'
import { formatApprox } from './timing'

/** Como se llama un registro en pantalla, con respaldos por si falta el nombre. */
function recordName(record: EstablishmentRecord): string {
  return (
    record.fields.location_name ||
    record.fields.client ||
    record.fields.address ||
    '(registro sin nombre)'
  )
}

/** Plan de busqueda y ejecucion de la geocodificacion. */
export function SearchPanel() {
  const records = useAppStore((state) => state.records)
  const country = useAppStore((state) => state.country)
  const geocoding = useAppStore((state) => state.geocoding)
  const retry = useAppStore((state) => state.retry)
  const runGeocoding = useAppStore((state) => state.runGeocoding)
  const cancelGeocoding = useAppStore((state) => state.cancelGeocoding)
  const useFallbackProvider = useAppStore((state) => state.useFallbackProvider)
  const setUseFallbackProvider = useAppStore((state) => state.setUseFallbackProvider)
  const { go } = useNavigation()

  const plan = useMemo(
    () =>
      records.map((record) => ({
        record,
        queries: buildQueries(record, { sessionCountry: country }),
      })),
    [records, country],
  )

  const [cacheCleared, setCacheCleared] = useState(false)
  const cacheStats = getCacheStats()
  const searchable = plan.filter((entry) => entry.queries.length > 0).length
  const pending = records.filter(
    (record) => record.status === 'PENDING' || record.status === 'ERROR',
  )
  const retryable = useMemo(() => selectRetryTargets(records), [records])

  /** Nombre del registro en curso, para que el reloj diga de que habla. */
  const currentRecordName = useMemo(() => {
    const id = geocoding.currentRecordId
    if (id === null) return null
    const record = records.find((entry) => entry.id === id)
    return record ? recordName(record) : null
  }, [geocoding.currentRecordId, records])
  const overall = useMemo(() => summarizeAttempt(records), [records])
  // Nominatim admite 1 peticion por segundo y se prueban varias estrategias.
  const estimatedSeconds = pending.length * 2

  if (records.length === 0) {
    return (
      <Panel fill title="Procesamiento">
        <EmptyState
          title="Todavia no hay registros"
          hint="Carga un Excel o escribe uno a mano en la seccion Datos."
        />
        <div className="mt-3">
          <Button
            variant="primary"
            onClick={() => {
              go('data')
            }}
          >
            Ir a Datos
          </Button>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      fill
      title="Procesamiento"
      description={`${String(records.length)} registro(s) · ${String(overall.success)} geocodificados (${String(overall.percentage)}%)`}
      actions={
        geocoding.isRunning ? (
          <Button variant="danger" onClick={cancelGeocoding}>
            Detener
          </Button>
        ) : (
          <>
            {pending.length === 0 && retryable.length > 0 ? (
              <Button
                onClick={() => void runGeocoding(retryable.map((record) => record.id))}
                title="Vuelve a intentar los que no obtuvieron resultado"
              >
                Reintentar {retryable.length} sin resultado
              </Button>
            ) : null}
            <Button
              variant="primary"
              disabled={pending.length === 0}
              onClick={() => void runGeocoding()}
            >
              Geocodificar {pending.length} pendiente(s)
            </Button>
          </>
        )
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <GeocodingProgressPanel
          progress={geocoding}
          minimumSuccessPercentage={retry.minimumSuccessPercentage}
          {...(currentRecordName === null ? {} : { currentRecordName })}
        />

        {geocoding.phase === 'idle' && pending.length > 0 ? (
          <Callout tone="accent">
            Se usa Nominatim (OpenStreetMap), que admite <strong>1 consulta por segundo</strong>.
            Los {pending.length} registro(s) pendientes tardaran del orden de{' '}
            {formatApprox(estimatedSeconds * 1000)}. Si el exito queda por debajo del{' '}
            {retry.minimumSuccessPercentage}%, se reintentaran los fallidos hasta {retry.maxRetries}{' '}
            vez(ces) mas. Se puede detener y retomar.
          </Callout>
        ) : null}

        {searchable < records.length ? (
          <Callout tone="warn">
            {records.length - searchable} de {records.length} registro(s) no tienen datos
            suficientes para buscarse. Completalos desde la seccion Datos.
          </Callout>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <label className="flex max-w-xl items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={useFallbackProvider}
              onChange={(event) => {
                setUseFallbackProvider(event.target.checked)
              }}
            />
            <span>
              Usar Photon como respaldo
              <span className="text-ink-muted block text-xs">
                Se consulta solo si Nominatim no encuentra nada suficientemente bueno. Encuentra mas
                locales por nombre, pero duplica el tiempo de los registros dificiles.
              </span>
            </span>
          </label>

          <div className="text-ink-muted flex flex-wrap items-center gap-2 text-xs">
            <span>
              Cache: {cacheStats.hits} acierto(s), {cacheStats.misses} consulta(s) reales
            </span>
            <button
              type="button"
              className="text-accent rounded underline underline-offset-2"
              onClick={() => {
                void getCache()
                  .clear()
                  .then(() => {
                    setCacheCleared(true)
                  })
              }}
            >
              Vaciar cache
            </button>
            {cacheCleared ? <span>Cache vaciada.</span> : null}
          </div>
        </div>

        {/* Unico bloque que crece: se desplaza por dentro, no la pagina. */}
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
          {plan.map(({ record, queries }) => (
            <details
              key={record.id}
              className="border-border-subtle shrink-0 rounded-md border px-3 py-2"
              open={records.length <= 10}
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
                <span>{recordName(record)}</span>
                <StatusBadge
                  status={record.status}
                  {...(record.result ? { confidence: record.result.confidence } : {})}
                />
                {record.result ? (
                  <span className="text-ink-muted text-xs font-normal tabular-nums">
                    {record.result.latitude.toFixed(5)}, {record.result.longitude.toFixed(5)} ·{' '}
                    {record.result.provider}
                  </span>
                ) : (
                  <span className="text-ink-muted text-xs font-normal">
                    {queries.length} estrategia(s)
                  </span>
                )}
              </summary>

              <div className="mt-2 flex flex-col gap-2">
                <QueryPreview queries={queries} />

                {queries.length > 0 ? (
                  <div>
                    <Button
                      disabled={geocoding.isRunning}
                      onClick={() => void runGeocoding([record.id])}
                    >
                      Volver a buscar este registro
                    </Button>
                  </div>
                ) : null}

                {record.result ? (
                  <div className="border-border-subtle text-ink-muted flex flex-col gap-2 border-t pt-2 text-xs">
                    <p>
                      <strong className="text-ink">Encontrado:</strong>{' '}
                      {record.result.matchedName || '(sin nombre)'} — {record.result.matchedAddress}
                    </p>
                    <p>
                      Consulta que funciono: <code>{record.result.queryUsed}</code>
                    </p>
                    {record.result.notes.length > 0 ? (
                      <ul className="text-warn list-inside list-disc">
                        {record.result.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div>
                      <p className="text-ink mb-1 font-medium">Por que este score</p>
                      <ScoreBreakdown signals={record.result.candidates[0]?.signals ?? {}} />
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </div>
    </Panel>
  )
}
