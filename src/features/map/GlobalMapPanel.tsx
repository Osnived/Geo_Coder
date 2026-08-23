import { useCallback, useMemo, useRef, useState } from 'react'

import { useAppStore } from '@/app/store'
import { Badge, Button, Callout, Panel, Select, TextInput } from '@/components/ui/primitives'
import { describeBatch, formatTimestamp, LEGACY_BATCH } from '@/domain/models/batch'
import type { EstablishmentRecord } from '@/domain/models/record'
import { STATUS_LABELS } from '@/domain/models/status'
import { canonicalize } from '@/domain/rules/text'
import { cx } from '@/shared/cx'

import { LocationMap, type FlyTarget, type MapPoint } from './LocationMap'

/**
 * Mapa con todos los registros localizados.
 *
 * La lista y el mapa son la misma seleccion vista de dos formas: elegir en la
 * lista resalta el punto, y pinchar el punto resalta la fila.
 */

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

/** Centro por defecto cuando todavía no hay nada que mostrar: Bogotá. */
const FALLBACK_CENTER = { latitude: 4.711, longitude: -74.0721 }

function displayName(record: EstablishmentRecord): string {
  return (
    record.fields.location_name ||
    record.fields.client ||
    record.fields.address ||
    '(registro sin nombre)'
  )
}

function secondLine(record: EstablishmentRecord): string {
  return [record.fields.address, record.fields.city, record.fields.country]
    .filter((part) => part.trim() !== '')
    .join(', ')
}

export function GlobalMapPanel() {
  const records = useAppStore((state) => state.records)
  const batches = useAppStore((state) => state.batches)

  const [batchId, setBatchId] = useState('all')
  const [onlyVerified, setOnlyVerified] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null)
  const [fitNonce, setFitNonce] = useState(0)

  // Cada vuelo necesita un disparador distinto para poder repetirse.
  const flightNumber = useRef(0)

  const batchLabel = useMemo(() => {
    const byId = new Map(batches.map((batch) => [batch.id, describeBatch(batch)]))
    return (id: string) => byId.get(id) ?? LEGACY_BATCH.label
  }, [batches])

  /** Solo se pueden dibujar los registros que tienen coordenadas. */
  const located = useMemo(() => records.filter((record) => record.result !== null), [records])

  const visible = useMemo(() => {
    const needle = canonicalize(search)
    return located.filter((record) => {
      if (batchId !== 'all' && record.batchId !== batchId) return false
      if (onlyVerified && record.result?.manuallyVerified !== true) return false
      if (needle !== '' && !canonicalize(Object.values(record.fields).join(' ')).includes(needle)) {
        return false
      }
      return true
    })
  }, [located, batchId, onlyVerified, search])

  const points: MapPoint[] = useMemo(
    () =>
      visible.flatMap((record) => {
        const result = record.result
        if (!result) return []
        return [
          {
            id: record.id,
            latitude: result.latitude,
            longitude: result.longitude,
            label: displayName(record),
            detail: `${result.matchedAddress || secondLine(record)} · ${String(
              Math.round(result.confidence * 100),
            )}%`,
            selected: record.id === selectedId,
          },
        ]
      }),
    [visible, selectedId],
  )

  const selected = visible.find((record) => record.id === selectedId) ?? null

  /** Elegir en la lista selecciona el registro y acerca el mapa a su punto. */
  const selectFromList = useCallback((record: EstablishmentRecord) => {
    const result = record.result
    if (!result) return

    setSelectedId(record.id)
    flightNumber.current += 1
    setFlyTo({
      latitude: result.latitude,
      longitude: result.longitude,
      nonce: flightNumber.current,
    })
  }, [])

  /**
   * Pinchar un marcador solo selecciona: el punto ya esta a la vista y
   * acercarse haria perder la panoramica que el usuario estaba mirando.
   */
  const selectFromMap = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const showAll = useCallback(() => {
    setFlyTo(null)
    setFitNonce((current) => current + 1)
  }, [])

  if (records.length === 0) {
    return (
      <Panel title="Mapa">
        <p className="text-ink-muted text-sm">
          Todavía no hay registros. Importa un Excel y geocodifícalo.
        </p>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <Panel
        title={`Localizados (${String(visible.length)})`}
        description={
          located.length < records.length
            ? `${String(records.length - located.length)} sin coordenadas, no se pueden dibujar.`
            : 'Todos los registros tienen coordenadas.'
        }
      >
        <div className="flex flex-col gap-2">
          <TextInput
            placeholder="Buscar..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />

          <Select
            aria-label="Filtrar por lote"
            value={batchId}
            onChange={(event) => {
              setBatchId(event.target.value)
              setSelectedId(null)
              setFlyTo(null)
            }}
          >
            <option value="all">Todos los lotes</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {describeBatch(batch)} — {formatTimestamp(batch.createdAt)}
              </option>
            ))}
          </Select>

          <label className="text-ink-muted flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={onlyVerified}
              onChange={(event) => {
                setOnlyVerified(event.target.checked)
              }}
            />
            Solo verificados manualmente
          </label>

          {visible.length === 0 ? (
            <p className="text-ink-muted py-6 text-center text-sm">
              Ningún registro localizado coincide con los filtros.
            </p>
          ) : (
            <ul className="flex max-h-[30rem] flex-col gap-1 overflow-y-auto">
              {visible.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectFromList(record)
                    }}
                    className={cx(
                      'w-full rounded-md px-2 py-1.5 text-left text-sm',
                      record.id === selectedId
                        ? 'bg-accent-soft text-accent'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span className="block truncate">{displayName(record)}</span>
                    <span className="text-ink-faint block truncate text-xs">
                      {batchLabel(record.batchId)} · {STATUS_LABELS[record.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel
          title="Mapa"
          description="Pincha un punto para verlo en la lista. El mapa se encuadra solo."
          actions={
            <>
              {selected ? (
                <Badge tone={STATUS_TONE[selected.status]}>{STATUS_LABELS[selected.status]}</Badge>
              ) : null}
              {visible.length > 1 ? (
                <Button onClick={showAll} title="Vuelve a encuadrar todos los puntos">
                  Ver todos
                </Button>
              ) : null}
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {visible.length === 0 ? (
              <Callout tone="warn">
                No hay nada que dibujar. Geocodifica registros o cambia los filtros.
              </Callout>
            ) : null}

            <LocationMap
              points={points}
              center={FALLBACK_CENTER}
              fitToPoints
              fitNonce={fitNonce}
              flyTo={flyTo}
              heightClass="h-[34rem]"
              onSelectPoint={selectFromMap}
            />

            {selected?.result ? (
              <div className="border-border-subtle rounded-md border px-3 py-2 text-xs">
                <p className="text-sm font-medium">{displayName(selected)}</p>
                <p className="text-ink-muted">{selected.result.matchedAddress}</p>
                <p className="text-ink-faint mt-1 tabular-nums">
                  {selected.result.latitude.toFixed(6)}, {selected.result.longitude.toFixed(6)} ·{' '}
                  {Math.round(selected.result.confidence * 100)}% · {selected.result.provider}
                </p>
                <p className="text-ink-faint mt-1">
                  Lote: {batchLabel(selected.batchId)} · creado{' '}
                  {formatTimestamp(selected.createdAt)}
                </p>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  )
}
