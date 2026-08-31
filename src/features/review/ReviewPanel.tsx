import { useEffect, useMemo, useRef, useState } from 'react'

import { useNavigation } from '@/app/navigationContext'
import { useAppStore } from '@/app/store'
import { Button, Callout, EmptyState, Panel } from '@/components/ui/primitives'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { describeBatch } from '@/domain/models/batch'
import type { EstablishmentRecord } from '@/domain/models/record'
import { needsReview } from '@/domain/services/reviewService'
import { LocationMap, type FlyTarget, type MapPoint } from '@/features/map/LocationMap'
import { cx } from '@/shared/cx'

import { ReviewDetail } from './ReviewDetail'
import {
  DEFAULT_REVIEW_FILTERS,
  filterForReview,
  summarizeReview,
  type ReviewFilters,
} from './reviewFilters'
import { buildReviewQueue, findNextPending } from './reviewQueue'
import { ReviewQueueList } from './ReviewQueueList'
import { ReviewSummaryBar } from './ReviewSummaryBar'

/**
 * Pantalla de revision y correccion manual (spec secciones 15 y 16).
 *
 * Rediseno: el mapa es el area de trabajo y ocupa lo que sobra de la pantalla.
 * A la izquierda, filtros y cola agrupada por origen; arriba, un resumen de dos
 * lineas; abajo, el detalle en pestanas de alto fijo. Nada de esto desplaza la
 * pagina: cada bloque se desplaza por dentro.
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

export function ReviewPanel() {
  const records = useAppStore((state) => state.records)
  const batches = useAppStore((state) => state.batches)
  const acceptResult = useAppStore((state) => state.acceptResult)
  const rejectResult = useAppStore((state) => state.rejectResult)
  const chooseCandidate = useAppStore((state) => state.chooseCandidate)
  const pickCoordinates = useAppStore((state) => state.pickCoordinates)
  const runGeocoding = useAppStore((state) => state.runGeocoding)
  const geocoding = useAppStore((state) => state.geocoding)
  const { go } = useNavigation()

  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_REVIEW_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState(false)
  /**
   * Candidato que se esta mirando, sin haberlo elegido todavia. `null` es
   * "estoy mirando el resultado actual".
   */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const flightNumber = useRef(0)

  const matching = useMemo(() => filterForReview(records, filters), [records, filters])

  const queue = useMemo(
    () => buildReviewQueue(matching, records, selectedId),
    [matching, records, selectedId],
  )

  const summary = useMemo(() => summarizeReview(records), [records])

  const nextPending = useMemo(() => findNextPending(matching, selectedId), [matching, selectedId])

  // Al entrar, o si el registro elegido desaparece, se pasa al primero.
  useEffect(() => {
    if (selectedId !== null && queue.some((record) => record.id === selectedId)) return
    setSelectedId(queue[0]?.id ?? null)
  }, [queue, selectedId])

  const selected = queue.find((record) => record.id === selectedId) ?? null
  const result = selected?.result ?? null

  const groupLabel = useMemo(() => {
    const batch = batches.find((entry) => entry.id === selected?.batchId)
    return batch ? describeBatch(batch) : (selected?.batchId ?? '')
  }, [batches, selected])

  /** True si ese candidato es el que esta puesto ahora mismo en el registro. */
  const isChosenPoint = (latitude: number, longitude: number): boolean =>
    result !== null && latitude === result.latitude && longitude === result.longitude

  /**
   * Todos los candidatos van al mapa, numerados igual que en la lista, para
   * poder emparejar cada ficha con su chincheta. El resaltado marca el que se
   * esta mirando: el previsualizado, o el actual si no hay ninguno.
   */
  const points: MapPoint[] = useMemo(() => {
    if (!result) return []

    const fromCandidates = result.candidates.map((candidate, index): MapPoint => {
      const chosen = isChosenPoint(candidate.latitude, candidate.longitude)
      const label = `${String(index + 1)}. ${candidate.matchedName || '(sin nombre)'}`
      return {
        id: `candidate-${String(index)}`,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        label: chosen ? `${label} — actual` : label,
        detail: `${candidate.matchedAddress} · ${String(Math.round(candidate.confidence * 100))}%`,
        selected: previewIndex === null ? chosen : previewIndex === index,
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
    setPickMode(false)
  }, [selectedId])

  const center = result
    ? { latitude: result.latitude, longitude: result.longitude }
    : FALLBACK_CENTER

  if (records.length === 0) {
    return (
      <Panel fill title="Revision">
        <EmptyState
          title="Todavia no hay registros que revisar"
          hint="Carga datos y geocodificalos primero."
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
    <div className="relative flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <ReviewSummaryBar summary={summary} />

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside
          aria-label="Cola de revision"
          // Apilada tiene un alto propio acotado; en ancho, el de su columna.
          className="border-border-subtle bg-surface flex max-h-[26rem] min-h-0 flex-col overflow-hidden rounded-lg border px-3 py-3 lg:max-h-none"
        >
          <ReviewQueueList
            queue={queue}
            filters={filters}
            onFiltersChange={(changes) => {
              setFilters((current) => ({ ...current, ...changes }))
            }}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        {selected ? (
          <div className="flex flex-col gap-3 lg:min-h-0">
            {/* Cabecera de accion: quien es y que se puede hacer con el. */}
            <div className="border-border-subtle bg-surface flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{displayName(selected)}</span>
                  <StatusBadge
                    status={selected.status}
                    {...(result ? { confidence: result.confidence } : {})}
                  />
                </p>
                <p className="text-ink-muted truncate text-xs">{groupLabel}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {result ? (
                  <>
                    <Button variant="primary" onClick={() => void acceptResult(selected.id)}>
                      <span aria-hidden="true">✓</span> Aceptar
                    </Button>
                    <Button variant="danger" onClick={() => void rejectResult(selected.id)}>
                      <span aria-hidden="true">✕</span> Rechazar
                    </Button>
                  </>
                ) : null}
                <Button
                  variant={pickMode ? 'primary' : 'secondary'}
                  aria-pressed={pickMode}
                  onClick={() => {
                    setPickMode(!pickMode)
                  }}
                >
                  {pickMode ? 'Cancelar marcado' : 'Marcar en el mapa'}
                </Button>
                <Button
                  disabled={geocoding.isRunning}
                  onClick={() => void runGeocoding([selected.id])}
                >
                  Buscar de nuevo
                </Button>
                {nextPending ? (
                  <Button
                    onClick={() => {
                      setSelectedId(nextPending.id)
                    }}
                    title={displayName(nextPending)}
                  >
                    Siguiente pendiente →
                  </Button>
                ) : null}
              </div>
            </div>

            {pickMode ? (
              <Callout tone="accent">
                Haz clic en el mapa para fijar las coordenadas. Quedara marcado como verificado
                manualmente.
              </Callout>
            ) : null}

            {!needsReview(selected) && result ? (
              <Callout tone="ok">
                Este registro ya esta resuelto. Sigue a la vista para que puedas comprobarlo o
                cambiarlo; pasa al siguiente cuando quieras.
              </Callout>
            ) : null}

            {/* El mapa se come todo el espacio que queda. */}
            <div
              className={cx(
                // `flex flex-col` es lo que deja crecer al mapa: con `fill` se
                // estira dentro de este contenedor. El alto minimo es lo que lo
                // salva en apilado, donde no queda espacio que repartir y el
                // mapa se dibujaba con 0 px de alto.
                'flex min-h-72 flex-col rounded-md lg:min-h-0 lg:flex-1',
                pickMode && 'ring-accent ring-2',
              )}
            >
              <LocationMap
                fill
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

            <ReviewDetail
              record={selected}
              previewIndex={previewIndex}
              onPreview={preview}
              onChoose={(index) => {
                // Al elegirlo pasa a ser el actual: ya no se previsualiza nada.
                setPreviewIndex(null)
                void chooseCandidate(selected.id, index)
              }}
            />
          </div>
        ) : (
          <Panel fill title="Sin seleccion">
            <EmptyState
              title="No hay nada seleccionado"
              hint="Quita algun filtro para ver mas registros."
            />
          </Panel>
        )}
      </div>
    </div>
  )
}
