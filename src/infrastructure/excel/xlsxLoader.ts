import { ExcelReadError } from './errors'
import type { RawGrid } from './types'

/**
 * Adaptador sobre ExcelJS. Es el unico archivo del proyecto que conoce esa
 * libreria: cambiarla no deberia afectar a nada mas (spec seccion 10 y 19).
 *
 * La importacion es dinamica para que ExcelJS no entre en el bundle inicial:
 * solo se descarga cuando el usuario carga un archivo.
 */

interface ExcelJsWorksheet {
  readonly name: string
  readonly rowCount: number
  readonly columnCount: number
  getRow(index: number): { getCell(index: number): { value: unknown } }
}

interface ExcelJsWorkbook {
  readonly worksheets: readonly ExcelJsWorksheet[]
  readonly xlsx: { load(buffer: ArrayBuffer): Promise<unknown> }
}

interface ExcelJsModule {
  Workbook: new () => ExcelJsWorkbook
}

async function loadExcelJs(): Promise<ExcelJsModule> {
  const imported: unknown = await import('exceljs')
  // ExcelJS se publica como CJS/UMD; segun el bundler llega en `default`.
  const candidates = [
    imported,
    (imported as { default?: unknown }).default,
    ((imported as { default?: { default?: unknown } }).default ?? {}).default,
  ]
  for (const candidate of candidates) {
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      typeof (candidate as { Workbook?: unknown }).Workbook === 'function'
    ) {
      return candidate as ExcelJsModule
    }
  }
  throw new ExcelReadError('CORRUPT_FILE', 'no se pudo inicializar el lector de Excel')
}

function worksheetToGrid(worksheet: ExcelJsWorksheet): RawGrid {
  const grid: RawGrid = []
  const columnCount = Math.max(worksheet.columnCount, 0)

  for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex)
    const cells: unknown[] = []
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      cells.push(row.getCell(columnIndex).value)
    }
    grid.push(cells)
  }

  return grid
}

/** Lee un .xlsx completo y devuelve la matriz cruda de cada hoja. */
export async function loadXlsxGrids(buffer: ArrayBuffer): Promise<Map<string, RawGrid>> {
  const ExcelJS = await loadExcelJs()
  const workbook = new ExcelJS.Workbook()

  try {
    await workbook.xlsx.load(buffer)
  } catch (error) {
    throw new ExcelReadError('CORRUPT_FILE', error instanceof Error ? error.message : undefined)
  }

  if (workbook.worksheets.length === 0) throw new ExcelReadError('NO_SHEETS')

  const grids = new Map<string, RawGrid>()
  workbook.worksheets.forEach((worksheet, index) => {
    // Los nombres duplicados son imposibles en Excel, pero un nombre vacio si.
    const name = worksheet.name || `Hoja ${String(index + 1)}`
    grids.set(name, worksheetToGrid(worksheet))
  })

  return grids
}
