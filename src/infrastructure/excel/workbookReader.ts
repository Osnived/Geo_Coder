import { cellToString } from '@/domain/rules/text'
import type { SheetData } from '@/domain/services/recordNormalizer'

import { loadCsvGrid } from './csvLoader'
import { ExcelReadError } from './errors'
import { buildPreview, buildSheetData, isBlankRow, trimTrailingBlankRows } from './grid'
import type {
  LoadedWorkbook,
  PreviewOptions,
  RawGrid,
  ReadSheetOptions,
  SheetSummary,
} from './types'
import { loadXlsxGrids } from './xlsxLoader'

/**
 * Punto de entrada de lectura de archivos. El resto de la aplicacion solo usa
 * `readWorkbook` y la interfaz `LoadedWorkbook`.
 */

const XLSX_EXTENSIONS = ['xlsx', 'xlsm']
const CSV_EXTENSIONS = ['csv', 'tsv', 'txt']

export function fileExtension(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName.toLowerCase())
  return match?.[1] ?? ''
}

function summarize(name: string, grid: RawGrid): SheetSummary {
  const trimmed = trimTrailingBlankRows(grid)
  const rowCount = trimmed.filter((row) => !isBlankRow(row)).length
  const columnCount = trimmed.reduce((widest, row) => {
    let lastFilled = 0
    row.forEach((cell, index) => {
      if (cellToString(cell) !== '') lastFilled = index + 1
    })
    return Math.max(widest, lastFilled)
  }, 0)

  return { name, rowCount, columnCount, isEmpty: rowCount === 0 }
}

function makeWorkbook(fileName: string, grids: Map<string, RawGrid>): LoadedWorkbook {
  const sheets = [...grids.entries()].map(([name, grid]) => summarize(name, grid))

  const gridFor = (sheetName: string): RawGrid => {
    const grid = grids.get(sheetName)
    if (grid === undefined) throw new ExcelReadError('SHEET_NOT_FOUND', sheetName)
    return grid
  }

  return {
    fileName,
    sheets,
    preview: (sheetName: string, options?: PreviewOptions) =>
      buildPreview(sheetName, gridFor(sheetName), options),
    readSheet: (sheetName: string, options?: ReadSheetOptions): SheetData =>
      buildSheetData(fileName, sheetName, gridFor(sheetName), options),
  }
}

export interface WorkbookInput {
  readonly fileName: string
  readonly buffer: ArrayBuffer
}

/** Carga un archivo en memoria y devuelve el libro listo para inspeccionar. */
export async function readWorkbook(input: WorkbookInput): Promise<LoadedWorkbook> {
  const extension = fileExtension(input.fileName)

  if (XLSX_EXTENSIONS.includes(extension)) {
    return makeWorkbook(input.fileName, await loadXlsxGrids(input.buffer))
  }

  if (CSV_EXTENSIONS.includes(extension)) {
    const grid = loadCsvGrid(input.buffer)
    // Un CSV es una sola hoja; se nombra con el archivo para que la UI sea coherente.
    return makeWorkbook(input.fileName, new Map([[input.fileName, grid]]))
  }

  throw new ExcelReadError('UNSUPPORTED_FORMAT', extension === '' ? 'sin extension' : extension)
}

/** Envoltura para el input de archivos del navegador. */
export async function readWorkbookFile(file: File): Promise<LoadedWorkbook> {
  return readWorkbook({ fileName: file.name, buffer: await file.arrayBuffer() })
}
