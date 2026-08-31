import { useState } from 'react'

import { Badge, Button, Callout } from '@/components/ui/primitives'
import { Tabs, TabPanel, type TabOption } from '@/components/ui/Tabs'
import { FIELD_LABELS, NORMALIZED_FIELDS } from '@/domain/models/fields'
import type { GeocodeCandidate } from '@/domain/models/geocode'
import type { EstablishmentRecord } from '@/domain/models/record'
import { resultHistory } from '@/domain/services/reviewService'
import { ScoreBreakdown } from '@/features/results/ScoreBreakdown'
import { cx } from '@/shared/cx'

/**
 * Franja inferior de la revision: todo lo que hay que saber del registro
 * seleccionado, en pestanas y con alto fijo.
 *
 * En pestanas y no apilado porque el mapa es el area de trabajo: apilar
 * resultado, candidatos, datos originales e historial empujaba el mapa fuera de
 * la pantalla y obligaba a desplazar la pagina para tomar una decision.
 */

type Section = 'result' | 'candidates' | 'original' | 'history'

function coordinates(latitude: number, longitude: number): string {
  return `${longitude.toFixed(6)}, ${latitude.toFixed(6)}`
}

function OriginalData({ record }: { record: EstablishmentRecord }) {
  const filled = NORMALIZED_FIELDS.filter((field) => record.fields[field].trim() !== '')

  if (filled.length === 0) {
    return <p className="text-ink-muted text-xs">Este registro no tiene ningun campo con datos.</p>
  }

  return (
    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {filled.map((field) => (
        <div key={field} className="flex gap-2">
          <dt className="text-ink-muted w-36 shrink-0">{FIELD_LABELS[field]}</dt>
          <dd className="min-w-0 font-medium">{record.fields[field]}</dd>
        </div>
      ))}
    </dl>
  )
}

function GeoComponents({ record }: { record: EstablishmentRecord }) {
  const components = record.result?.components
  if (!components) return null

  const entries: readonly [string, string][] = [
    ['Estado/Departamento', components.region],
    ['Municipio/Ciudad', components.city],
    ['Codigo ZIP', components.postalCode],
    ['Pais', components.country],
  ]
  const filled = entries.filter(([, value]) => value.trim() !== '')
  if (filled.length === 0) return null

  return (
    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
      {filled.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="text-ink-muted shrink-0">{label}</dt>
          <dd className="min-w-0 truncate font-medium" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ReviewDetail({
  record,
  previewIndex,
  onPreview,
  onChoose,
}: {
  record: EstablishmentRecord
  /** Candidato que se esta mirando. `null` = el resultado actual. */
  previewIndex: number | null
  onPreview: (index: number | null) => void
  onChoose: (index: number) => void
}) {
  const [section, setSection] = useState<Section>('result')

  const result = record.result
  const candidates = result?.candidates ?? []
  const history = resultHistory(result)
  const rejected = record.rejected ?? []

  const isChosen = (candidate: GeocodeCandidate): boolean =>
    result !== null &&
    candidate.latitude === result.latitude &&
    candidate.longitude === result.longitude

  const sections: readonly TabOption<Section>[] = [
    { id: 'result', label: 'Resultado' },
    {
      id: 'candidates',
      label: 'Candidatos',
      badge: <Badge tone="neutral">{candidates.length}</Badge>,
    },
    { id: 'original', label: 'Datos originales' },
    ...(history.length > 0 || rejected.length > 0
      ? ([
          {
            id: 'history' as const,
            label: 'Historial',
            badge: <Badge tone="neutral">{history.length + rejected.length}</Badge>,
          },
        ] as const)
      : []),
  ]

  return (
    <div className="border-border-subtle bg-surface flex h-56 shrink-0 flex-col overflow-hidden rounded-lg border">
      <div className="px-3">
        <Tabs
          label="Detalle del registro"
          options={sections}
          value={section}
          onChange={setSection}
        />
      </div>

      <TabPanel id={section} className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {section === 'result' ? (
          result ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs">
                <p className="font-medium">{result.matchedName || '(sin nombre)'}</p>
                <p className="text-ink-muted">{result.matchedAddress}</p>
                <p className="text-ink-muted mt-1 tabular-nums">
                  Coordenadas (longitud, latitud):{' '}
                  <span className="text-ink font-medium">
                    {coordinates(result.latitude, result.longitude)}
                  </span>
                </p>
                <p className="text-ink-muted mt-1">
                  Consulta usada: <code>{result.queryUsed}</code> · proveedor {result.provider}
                </p>
              </div>

              <GeoComponents record={record} />

              {result.notes.length > 0 ? (
                <Callout tone="warn">
                  <ul className="list-inside list-disc">
                    {result.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </Callout>
              ) : null}

              <ScoreBreakdown signals={candidates[0]?.signals ?? {}} />
            </div>
          ) : (
            <Callout tone="warn">
              Este registro no tiene ubicacion. Busca de nuevo o marca el punto a mano sobre el
              mapa.
            </Callout>
          )
        ) : null}

        {section === 'candidates' ? (
          candidates.length === 0 ? (
            <p className="text-ink-muted text-xs">
              El proveedor no devolvio alternativas para este registro.
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink-muted text-xs">
                  Toca una ficha para verla en el mapa. El registro solo cambia con &quot;Usar
                  este&quot;.
                </p>
                {previewIndex !== null ? (
                  <Button
                    onClick={() => {
                      onPreview(null)
                    }}
                  >
                    Volver al actual
                  </Button>
                ) : null}
              </div>

              <ul className="grid gap-2 lg:grid-cols-2">
                {candidates.map((candidate, index) => {
                  const chosen = isChosen(candidate)
                  const previewing = previewIndex === index

                  return (
                    <li
                      key={`${String(candidate.latitude)}-${String(candidate.longitude)}-${String(index)}`}
                      className={cx(
                        'border-border-subtle flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5',
                        chosen && 'bg-accent-soft/40',
                        previewing && 'border-accent ring-accent/40 ring-2',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onPreview(index)
                        }}
                        aria-pressed={previewing}
                        className="hover:bg-surface-sunken min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs"
                        title="Ver este candidato en el mapa"
                      >
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          <span className="text-ink-muted tabular-nums">{index + 1}.</span>
                          {candidate.matchedName || '(sin nombre)'}
                          {chosen ? <Badge tone="accent">✓ actual</Badge> : null}
                          {previewing ? <Badge tone="neutral">viendo</Badge> : null}
                        </p>
                        <p className="text-ink-muted truncate">{candidate.matchedAddress}</p>
                        <p className="text-ink-muted tabular-nums">
                          {coordinates(candidate.latitude, candidate.longitude)} ·{' '}
                          {Math.round(candidate.confidence * 100)}%
                        </p>
                      </button>

                      {chosen ? null : (
                        <Button
                          variant={previewing ? 'primary' : 'secondary'}
                          onClick={() => {
                            onChoose(index)
                          }}
                        >
                          Usar este
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )
        ) : null}

        {section === 'original' ? (
          <>
            <p className="text-ink-muted mb-1.5 text-xs">
              Los datos de entrada no se modifican al revisar.
            </p>
            <OriginalData record={record} />
          </>
        ) : null}

        {section === 'history' ? (
          <ul className="text-ink-muted flex flex-col gap-1 text-xs">
            {history.map((previous, index) => (
              <li key={`prev-${String(index)}`}>
                <span aria-hidden="true">↩ </span>Sustituido:{' '}
                {previous.matchedName || '(sin nombre)'} —{' '}
                <span className="tabular-nums">
                  {coordinates(previous.latitude, previous.longitude)}
                </span>{' '}
                ({previous.provider}, {Math.round(previous.confidence * 100)}%)
              </li>
            ))}
            {rejected.map((previous, index) => (
              <li key={`rej-${String(index)}`}>
                <span aria-hidden="true">✕ </span>Rechazado:{' '}
                {previous.matchedName || '(sin nombre)'} —{' '}
                <span className="tabular-nums">
                  {coordinates(previous.latitude, previous.longitude)}
                </span>{' '}
                ({previous.provider})
              </li>
            ))}
          </ul>
        ) : null}
      </TabPanel>
    </div>
  )
}
