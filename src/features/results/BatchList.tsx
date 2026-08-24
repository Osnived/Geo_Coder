import { useMemo } from 'react'

import { useAppStore } from '@/app/store'
import { Badge, Button } from '@/components/ui/primitives'
import { describeBatch, formatTimestamp, LEGACY_BATCH } from '@/domain/models/batch'
import { cx } from '@/shared/cx'

/**
 * Lotes: de dónde y cuándo entró cada grupo de registros.
 *
 * El recuento importado no cambia aunque después se borren registros; al lado
 * se muestra cuántos quedan, que es lo que se puede filtrar y exportar.
 */
export function BatchList() {
  const batches = useAppStore((state) => state.batches)
  const records = useAppStore((state) => state.records)
  const filters = useAppStore((state) => state.filters)
  const setFilters = useAppStore((state) => state.setFilters)
  const deleteBatch = useAppStore((state) => state.deleteBatch)

  const rows = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of records) {
      counts.set(record.batchId, (counts.get(record.batchId) ?? 0) + 1)
    }

    const known = batches.map((batch) => ({ batch, current: counts.get(batch.id) ?? 0 }))

    // Registros de versiones anteriores, sin lote propio guardado.
    const orphans = [...counts.entries()].filter(
      ([id]) => !batches.some((batch) => batch.id === id),
    )
    const legacy = orphans.map(([id, current]) => ({
      batch: { ...LEGACY_BATCH, id },
      current,
    }))

    return [...known, ...legacy].filter((row) => row.current > 0 || row.batch.importedCount > 0)
  }, [batches, records])

  if (rows.length === 0) return null

  const selected = filters.batchId

  const activeLabel =
    selected === 'all' ? null : (rows.find((row) => row.batch.id === selected)?.batch.label ?? null)

  return (
    // Plegado por defecto: la tabla es lo importante, y el filtro por lote
    // tambien esta en el desplegable de arriba.
    <details className="shrink-0">
      <summary className="text-ink-muted flex cursor-pointer flex-wrap items-center gap-2 text-xs font-medium tracking-wide uppercase">
        Lotes ({rows.length})
        {activeLabel ? (
          <span className="text-accent normal-case">· filtrando por {activeLabel}</span>
        ) : null}
      </summary>

      {/* Acotado: con muchos lotes, la tabla seguiria siendo lo importante. */}
      <ul className="mt-1.5 flex max-h-28 flex-col gap-1 overflow-y-auto">
        {rows.map(({ batch, current }) => (
          <li
            key={batch.id}
            className={cx(
              'border-border-subtle flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-1.5',
              selected === batch.id && 'border-accent bg-accent-soft/40',
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setFilters({ batchId: selected === batch.id ? 'all' : batch.id })
              }}
            >
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {describeBatch(batch)}
                <Badge tone={batch.source === 'excel' ? 'accent' : 'neutral'}>
                  {batch.source === 'excel' ? 'importado' : 'manual'}
                </Badge>
              </span>
              <span className="text-ink-faint block text-xs">
                {formatTimestamp(batch.createdAt) || 'sin fecha'} · {current} registro(s)
                {batch.importedCount > 0 && batch.importedCount !== current
                  ? ` de ${String(batch.importedCount)} importados`
                  : ''}
              </span>
            </button>

            <Button
              variant="ghost"
              onClick={() => {
                void deleteBatch(batch.id)
              }}
              title="Borra el lote y todos sus registros"
            >
              Borrar lote
            </Button>
          </li>
        ))}
      </ul>

      {selected !== 'all' ? (
        <button
          type="button"
          className="text-accent mt-1 text-xs underline underline-offset-2"
          onClick={() => {
            setFilters({ batchId: 'all' })
          }}
        >
          Ver todos los lotes
        </button>
      ) : null}
    </details>
  )
}
