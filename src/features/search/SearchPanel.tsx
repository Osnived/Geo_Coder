import { useMemo } from 'react'

import { useAppStore } from '@/app/store'
import { Badge, Button, Callout, Panel } from '@/components/ui/primitives'
import { STATUS_LABELS } from '@/domain/models/status'
import { buildQueries } from '@/domain/services/queryBuilder'

import { QueryPreview } from './QueryPreview'

const STATUS_TONE = {
  FOUND: 'ok',
  MANUALLY_VERIFIED: 'ok',
  LOW_CONFIDENCE: 'warn',
  NEEDS_REVIEW: 'warn',
  NOT_FOUND: 'danger',
  ERROR: 'danger',
  SEARCHING: 'accent',
  PENDING: 'neutral',
} as const

/** Plan de busqueda y ejecucion de la geocodificacion. */
export function SearchPanel() {
  const records = useAppStore((state) => state.records)
  const country = useAppStore((state) => state.country)
  const geocoding = useAppStore((state) => state.geocoding)
  const runGeocoding = useAppStore((state) => state.runGeocoding)
  const cancelGeocoding = useAppStore((state) => state.cancelGeocoding)

  const plan = useMemo(
    () =>
      records.map((record) => ({
        record,
        queries: buildQueries(record, { sessionCountry: country }),
      })),
    [records, country],
  )

  const searchable = plan.filter((entry) => entry.queries.length > 0).length
  const pending = records.filter(
    (record) => record.status === 'PENDING' || record.status === 'ERROR',
  )
  const notFound = records.filter((record) => record.status === 'NOT_FOUND')
  // Nominatim admite 1 peticion por segundo y se prueban varias estrategias.
  const estimatedSeconds = pending.length * 2

  if (records.length === 0) {
    return (
      <Panel title="Plan de busqueda">
        <p className="text-ink-muted text-sm">
          Todavia no hay registros. Importa un Excel o crea uno manualmente.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Plan de busqueda"
      description="Esto es exactamente lo que se enviara al proveedor, en orden."
      actions={
        geocoding.isRunning ? (
          <Button variant="danger" onClick={cancelGeocoding}>
            Detener
          </Button>
        ) : (
          <>
            {notFound.length > 0 ? (
              <Button
                onClick={() => void runGeocoding(notFound.map((record) => record.id))}
                title="Vuelve a intentar los que no se encontraron"
              >
                Reintentar {notFound.length} no encontrado(s)
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
      <div className="flex flex-col gap-3">
        <Callout tone="accent">
          Se usa Nominatim (OpenStreetMap), que admite <strong>1 consulta por segundo</strong>. Los{' '}
          {pending.length} registro(s) pendientes tardaran del orden de{' '}
          {formatDuration(estimatedSeconds)}, porque cada uno puede necesitar varias estrategias. La
          busqueda se puede detener y retomar.
        </Callout>

        {searchable < records.length ? (
          <Callout tone="warn">
            {records.length - searchable} de {records.length} registro(s) no tienen datos
            suficientes para buscarse. Completalos en la pestana Registros.
          </Callout>
        ) : null}

        {geocoding.lastError ? (
          <Callout tone="danger">Ultimo error del proveedor: {geocoding.lastError}</Callout>
        ) : null}

        {geocoding.isRunning || geocoding.processed > 0 ? (
          <div className="border-border-subtle bg-surface-muted rounded-md border px-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                {geocoding.processed} de {geocoding.total} procesado(s)
              </span>
              {geocoding.isRunning ? (
                <span className="text-ink-muted text-xs">Buscando...</span>
              ) : null}
            </div>
            <div className="bg-surface-sunken mt-2 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full transition-all"
                style={{
                  width: `${String(
                    geocoding.total === 0
                      ? 0
                      : Math.round((geocoding.processed / geocoding.total) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {plan.map(({ record, queries }) => (
            <details
              key={record.id}
              className="border-border-subtle rounded-md border px-3 py-2"
              open={records.length <= 10}
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
                <span>
                  {record.fields.location_name ||
                    record.fields.client ||
                    record.fields.address ||
                    '(registro sin nombre)'}
                </span>
                <Badge tone={STATUS_TONE[record.status]}>{STATUS_LABELS[record.status]}</Badge>
                {record.result ? (
                  <span className="text-ink-faint text-xs font-normal">
                    {record.result.latitude.toFixed(5)}, {record.result.longitude.toFixed(5)} ·{' '}
                    {Math.round(record.result.confidence * 100)}% · {record.result.provider}
                  </span>
                ) : (
                  <span className="text-ink-faint text-xs font-normal">
                    {queries.length} estrategia(s)
                  </span>
                )}
              </summary>

              <div className="mt-2 flex flex-col gap-2">
                <QueryPreview queries={queries} />

                {record.result ? (
                  <div className="border-border-subtle text-ink-muted border-t pt-2 text-xs">
                    <p>
                      <strong className="text-ink">Encontrado:</strong>{' '}
                      {record.result.matchedName || '(sin nombre)'} — {record.result.matchedAddress}
                    </p>
                    <p className="mt-0.5">
                      Consulta que funciono: <code>{record.result.queryUsed}</code>
                    </p>
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${String(seconds)} s`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${String(minutes)} min`
  return `${String(Math.round(minutes / 6) / 10)} h`
}
