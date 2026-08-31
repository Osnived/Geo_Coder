import { useMemo, useState } from 'react'

import { useNavigation } from '@/app/navigationContext'
import { useAppStore } from '@/app/store'
import { Button, Callout, EmptyState, Panel, Section } from '@/components/ui/primitives'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  batchTypeLabel,
  describeBatch,
  formatTimestamp,
  summarizeBatches,
} from '@/domain/models/batch'
import { RECORD_STATUSES, type RecordStatus } from '@/domain/models/status'
import {
  buildExport,
  DEFAULT_SECTIONS,
  selectForExport,
  type ExportSections,
} from '@/domain/services/exportBuilder'
import { downloadBlob, exportFileName, writeSheetToBlob } from '@/infrastructure/excel'

/**
 * Exportacion a .xlsx (spec seccion 17).
 *
 * Se conservan las columnas originales y se anaden los campos normalizados, la
 * informacion geografica separada y el resultado. Nunca se elimina informacion
 * de entrada.
 */

/** Que registros entran, ademas del filtro por grupo. */
type Scope = 'all' | 'located' | 'verified'

const SCOPE_LABELS: Record<Scope, string> = {
  all: 'Todos los registros',
  located: 'Solo los que tienen coordenadas',
  verified: 'Solo los verificados manualmente',
}

const SECTION_LABELS: Record<keyof ExportSections, string> = {
  original: 'Datos originales',
  geographic: 'Informacion geografica',
  result: 'Resultado de la busqueda',
  group: 'Grupo de origen',
}

const SECTION_HINTS: Record<keyof ExportSections, string> = {
  original: 'Las columnas tal cual venian del archivo importado.',
  geographic: 'Estado, municipio, ZIP, direccion encontrada y coordenadas.',
  result: 'Estado, confianza, proveedor y consulta que funciono.',
  group: 'Nombre, tipo y fecha del grupo del que salio cada registro.',
}

export function ExportPanel() {
  const records = useAppStore((state) => state.records)
  const batches = useAppStore((state) => state.batches)
  const { go } = useNavigation()

  const [scope, setScope] = useState<Scope>('all')
  const [sections, setSections] = useState<ExportSections>(DEFAULT_SECTIONS)
  /** `null` = todos los grupos. Un conjunto = exactamente esos. */
  const [groupIds, setGroupIds] = useState<ReadonlySet<string> | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFile, setLastFile] = useState<{ name: string; rows: number } | null>(null)

  const groups = useMemo(() => summarizeBatches(batches, records), [batches, records])

  const byScope = useMemo(() => {
    if (scope === 'located') return records.filter((record) => record.result !== null)
    if (scope === 'verified') {
      return records.filter((record) => record.result?.manuallyVerified === true)
    }
    return records
  }, [records, scope])

  const options = useMemo(
    () => ({
      batches,
      sections,
      ...(groupIds === null ? {} : { groupIds: [...groupIds] }),
    }),
    [batches, sections, groupIds],
  )

  const selected = useMemo(() => selectForExport(byScope, options), [byScope, options])

  const sheet = useMemo(() => buildExport(byScope, options), [byScope, options])

  const byStatus = useMemo(() => {
    const counts = new Map<RecordStatus, number>()
    for (const record of selected) {
      counts.set(record.status, (counts.get(record.status) ?? 0) + 1)
    }
    return RECORD_STATUSES.filter((status) => counts.has(status)).map(
      (status) => [status, counts.get(status) ?? 0] as const,
    )
  }, [selected])

  const allGroups = groupIds === null

  const toggleGroup = (id: string) => {
    setLastFile(null)
    setGroupIds((current) => {
      // Desmarcar "Todos" empieza desde ese grupo suelto.
      if (current === null) return new Set([id])
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // Sin ninguno marcado se vuelve a "Todos": exportar cero no es una opcion
      // que nadie quiera pedir a proposito.
      return next.size === 0 ? null : next
    })
  }

  const handleExport = () => {
    setIsWorking(true)
    setError(null)

    void writeSheetToBlob(sheet)
      .then((blob) => {
        const name = exportFileName()
        downloadBlob(blob, name)
        setLastFile({ name, rows: sheet.rows.length })
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo generar el archivo.')
      })
      .finally(() => {
        setIsWorking(false)
      })
  }

  if (records.length === 0) {
    return (
      <Panel fill title="Exportar">
        <EmptyState
          title="No hay nada que exportar todavia"
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
    <Panel
      fill
      title="Exportar a Excel"
      description={`${String(selected.length)} de ${String(records.length)} registro(s) entraran en el archivo.`}
      actions={
        <Button
          variant="primary"
          disabled={isWorking || selected.length === 0}
          onClick={handleExport}
        >
          {isWorking ? 'Generando...' : `Exportar ${String(selected.length)} registro(s)`}
        </Button>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Grupos"
            description="Puedes exportar todos, uno o varios."
            actions={
              allGroups ? undefined : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setGroupIds(null)
                  }}
                >
                  Seleccionar todos
                </Button>
              )
            }
          >
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">Grupos a exportar</legend>

              <label className="border-border-subtle flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allGroups}
                  onChange={() => {
                    setGroupIds(null)
                    setLastFile(null)
                  }}
                />
                Todos los grupos
                <span className="text-ink-muted ml-auto text-xs tabular-nums">
                  {records.length}
                </span>
              </label>

              {groups.map(({ batch, recordCount }) => (
                <label
                  key={batch.id}
                  className="hover:bg-surface-sunken flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!allGroups && (groupIds?.has(batch.id) ?? false)}
                    onChange={() => {
                      toggleGroup(batch.id)
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate" title={describeBatch(batch)}>
                    {describeBatch(batch)}
                    <span className="text-ink-muted block text-xs">
                      {batchTypeLabel(batch)}
                      {formatTimestamp(batch.createdAt) === ''
                        ? ''
                        : ` · ${formatTimestamp(batch.createdAt)}`}
                    </span>
                  </span>
                  <span className="text-ink-muted text-xs tabular-nums">{recordCount}</span>
                </label>
              ))}
            </fieldset>
          </Section>

          <div className="flex flex-col gap-6">
            <Section title="Que registros">
              <fieldset className="flex flex-col gap-1.5">
                <legend className="sr-only">Registros a incluir</legend>
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="export-scope"
                      checked={scope === option}
                      onChange={() => {
                        setScope(option)
                        setLastFile(null)
                      }}
                    />
                    {SCOPE_LABELS[option]}
                  </label>
                ))}
              </fieldset>
            </Section>

            <Section title="Informacion incluida" description="Formato: Excel (.xlsx)">
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Bloques de columnas</legend>
                {(Object.keys(SECTION_LABELS) as (keyof ExportSections)[]).map((key) => (
                  <label key={key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={sections[key]}
                      onChange={(event) => {
                        setSections((current) => ({ ...current, [key]: event.target.checked }))
                        setLastFile(null)
                      }}
                    />
                    <span>
                      {SECTION_LABELS[key]}
                      <span className="text-ink-muted block text-xs">{SECTION_HINTS[key]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </Section>

            <Section title="Contenido del archivo">
              <ul className="flex flex-wrap gap-1.5">
                {byStatus.map(([status, count]) => (
                  <li key={status}>
                    <span className="flex items-center gap-1">
                      <StatusBadge status={status} />
                      <span className="text-ink-muted text-xs tabular-nums">{count}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <details className="text-xs">
                <summary className="text-accent cursor-pointer rounded underline underline-offset-2">
                  Ver las {sheet.headers.length} columnas
                </summary>
                <p className="text-ink-muted mt-1.5 break-words">{sheet.headers.join(' · ')}</p>
              </details>
            </Section>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {selected.length === 0 ? (
            <Callout tone="warn">
              Ningun registro cumple los criterios elegidos. Marca otro grupo o cambia el filtro.
            </Callout>
          ) : null}
          {error ? <Callout tone="danger">{error}</Callout> : null}
          {lastFile ? (
            <Callout tone="ok">
              Exportacion completada: {lastFile.rows} registro(s) en{' '}
              <strong>{lastFile.name}</strong>. Busca el archivo en tus descargas.
            </Callout>
          ) : null}
        </div>
      </div>
    </Panel>
  )
}
