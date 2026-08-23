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

/** Genera el .xlsx en memoria y lo devuelve como Blob listo para descargar. */
export async function writeSheetToBlob(
  sheet: ExportSheet,
  options: WriteOptions = {},
): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Geolocator'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(options.sheetName ?? 'Resultados')

  worksheet.addRow([...sheet.headers])
  for (const row of sheet.rows) {
    worksheet.addRow([...row])
  }

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(sheet.headers.length, 1) },
  }

  sheet.headers.forEach((header, index) => {
    worksheet.getColumn(index + 1).width = columnWidth(header, sheet.rows, index)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
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
