import {
  FIELD_LABELS,
  isNormalizedField,
  NORMALIZED_FIELDS,
  type NormalizedField,
} from '@/domain/models/fields'
import { cellToString } from '@/domain/rules/text'
import type { SheetPreview } from '@/infrastructure/excel'
import { Badge, Select } from '@/components/ui/primitives'

/**
 * Mapeo de columnas del archivo a campos normalizados.
 *
 * La deteccion automatica es solo una propuesta: todo se puede cambiar aqui,
 * incluido ignorar una columna (spec seccion 5).
 */

const IGNORE_VALUE = '__ignore__'

function sampleFor(preview: SheetPreview, columnIndex: number): string {
  for (const row of preview.sampleRows) {
    const text = cellToString(row[columnIndex])
    if (text !== '') return text
  }
  return ''
}

export function ColumnMapper({
  preview,
  mapping,
  displacedColumns,
  onChange,
}: {
  preview: SheetPreview
  mapping: readonly (NormalizedField | null)[]
  displacedColumns: Readonly<Record<number, number>>
  onChange: (columnIndex: number, field: NormalizedField | null) => void
}) {
  const emptyColumns = new Set(preview.emptyColumnIndexes)
  const mapped = new Set(mapping.filter((field): field is NormalizedField => field !== null))

  return (
    <div className="border-border-subtle overflow-hidden rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-sunken text-ink-muted text-xs">
            <th className="px-3 py-2 text-left font-medium">Columna del archivo</th>
            <th className="px-3 py-2 text-left font-medium">Ejemplo</th>
            <th className="w-64 px-3 py-2 text-left font-medium">Campo normalizado</th>
          </tr>
        </thead>
        <tbody>
          {preview.headers.map((header, columnIndex) => {
            const field = mapping[columnIndex] ?? null
            const displacedBy = displacedColumns[columnIndex]
            const sample = sampleFor(preview, columnIndex)

            return (
              <tr key={columnIndex} className="border-border-subtle border-t align-middle">
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">
                      {header || <span className="text-ink-muted italic">(sin encabezado)</span>}
                    </span>
                    {emptyColumns.has(columnIndex) ? (
                      <Badge tone="warn" title="Ninguna fila tiene valor en esta columna">
                        sin datos
                      </Badge>
                    ) : null}
                    {displacedBy !== undefined ? (
                      <Badge
                        tone="neutral"
                        title={`Otra columna (${preview.headers[displacedBy] ?? ''}) coincidia mejor con el mismo campo`}
                      >
                        duplicada
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="text-ink-muted max-w-64 truncate px-3 py-2 text-xs" title={sample}>
                  {sample || '—'}
                </td>
                <td className="px-3 py-2">
                  <Select
                    aria-label={`Campo para la columna ${header || String(columnIndex + 1)}`}
                    value={field ?? IGNORE_VALUE}
                    onChange={(event) => {
                      const value = event.target.value
                      onChange(columnIndex, isNormalizedField(value) ? value : null)
                    }}
                  >
                    <option value={IGNORE_VALUE}>Ignorar</option>
                    {NORMALIZED_FIELDS.map((option) => (
                      <option
                        key={option}
                        value={option}
                        // Un campo solo puede venir de una columna a la vez.
                        disabled={option !== field && mapped.has(option)}
                      >
                        {FIELD_LABELS[option]}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
