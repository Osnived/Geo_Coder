import { useMemo } from 'react'

import { useNavigation } from '@/app/navigationContext'
import { useAppStore } from '@/app/store'
import { Button, EmptyState } from '@/components/ui/primitives'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  batchTypeLabel,
  describeBatch,
  formatTimestamp,
  summarizeBatches,
} from '@/domain/models/batch'
import type { EstablishmentRecord } from '@/domain/models/record'
import type { RecordStatus } from '@/domain/models/status'
import { cx } from '@/shared/cx'

/**
 * Grupos de registros ingresados: de donde y cuando entro cada conjunto.
 *
 * Es la respuesta a "que he metido hasta ahora". Vive dentro de la vista Datos,
 * justo debajo del formulario de entrada, para que lo que se acaba de cargar
 * aparezca sin cambiar de pantalla.
 */

/** Reparto de estados de un grupo, para saber que le falta sin abrir la tabla. */
interface Progress {
  readonly total: number
  readonly resolved: number
  readonly pending: number
  readonly review: number
  readonly failed: number
}

function progressOf(records: readonly EstablishmentRecord[]): Progress {
  const count = (statuses: readonly RecordStatus[]) =>
    records.filter((record) => statuses.includes(record.status)).length

  return {
    total: records.length,
    resolved: count(['FOUND', 'MANUALLY_VERIFIED']),
    pending: count(['PENDING', 'SEARCHING']),
    review: count(['LOW_CONFIDENCE', 'NEEDS_REVIEW']),
    failed: count(['NOT_FOUND', 'ERROR']),
  }
}

/** Estado representativo del grupo, para la etiqueta con simbolo. */
function headlineStatus(progress: Progress): RecordStatus {
  if (progress.total === 0) return 'PENDING'
  if (progress.pending > 0) return 'PENDING'
  if (progress.failed > 0) return 'NOT_FOUND'
  if (progress.review > 0) return 'NEEDS_REVIEW'
  return 'FOUND'
}

function GroupCard({
  title,
  typeLabel,
  isExcel,
  createdAt,
  progress,
  isActiveManual,
  onOpen,
  onDelete,
}: {
  title: string
  typeLabel: string
  isExcel: boolean
  createdAt: string
  progress: Progress
  isActiveManual: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const stamp = formatTimestamp(createdAt)

  return (
    <li
      className={cx(
        'border-border-subtle bg-surface flex flex-col gap-2 rounded-md border px-3 py-2.5',
        isActiveManual && 'border-accent/60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {/* Decorativo: el tipo se dice con palabras justo debajo. */}
            <span aria-hidden="true" className="text-ink-muted">
              {isExcel ? '📄' : '✎'}
            </span>
            <span className="truncate" title={title}>
              {title}
            </span>
          </p>
          <p className="text-ink-muted mt-0.5 text-xs">
            {typeLabel} · {progress.total} registro(s)
            {stamp === '' ? '' : ` · ${stamp}`}
            {isActiveManual ? ' · grupo abierto' : ''}
          </p>
        </div>

        <StatusBadge status={headlineStatus(progress)} />
      </div>

      <div className="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>
          <span aria-hidden="true">✓</span> {progress.resolved} resueltos
        </span>
        {progress.review > 0 ? (
          <span>
            <span aria-hidden="true">⚠</span> {progress.review} por revisar
          </span>
        ) : null}
        {progress.failed > 0 ? (
          <span>
            <span aria-hidden="true">✕</span> {progress.failed} sin resultado
          </span>
        ) : null}
        {progress.pending > 0 ? (
          <span>
            <span aria-hidden="true">○</span> {progress.pending} sin procesar
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onOpen}>Ver registros</Button>
        <Button variant="ghost" onClick={onDelete} title="Borra el grupo y todos sus registros">
          Borrar grupo
        </Button>
      </div>
    </li>
  )
}

export function GroupList() {
  const batches = useAppStore((state) => state.batches)
  const records = useAppStore((state) => state.records)
  const activeManualBatchId = useAppStore((state) => state.activeManualBatchId)
  const deleteBatch = useAppStore((state) => state.deleteBatch)
  const setFilters = useAppStore((state) => state.setFilters)
  const { go } = useNavigation()

  const groups = useMemo(() => {
    const byBatch = new Map<string, EstablishmentRecord[]>()
    for (const record of records) {
      const bucket = byBatch.get(record.batchId)
      if (bucket) bucket.push(record)
      else byBatch.set(record.batchId, [record])
    }

    return (
      summarizeBatches(batches, records)
        .map((entry) => ({
          ...entry,
          progress: progressOf(byBatch.get(entry.batch.id) ?? []),
        }))
        // Lo ultimo cargado arriba: es lo que se acaba de hacer.
        .reverse()
    )
  }, [batches, records])

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Todavia no hay registros"
        hint="Carga un Excel o escribe uno a mano. Cada carga forma su propio grupo."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {groups.map(({ batch, progress }) => (
        <GroupCard
          key={batch.id}
          title={describeBatch(batch)}
          typeLabel={batchTypeLabel(batch)}
          isExcel={batch.source === 'excel'}
          createdAt={batch.createdAt}
          progress={progress}
          isActiveManual={batch.id === activeManualBatchId}
          onOpen={() => {
            // La tabla se abre ya filtrada por este grupo: es lo que se pidio.
            setFilters({ batchId: batch.id, text: '', status: 'all', source: 'all' })
            go('records')
          }}
          onDelete={() => {
            void deleteBatch(batch.id)
          }}
        />
      ))}
    </ul>
  )
}
