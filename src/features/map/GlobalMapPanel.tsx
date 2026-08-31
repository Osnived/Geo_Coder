import { useCallback, useMemo, useRef, useState } from 'react'

import { useAppStore } from '@/app/store'
import { Button, Callout, Field, Panel, Select, TextInput } from '@/components/ui/primitives'
import { describeBatch, formatTimestamp, LEGACY_BATCH } from '@/domain/models/batch'
import type { EstablishmentRecord } from '@/domain/models/record'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { canonicalize } from '@/domain/rules/text'
import { cx } from '@/shared/cx'

import { LocationMap, type FlyTarget, type MapPoint } from './LocationMap'

/**
 * Mapa con todos los registros localizados.
 *
 * La lista y el mapa son la misma seleccion vista de dos formas: elegir en la
 * lista resalta el punto, y pinchar el punto resalta la fila.
 */

/** A partir de aqui, agrupar aporta mas que estorba. */
const AUTO_GROUP_FROM = 25

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
  /**
   * `null` = decidir solo. Con pocos puntos agrupar estorba; con cientos, sin
   * agrupar no se distingue si una chincheta tapa a dos o a veinte.
   */
  const [groupOverride, setGroupOverride] = useState<boolean | null>(null)

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

  const grouping = groupOverride ?? visible.length >= AUTO_GROUP_FROM

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
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[20rem_1fr]">
      <Panel
        fill
        title={`Localizados (${String(visible.length)})`}
        description={
          located.length < records.length
            ? `${String(records.length - located.length)} sin coordenadas, no se pueden dibujar.`
            : 'Todos los registros tienen coordenadas.'
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <Field label="Buscar registros">
            <TextInput
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
              }}
            />
          </Field>

          <Field label="Grupo">
            <Select
              value={batchId}
              onChange={(event) => {
                setBatchId(event.target.value)
                setSelectedId(null)
                setFlyTo(null)
              }}
            >
              <option value="all">Todos los grupos</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {describeBatch(batch)} — {formatTimestamp(batch.createdAt)}
                </option>
              ))}
            </Select>
          </Field>

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
            <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
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
                    <span className="text-ink-muted block truncate text-xs">
                      {batchLabel(record.batchId)}
                    </span>
                    <span className="mt-0.5 block">
                      <StatusBadge
                        status={record.status}
                        {...(record.result ? { confidence: record.result.confidence } : {})}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="flex flex-col gap-4 lg:min-h-0">
        <Panel
          fill
          title="Mapa"
          description={
            grouping
              ? 'Los puntos cercanos se agrupan. Pincha un grupo para abrirlo.'
              : 'Pincha un punto para verlo en la lista. El mapa se encuadra solo.'
          }
          actions={
            <>
              {selected ? <StatusBadge status={selected.status} /> : null}
              {visible.length > 1 ? (
                <>
                  <label className="text-ink-muted flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={grouping}
                      onChange={(event) => {
                        setGroupOverride(event.target.checked)
                      }}
                    />
                    Agrupar
                  </label>
                  <Button onClick={showAll} title="Vuelve a encuadrar todos los puntos">
                    Ver todos
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          <div className="flex min-h-72 flex-col gap-3 lg:min-h-0 lg:flex-1">
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
              cluster={grouping}
              fill
              onSelectPoint={selectFromMap}
            />

            {selected?.result ? (
              <div className="border-border-subtle shrink-0 rounded-md border px-3 py-2 text-xs">
                <p className="text-sm font-medium">{displayName(selected)}</p>
                <p className="text-ink-muted">{selected.result.matchedAddress}</p>
                <p className="text-ink-muted mt-1 tabular-nums">
                  {/* longitud, latitud: la misma convencion que la exportacion. */}
                  {selected.result.longitude.toFixed(6)}, {selected.result.latitude.toFixed(6)} ·{' '}
                  {Math.round(selected.result.confidence * 100)}% · {selected.result.provider}
                </p>
                <p className="text-ink-muted mt-1">
                  Grupo: {batchLabel(selected.batchId)} · creado{' '}
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
