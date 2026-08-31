import { ScrollableTable } from '@/components/ui/ScrollableTable'
import { cellToString } from '@/domain/rules/text'
import type { SheetPreview } from '@/infrastructure/excel'
import { cx } from '@/shared/cx'

/** Vista previa de la hoja tal como esta en el archivo, sin normalizar. */
export function PreviewTable({ preview }: { preview: SheetPreview }) {
  const empty = new Set(preview.emptyColumnIndexes)

  return (
    <ScrollableTable maxHeightClass="max-h-96">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="[&>th]:bg-surface-sunken [&>th]:sticky [&>th]:top-0 [&>th]:z-10">
            <th className="text-ink-muted w-12 px-2 py-1.5 text-right font-medium">#</th>
            {preview.headers.map((header, index) => (
              <th
                key={index}
                className={cx(
                  'border-border-subtle border-l px-2 py-1.5 text-left font-semibold whitespace-nowrap',
                  empty.has(index) && 'text-ink-muted italic',
                )}
              >
                {header || <span className="text-ink-muted">(sin encabezado)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.sampleRows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-border-subtle border-t">
              <td className="text-ink-muted px-2 py-1 text-right tabular-nums">
                {preview.headerRowNumber + rowIndex + 1}
              </td>
              {preview.headers.map((_, columnIndex) => (
                <td
                  key={columnIndex}
                  className="border-border-subtle max-w-64 truncate border-l px-2 py-1"
                  title={cellToString(row[columnIndex])}
                >
                  {cellToString(row[columnIndex])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTable>
  )
}
