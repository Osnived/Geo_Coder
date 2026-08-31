import { useMemo, useState } from 'react'

import { useAppStore } from '@/app/store'
import { Badge, Button, Callout, Field, Panel, Select, TextInput } from '@/components/ui/primitives'
import { describeBatch, formatTimestamp, LEGACY_BATCH } from '@/domain/models/batch'
import { FIELD_LABELS, type NormalizedField } from '@/domain/models/fields'
import type { EstablishmentRecord } from '@/domain/models/record'
import { RECORD_STATUSES, STATUS_LABELS } from '@/domain/models/status'
import { StatusBadge } from '@/components/ui/StatusBadge'

import {
  summarizeValidation,
  validateRecord,
  type ValidationOptions,
} from '@/domain/rules/validation'

import { ScrollableTable } from '@/components/ui/ScrollableTable'

import { filterRecords } from './filterRecords'

/** Columnas visibles en la tabla, en orden. */
const COLUMNS: readonly NormalizedField[] = [
  'client',
  'business_type',
  'location_name',
  'address',
  'city',
  'region',
  'postal_code',
  'country',
]

function ValidationCell({
  record,
  options,
}: {
  record: EstablishmentRecord
  options: ValidationOptions
}) {
  const issues = validateRecord(record, options)
  if (issues.length === 0) return <Badge tone="ok">correcto</Badge>

  const errors = issues.filter((issue) => issue.level === 'error')
  const summary = issues.map((issue) => issue.message).join('\n')

  return (
    <Badge tone={errors.length > 0 ? 'danger' : 'warn'} title={summary}>
      {errors.length > 0
        ? `${String(errors.length)} error(es)`
        : `${String(issues.length)} aviso(s)`}
    </Badge>
  )
}

function EditableRow({
  record,
  onCancel,
  onSave,
}: {
  record: EstablishmentRecord
  onCancel: () => void
  onSave: (changes: Partial<Record<NormalizedField, string>>) => void
}) {
  const [draft, setDraft] = useState({ ...record.fields })

  return (
    <tr className="bg-accent-soft/40 border-border-subtle border-t">
      <td />
      {COLUMNS.map((field) => (
        <td key={field} className="px-1.5 py-1.5">
          <TextInput
            aria-label={FIELD_LABELS[field]}
            value={draft[field]}
            onChange={(event) => {
              setDraft((current) => ({ ...current, [field]: event.target.value }))
            }}
          />
        </td>
      ))}
      <td />
      <td />
      <td />
      <td />
      <td />
      <td className="px-2 py-1.5">
        <div className="flex gap-1">
          <Button
            variant="primary"
            onClick={() => {
              onSave(draft)
            }}
          >
            Guardar
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </td>
    </tr>
  )
}

export function RecordsTable() {
  const records = useAppStore((state) => state.records)
  const filters = useAppStore((state) => state.filters)
  const requireCountry = useAppStore((state) => state.requireCountry)
  const country = useAppStore((state) => state.country)
  const setFilters = useAppStore((state) => state.setFilters)
  const updateRecord = useAppStore((state) => state.updateRecord)
  const duplicateRecord = useAppStore((state) => state.duplicateRecord)
  const deleteRecords = useAppStore((state) => state.deleteRecords)
  const clearRecords = useAppStore((state) => state.clearRecords)
  const batches = useAppStore((state) => state.batches)

  const batchLabel = useMemo(() => {
    const byId = new Map(batches.map((batch) => [batch.id, describeBatch(batch)]))
    return (batchId: string) => byId.get(batchId) ?? LEGACY_BATCH.label
  }, [batches])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const validationOptions = useMemo<ValidationOptions>(
    () => ({ requireCountry, hasSessionCountry: country !== null }),
    [requireCountry, country],
  )

  const visible = useMemo(
    () => filterRecords(records, filters, validationOptions),
    [records, filters, validationOptions],
  )

  const summary = useMemo(
    () => summarizeValidation(records, validationOptions),
    [records, validationOptions],
  )

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisibleSelected =
    visible.length > 0 && visible.every((record) => selected.has(record.id))

  return (
    <Panel
      fill
      title={`Registros (${String(records.length)})`}
      description="Excel y entrada manual comparten el mismo modelo. Los datos originales se conservan intactos."
      actions={
        records.length > 0 ? (
          <Button
            variant="danger"
            onClick={() => {
              void clearRecords()
              setSelected(new Set())
            }}
          >
            Vaciar todo
          </Button>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label="Buscar en cualquier campo">
              <TextInput
                type="search"
                value={filters.text}
                onChange={(event) => {
                  setFilters({ text: event.target.value })
                }}
              />
            </Field>
          </div>

          <div className="min-w-44 flex-1 sm:max-w-64">
            <Field label="Grupo">
              <Select
                value={filters.batchId}
                onChange={(event) => {
                  setFilters({ batchId: event.target.value })
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
          </div>

          <div className="min-w-36 flex-1 sm:max-w-40">
            <Field label="Origen">
              <Select
                value={filters.source}
                onChange={(event) => {
                  setFilters({ source: event.target.value as typeof filters.source })
                }}
              >
                <option value="all">Todos los origenes</option>
                <option value="excel">Excel</option>
                <option value="manual">Manual</option>
              </Select>
            </Field>
          </div>

          <div className="min-w-40 flex-1 sm:max-w-48">
            <Field label="Estado">
              <Select
                value={filters.status}
                onChange={(event) => {
                  setFilters({ status: event.target.value as typeof filters.status })
                }}
              >
                <option value="all">Todos los estados</option>
                {RECORD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <label className="text-ink-muted flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap">
            <input
              type="checkbox"
              checked={filters.onlyWithIssues}
              onChange={(event) => {
                setFilters({ onlyWithIssues: event.target.checked })
              }}
            />
            Solo con problemas
          </label>
        </div>

        {summary.withErrors > 0 ? (
          <Callout tone="warn">
            {summary.withErrors} registro(s) con errores y {summary.withWarnings} con avisos. Nada
            se descarta: corrigelos aqui o mas adelante.
          </Callout>
        ) : null}

        {selected.size > 0 ? (
          <div className="border-border-subtle bg-surface-muted flex items-center gap-2 rounded-md border px-3 py-2">
            <span className="text-sm">{selected.size} seleccionado(s)</span>
            <Button
              variant="danger"
              onClick={() => {
                void deleteRecords([...selected])
                setSelected(new Set())
              }}
            >
              Eliminar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSelected(new Set())
              }}
            >
              Quitar seleccion
            </Button>
          </div>
        ) : null}

        {records.length === 0 ? (
          <div className="border-border-subtle text-ink-muted rounded-md border border-dashed px-4 py-10 text-center text-sm">
            Todavia no hay registros. Importa un Excel o crea uno manualmente.
          </div>
        ) : (
          <ScrollableTable fill>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-ink-muted text-xs [&>th]:bg-surface-sunken [&>th]:sticky [&>th]:top-0 [&>th]:z-10">
                  <th className="w-9 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todo lo visible"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? new Set(visible.map((record) => record.id))
                            : new Set(),
                        )
                      }}
                    />
                  </th>
                  {COLUMNS.map((field) => (
                    <th key={field} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                      {FIELD_LABELS[field]}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Grupo</th>
                  <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Creado</th>
                  <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Coordenadas</th>
                  <th className="px-2 py-2 text-left font-medium">Estado</th>
                  <th className="px-2 py-2 text-left font-medium">Validacion</th>
                  <th className="px-2 py-2 text-left font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((record) =>
                  editingId === record.id ? (
                    <EditableRow
                      key={record.id}
                      record={record}
                      onCancel={() => {
                        setEditingId(null)
                      }}
                      onSave={(changes) => {
                        void updateRecord(record.id, changes)
                        setEditingId(null)
                      }}
                    />
                  ) : (
                    <tr key={record.id} className="border-border-subtle border-t">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar registro ${record.id}`}
                          checked={selected.has(record.id)}
                          onChange={() => {
                            toggle(record.id)
                          }}
                        />
                      </td>
                      {COLUMNS.map((field) => (
                        <td
                          key={field}
                          className="max-w-56 truncate px-2 py-1.5"
                          title={record.fields[field]}
                        >
                          {record.fields[field] || <span className="text-ink-muted">—</span>}
                        </td>
                      ))}
                      <td
                        className="text-ink-muted max-w-40 truncate px-2 py-1.5 text-xs"
                        title={batchLabel(record.batchId)}
                      >
                        {batchLabel(record.batchId)}
                      </td>
                      <td className="text-ink-muted px-2 py-1.5 text-xs whitespace-nowrap">
                        {formatTimestamp(record.createdAt)}
                      </td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap tabular-nums">
                        {record.result ? (
                          <span title={record.result.matchedAddress}>
                            {record.result.latitude.toFixed(5)},{' '}
                            {record.result.longitude.toFixed(5)}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <StatusBadge
                          status={record.status}
                          {...(record.result ? { confidence: record.result.confidence } : {})}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <ValidationCell record={record} options={validationOptions} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEditingId(record.id)
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              void duplicateRecord(record.id)
                            }}
                          >
                            Duplicar
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              void deleteRecords([record.id])
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </ScrollableTable>
        )}

        {records.length > 0 && visible.length === 0 ? (
          <p className="text-ink-muted text-center text-sm">
            Ningun registro coincide con los filtros.
          </p>
        ) : null}

        {records.length > 0 ? (
          <p className="text-ink-muted shrink-0 text-xs">
            Mostrando {visible.length} de {records.length}. Origen:{' '}
            {records.filter((record) => record.source === 'excel').length} importados,{' '}
            {records.filter((record) => record.source === 'manual').length} manuales.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}
