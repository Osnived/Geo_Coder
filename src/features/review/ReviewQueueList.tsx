import { useMemo } from 'react'

import { useAppStore } from '@/app/store'
import { Field, Select, TextInput } from '@/components/ui/primitives'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { describeBatch, summarizeBatches } from '@/domain/models/batch'
import type { EstablishmentRecord } from '@/domain/models/record'
import { cx } from '@/shared/cx'

import {
  GEOCODE_LABELS,
  OUTCOME_LABELS,
  type GeocodeFilter,
  type OutcomeFilter,
  type ReviewFilters,
} from './reviewFilters'

/**
 * Panel izquierdo de la revision: filtros y cola de registros.
 *
 * Los registros se agrupan por origen dentro de la propia lista, con una
 * cabecera pegajosa por grupo. Se descarto un selector aparte porque obliga a
 * mirar en dos sitios para saber de donde es cada fila.
 */

function displayName(record: EstablishmentRecord): string {
  return (
    record.fields.location_name ||
    record.fields.client ||
    record.fields.address ||
    '(registro sin nombre)'
  )
}

export function ReviewQueueList({
  queue,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
}: {
  queue: readonly EstablishmentRecord[]
  filters: ReviewFilters
  onFiltersChange: (changes: Partial<ReviewFilters>) => void
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const batches = useAppStore((state) => state.batches)
  const records = useAppStore((state) => state.records)

  const groupOptions = useMemo(() => summarizeBatches(batches, records), [batches, records])

  const groupName = useMemo(() => {
    const byId = new Map(batches.map((batch) => [batch.id, describeBatch(batch)]))
    return (id: string) => byId.get(id) ?? 'Registros anteriores'
  }, [batches])

  /** La cola, partida por grupo y conservando el orden de los registros. */
  const sections = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, EstablishmentRecord[]>()

    for (const record of queue) {
      const bucket = byGroup.get(record.batchId)
      if (bucket) bucket.push(record)
      else {
        byGroup.set(record.batchId, [record])
        order.push(record.batchId)
      }
    }

    return order.map((id) => ({ id, name: groupName(id), records: byGroup.get(id) ?? [] }))
  }, [queue, groupName])

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-2">
        <Field label="Buscar registros">
          <TextInput
            type="search"
            value={filters.text}
            onChange={(event) => {
              onFiltersChange({ text: event.target.value })
            }}
          />
        </Field>

        <Field label="Grupo">
          <Select
            value={filters.groupId}
            onChange={(event) => {
              onFiltersChange({ groupId: event.target.value })
            }}
          >
            <option value="all">Todos los grupos ({records.length})</option>
            {groupOptions.map(({ batch, recordCount }) => (
              <option key={batch.id} value={batch.id}>
                {describeBatch(batch)} ({recordCount})
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Geocodificacion">
            <Select
              value={filters.geocode}
              onChange={(event) => {
                onFiltersChange({ geocode: event.target.value as GeocodeFilter })
              }}
            >
              {(Object.keys(GEOCODE_LABELS) as GeocodeFilter[]).map((option) => (
                <option key={option} value={option}>
                  {GEOCODE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Resultado">
            <Select
              value={filters.outcome}
              onChange={(event) => {
                onFiltersChange({ outcome: event.target.value as OutcomeFilter })
              }}
            >
              {(Object.keys(OUTCOME_LABELS) as OutcomeFilter[]).map((option) => (
                <option key={option} value={option}>
                  {OUTCOME_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <p className="text-ink-muted shrink-0 text-xs" role="status">
        {queue.length} registro(s) en la cola
      </p>

      {queue.length === 0 ? (
        <p className="text-ink-muted py-6 text-center text-sm">Nada coincide con estos filtros.</p>
      ) : (
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {sections.map((section) => (
            <section key={section.id}>
              <h3 className="text-ink-muted bg-surface sticky top-0 z-10 truncate py-1 text-[0.65rem] font-semibold tracking-wide uppercase">
                {section.name} ({section.records.length})
              </h3>
              <ul className="mb-2 flex flex-col gap-0.5">
                {section.records.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(record.id)
                      }}
                      aria-current={record.id === selectedId ? 'true' : undefined}
                      className={cx(
                        'w-full rounded-md px-2 py-1.5 text-left text-sm',
                        record.id === selectedId
                          ? 'bg-accent-soft text-accent ring-accent/40 ring-1'
                          : 'hover:bg-surface-sunken',
                      )}
                    >
                      <span className="block truncate">{displayName(record)}</span>
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
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
