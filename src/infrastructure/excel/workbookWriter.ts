import type { ExportSheet } from '@/domain/services/exportBuilder'

/**
 * Escritura de archivos .xlsx. Adaptador sobre ExcelJS, cargado bajo demanda
 * igual que el lector.
 */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Ancho de columna estimado a partir del contenido, con topes razonables. */
function columnWidth(header: string, rows: readonly (readonly unknown[])[], index: number): number {
  let widest = header.length
  for (const row of rows.slice(0, 200)) {
    const value = row[index]
    const length = value === null || value === undefined ? 0 : String(value).length
    if (length > widest) widest = length
  }
  return Math.min(Math.max(widest + 2, 10), 50)
}

export interface WriteOptions {
  readonly sheetName?: string
}

export interface SheetToWrite {
  readonly name: string
  readonly sheet: ExportSheet
  /** Filtro y cabecera fija. Se desactiva en hojas de texto explicativo. */
  readonly asTable?: boolean
}

/** Genera un .xlsx con varias hojas y lo devuelve como Blob. */
export async function writeWorkbookToBlob(sheets: readonly SheetToWrite[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Geolocator'
  workbook.created = new Date()

  for (const { name, sheet, asTable = true } of sheets) {
    const worksheet = workbook.addWorksheet(name)

    worksheet.addRow([...sheet.headers])
    for (const row of sheet.rows) {
      worksheet.addRow([...row])
    }

    worksheet.getRow(1).font = { bold: true }
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]

    if (asTable && sheet.headers.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.headers.length },
      }
    }

    sheet.headers.forEach((header, index) => {
      worksheet.getColumn(index + 1).width = columnWidth(header, sheet.rows, index)
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

/** Atajo para el caso habitual de una sola hoja. */
export async function writeSheetToBlob(
  sheet: ExportSheet,
  options: WriteOptions = {},
): Promise<Blob> {
  return writeWorkbookToBlob([{ name: options.sheetName ?? 'Resultados', sheet }])
}

/** Nombre de archivo con marca temporal, para no sobrescribir exportaciones. */
export function exportFileName(prefix = 'geolocator', date: Date = new Date()): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `${prefix}-${stamp}.xlsx`
}

/** Dispara la descarga en el navegador. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Se libera en el siguiente ciclo: revocarlo de inmediato aborta la descarga
  // en algunos navegadores.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
