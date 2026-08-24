import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppStore } from '@/app/store'
import { Badge, Button, Callout, Panel } from '@/components/ui/primitives'
import { FIELD_LABELS, NORMALIZED_FIELDS } from '@/domain/models/fields'
import type { GeocodeCandidate } from '@/domain/models/geocode'
import type { EstablishmentRecord } from '@/domain/models/record'
import { STATUS_LABELS } from '@/domain/models/status'
import { needsReview, resultHistory } from '@/domain/services/reviewService'
import { LocationMap, type FlyTarget, type MapPoint } from '@/features/map/LocationMap'

import { buildReviewQueue, findNextPending } from './reviewQueue'
import { ScoreBreakdown } from '@/features/results/ScoreBreakdown'
import { cx } from '@/shared/cx'

/**
 * Pantalla de revision y correccion manual (spec secciones 15 y 16).
 *
 * Muestra los datos originales, lo que se busco, lo que se encontro y con que
 * confianza, y deja aceptar, rechazar, elegir otro candidato o marcar un punto
 * a mano sobre el mapa.
 */

/** Centro por defecto cuando no hay ninguna coordenada: Bogota. */
const FALLBACK_CENTER = { latitude: 4.711, longitude: -74.0721 }

function displayName(record: EstablishmentRecord): string {
  return (
    record.fields.location_name ||
    record.fields.client ||
    record.fields.address ||
    '(registro sin nombre)'
  )
}

function OriginalData({ record }: { record: EstablishmentRecord }) {
  const filled = NORMALIZED_FIELDS.filter((field) => record.fields[field].trim() !== '')

  return (
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {filled.map((field) => (
        <div key={field} className="flex gap-2">
          <dt className="text-ink-muted w-36 shrink-0">{FIELD_LABELS[field]}</dt>
          <dd className="font-medium">{record.fields[field]}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ReviewPanel() {
  const records = useAppStore((state) => state.records)
  const acceptResult = useAppStore((state) => state.acceptResult)
  const rejectResult = useAppStore((state) => state.rejectResult)
  const chooseCandidate = useAppStore((state) => state.chooseCandidate)
  const pickCoordinates = useAppStore((state) => state.pickCoordinates)
  const runGeocoding = useAppStore((state) => state.runGeocoding)
  const geocoding = useAppStore((state) => state.geocoding)

  const [onlyPending, setOnlyPending] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState(false)
  /**
   * Candidato que se esta mirando, sin haberlo elegido todavia. `null` es
   * "estoy mirando el resultado actual".
   */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const flightNumber = useRef(0)

  const queue = useMemo(
    () => buildReviewQueue(records, { onlyPending, selectedId }),
    [records, onlyPending, selectedId],
  )

  const nextPending = useMemo(() => findNextPending(records, selectedId), [records, selectedId])

  // Al entrar, o si el registro elegido desaparece (se borro, cambio el
  // filtro), se pasa al primero de la cola.
  useEffect(() => {
    if (selectedId !== null && queue.some((record) => record.id === selectedId)) return
    setSelectedId(queue[0]?.id ?? null)
  }, [queue, selectedId])

  const selected = queue.find((record) => record.id === selectedId) ?? null

  const result = selected?.result ?? null

  /** True si ese candidato es el que esta puesto ahora mismo en el registro. */
  const isChosen = (candidate: GeocodeCandidate): boolean =>
    result !== null &&
    candidate.latitude === result.latitude &&
    candidate.longitude === result.longitude

  /**
   * Todos los candidatos van al mapa, numerados igual que en la lista, para
   * poder emparejar cada ficha con su chincheta. El resaltado marca el que se
   * esta mirando: el previsualizado, o el actual si no hay ninguno.
   */
  const points: MapPoint[] = useMemo(() => {
    if (!result) return []

    const fromCandidates = result.candidates.map((candidate, index): MapPoint => {
      const label = `${String(index + 1)}. ${candidate.matchedName || '(sin nombre)'}`
      return {
        id: `candidate-${String(index)}`,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        label: isChosen(candidate) ? `${label} — actual` : label,
        detail: `${candidate.matchedAddress} · ${String(Math.round(candidate.confidence * 100))}%`,
        selected: previewIndex === null ? isChosen(candidate) : previewIndex === index,
      }
    })

    // Si el punto del registro no esta entre los candidatos (correccion manual
    // o candidatos de otra busqueda), se dibuja aparte para no perderlo.
    const covered = fromCandidates.some(
      (point) => point.latitude === result.latitude && point.longitude === result.longitude,
    )
    if (covered) return fromCandidates

    return [
      {
        id: 'result',
        latitude: result.latitude,
        longitude: result.longitude,
        label: result.matchedName || 'Resultado actual',
        detail: result.matchedAddress,
        selected: previewIndex === null,
      },
      ...fromCandidates,
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, previewIndex])

  /** Enfoca un candidato en el mapa sin tocar el registro. */
  const preview = (index: number | null) => {
    setPreviewIndex(index)
    const target = index === null ? result : (result?.candidates[index] ?? null)
    if (!target) return

    flightNumber.current += 1
    setFlyTo({
      latitude: target.latitude,
      longitude: target.longitude,
      nonce: flightNumber.current,
    })
  }

  /** Cambiar de registro descarta la previsualizacion anterior. */
  useEffect(() => {
    setPreviewIndex(null)
    setFlyTo(null)
  }, [selectedId])

  const previewed = previewIndex === null ? null : (result?.candidates[previewIndex] ?? null)

  const center = result
    ? { latitude: result.latitude, longitude: result.longitude }
    : FALLBACK_CENTER

  if (records.length === 0) {
    return (
      <Panel title="Revision">
        <p className="text-ink-muted text-sm">Todavia no hay registros que revisar.</p>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Panel
        title={`Cola (${String(queue.length)})`}
        description={onlyPending ? 'Registros que necesitan una decision.' : 'Todos con resultado.'}
      >
        <div className="flex flex-col gap-2">
          <label className="text-ink-muted flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(event) => {
                setOnlyPending(event.target.checked)
              }}
            />
            Solo los que necesitan revision
          </label>

          {queue.length === 0 ? (
            <p className="text-ink-muted py-6 text-center text-sm">
              Nada pendiente de revisar. Buen trabajo.
            </p>
          ) : (
            <ul className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto">
              {queue.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(record.id)
                      setPickMode(false)
                    }}
                    className={cx(
                      'w-full rounded-md px-2 py-1.5 text-left text-sm',
                      record.id === selectedId
                        ? 'bg-accent-soft text-accent'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span className="block truncate">{displayName(record)}</span>
                    <span className="text-ink-faint text-xs">
                      {STATUS_LABELS[record.status]}
                      {record.result
                        ? ` · ${String(Math.round(record.result.confidence * 100))}%`
                        : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {selected ? (
        <div className="flex flex-col gap-4">
          <Panel
            title={displayName(selected)}
            description="Datos originales del registro. No se modifican al revisar."
            actions={<Badge tone="neutral">{STATUS_LABELS[selected.status]}</Badge>}
          >
            <OriginalData record={selected} />
          </Panel>

          <Panel
            title="Resultado"
            description={
              selected.result
                ? `Proveedor ${selected.result.provider} · confianza ${String(
                    Math.round(selected.result.confidence * 100),
                  )}%`
                : 'Sin resultado todavia.'
            }
            actions={
              <>
                <Button
                  disabled={geocoding.isRunning}
                  onClick={() => void runGeocoding([selected.id])}
                >
                  Buscar de nuevo
                </Button>
                {nextPending ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSelectedId(nextPending.id)
                      setPickMode(false)
                    }}
                    title={displayName(nextPending)}
                  >
                    Siguiente pendiente
                  </Button>
                ) : null}
              </>
            }
          >
            <div className="flex flex-col gap-3">
              {!needsReview(selected) && selected.result ? (
                <Callout tone="accent">
                  Este registro ya esta resuelto. Sigue aqui para que puedas comprobarlo o
                  cambiarlo; pasa al siguiente cuando quieras.
                </Callout>
              ) : null}

              {selected.result ? (
                <>
                  <div className="text-xs">
                    <p className="font-medium">{selected.result.matchedName || '(sin nombre)'}</p>
                    <p className="text-ink-muted">{selected.result.matchedAddress}</p>
                    <p className="text-ink-faint mt-1 tabular-nums">
                      {selected.result.latitude.toFixed(6)}, {selected.result.longitude.toFixed(6)}
                    </p>
                    <p className="text-ink-faint mt-1">
                      Consulta usada: <code>{selected.result.queryUsed}</code>
                    </p>
                  </div>

                  {selected.result.notes.length > 0 ? (
                    <Callout tone="warn">
                      <ul className="list-inside list-disc">
                        {selected.result.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </Callout>
                  ) : null}

                  <ScoreBreakdown signals={selected.result.candidates[0]?.signals ?? {}} />

                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => void acceptResult(selected.id)}>
                      Aceptar
                    </Button>
                    <Button variant="danger" onClick={() => void rejectResult(selected.id)}>
                      Rechazar
                    </Button>
                    <Button
                      variant={pickMode ? 'primary' : 'secondary'}
                      onClick={() => {
                        setPickMode(!pickMode)
                      }}
                    >
                      {pickMode ? 'Cancelar marcado' : 'Marcar punto en el mapa'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Callout tone="warn">
                    Este registro no tiene ubicacion. Puedes buscar de nuevo o marcar el punto a
                    mano.
                  </Callout>
                  <Button
                    variant={pickMode ? 'primary' : 'secondary'}
                    onClick={() => {
                      setPickMode(!pickMode)
                    }}
                  >
                    {pickMode ? 'Cancelar marcado' : 'Marcar punto en el mapa'}
                  </Button>
                </div>
              )}

              {pickMode ? (
                <Callout tone="accent">
                  Haz clic en el mapa para fijar las coordenadas. Quedara marcado como verificado
                  manualmente.
                </Callout>
              ) : null}

              <LocationMap
                points={points}
                center={center}
                flyTo={flyTo}
                onSelectPoint={(id) => {
                  const match = /^candidate-(\d+)$/.exec(id)
                  preview(match?.[1] === undefined ? null : Number(match[1]))
                }}
                {...(pickMode
                  ? {
                      onPickPoint: (latitude: number, longitude: number) => {
                        void pickCoordinates(selected.id, latitude, longitude)
                        setPickMode(false)
                      },
                    }
                  : {})}
              />
            </div>
          </Panel>

          {result && result.candidates.length > 1 ? (
            <Panel
              title={`Candidatos (${String(result.candidates.length)})`}
              description="Toca uno para verlo en el mapa. Solo cambia el registro si pulsas 'Usar este'."
              actions={
                previewIndex !== null ? (
                  <Button
                    onClick={() => {
                      preview(null)
                    }}
                  >
                    Volver al actual
                  </Button>
                ) : undefined
              }
            >
              <ul className="flex flex-col gap-2">
                {result.candidates.map((candidate, index) => {
                  const chosen = isChosen(candidate)
                  const previewing = previewIndex === index

                  return (
                    <li
                      key={`${String(candidate.latitude)}-${String(candidate.longitude)}-${String(index)}`}
                      className={cx(
                        'border-border-subtle flex flex-wrap items-center gap-2 rounded-md border px-2 py-2',
                        chosen && 'bg-accent-soft/40',
                        previewing && 'border-accent ring-accent/40 ring-2',
                      )}
                    >
                      {/* La ficha entera previsualiza; usarlo es un boton aparte. */}
                      <button
                        type="button"
                        onClick={() => {
                          preview(index)
                        }}
                        aria-pressed={previewing}
                        className="hover:bg-surface-sunken min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs"
                        title="Ver este candidato en el mapa"
                      >
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          <span className="text-ink-faint tabular-nums">{index + 1}.</span>
                          {candidate.matchedName || '(sin nombre)'}
                          {chosen ? <Badge tone="accent">actual</Badge> : null}
                          {previewing ? <Badge tone="neutral">viendo</Badge> : null}
                        </p>
                        <p className="text-ink-muted truncate">{candidate.matchedAddress}</p>
                        <p className="text-ink-faint tabular-nums">
                          {candidate.latitude.toFixed(5)}, {candidate.longitude.toFixed(5)} ·{' '}
                          {Math.round(candidate.confidence * 100)}%
                        </p>
                      </button>

                      {chosen ? null : (
                        <Button
                          variant={previewing ? 'primary' : 'secondary'}
                          onClick={() => {
                            // Al elegirlo pasa a ser el actual: ya no se esta
                            // "previsualizando" nada.
                            setPreviewIndex(null)
                            void chooseCandidate(selected.id, index)
                          }}
                        >
                          Usar este
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>

              {previewed ? (
                <div className="mt-3">
                  <Callout tone="accent">
                    Estas viendo <strong>{previewed.matchedName || '(sin nombre)'}</strong> en el
                    mapa. El registro sigue apuntando al actual hasta que pulses &quot;Usar
                    este&quot;.
                  </Callout>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {resultHistory(selected.result).length > 0 || (selected.rejected?.length ?? 0) > 0 ? (
            <Panel
              title="Historial"
              description="Resultados sustituidos o rechazados. Nada se pierde."
            >
              <ul className="text-ink-muted flex flex-col gap-1 text-xs">
                {resultHistory(selected.result).map((previous, index) => (
                  <li key={`prev-${String(index)}`}>
                    Sustituido: {previous.matchedName || '(sin nombre)'} —{' '}
                    {previous.latitude.toFixed(5)}, {previous.longitude.toFixed(5)} (
                    {previous.provider}, {Math.round(previous.confidence * 100)}%)
                  </li>
                ))}
                {(selected.rejected ?? []).map((previous, index) => (
                  <li key={`rej-${String(index)}`}>
                    Rechazado: {previous.matchedName || '(sin nombre)'} —{' '}
                    {previous.latitude.toFixed(5)}, {previous.longitude.toFixed(5)} (
                    {previous.provider})
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : (
        <Panel title="Revision">
          <p className="text-ink-muted text-sm">
            No hay nada seleccionado. Todo lo pendiente esta resuelto.
          </p>
        </Panel>
      )}
    </div>
  )
}
