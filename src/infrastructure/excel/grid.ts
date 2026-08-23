import { cellToString } from '@/domain/rules/text'
import type { SheetData } from '@/domain/services/recordNormalizer'

import { ExcelReadError } from './errors'
import type { PreviewOptions, RawGrid, ReadSheetOptions, SheetPreview } from './types'

/**
 * Logica de interpretacion de una matriz de celdas, comun a XLSX y CSV.
 * No depende de ninguna libreria de lectura.
 */

/** Filas iniciales que se inspeccionan para localizar el encabezado. */
const HEADER_SEARCH_DEPTH = 20
const DEFAULT_SAMPLE_SIZE = 20

export function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((cell) => cellToString(cell) === '')
}

/** Quita filas en blanco al final, que Excel suele arrastrar. */
export function trimTrailingBlankRows(grid: RawGrid): RawGrid {
  let end = grid.length
  while (end > 0) {
    const row = grid[end - 1]
    if (row === undefined || isBlankRow(row)) end -= 1
    else break
  }
  return grid.slice(0, end)
}

function filledCellCount(row: readonly unknown[]): number {
  return row.reduce<number>((count, cell) => (cellToString(cell) === '' ? count : count + 1), 0)
}

/**
 * Localiza la fila de encabezado.
 *
 * Se queda con la fila mas "poblada" de las primeras filas, no simplemente con
 * la primera no vacia: los Excel reales suelen empezar con un titulo suelto en
 * A1 seguido de una fila en blanco. En empate gana la fila mas alta.
 *
 * Devuelve el indice 0-based dentro de la matriz. Siempre es una propuesta:
 * el usuario puede sobrescribirla.
 */
export function detectHeaderRowIndex(grid: RawGrid): number {
  const depth = Math.min(HEADER_SEARCH_DEPTH, grid.length)
  let bestIndex = -1
  let bestCount = 0

  for (let index = 0; index < depth; index += 1) {
    const row = grid[index]
    if (row === undefined) continue
    const count = filledCellCount(row)
    if (count > bestCount) {
      bestCount = count
      bestIndex = index
    }
  }

  if (bestIndex === -1) throw new ExcelReadError('NO_HEADERS')
  return bestIndex
}

/** Encabezados como texto. Las columnas sin titulo quedan como cadena vacia. */
export function extractHeaders(row: readonly unknown[], columnCount: number): string[] {
  const headers: string[] = []
  for (let index = 0; index < columnCount; index += 1) {
    headers.push(cellToString(row[index]))
  }
  return headers
}

export function widestRowLength(grid: RawGrid): number {
  return grid.reduce((widest, row) => Math.max(widest, row.length), 0)
}

/** Indices de columna sin ningun dato en las filas de datos. */
export function findEmptyColumns(dataRows: RawGrid, columnCount: number): number[] {
  const empty: number[] = []
  for (let column = 0; column < columnCount; column += 1) {
    const hasValue = dataRows.some((row) => cellToString(row[column]) !== '')
    if (!hasValue) empty.push(column)
  }
  return empty
}

interface SplitGrid {
  readonly headerRowNumber: number
  readonly headers: string[]
  readonly dataRows: RawGrid
  readonly columnCount: number
}

function splitGrid(grid: RawGrid, headerRowNumber?: number): SplitGrid {
  const trimmed = trimTrailingBlankRows(grid)
  if (trimmed.length === 0) throw new ExcelReadError('EMPTY_SHEET')

  const headerIndex =
    headerRowNumber === undefined ? detectHeaderRowIndex(trimmed) : headerRowNumber - 1

  const headerRow = trimmed[headerIndex]
  if (headerRow === undefined) {
    throw new ExcelReadError('NO_HEADERS', `fila ${String(headerRowNumber)}`)
  }

  const columnCount = Math.max(widestRowLength(trimmed), headerRow.length)

  return {
    headerRowNumber: headerIndex + 1,
    headers: extractHeaders(headerRow, columnCount),
    dataRows: trimmed.slice(headerIndex + 1),
    columnCount,
  }
}

export function buildPreview(
  sheetName: string,
  grid: RawGrid,
  options: PreviewOptions = {},
): SheetPreview {
  const { headerRowNumber, headers, dataRows, columnCount } = splitGrid(
    grid,
    options.headerRowNumber,
  )
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE

  return {
    sheetName,
    headerRowNumber,
    headers,
    sampleRows: dataRows.slice(0, sampleSize),
    totalDataRows: dataRows.length,
    nonBlankDataRows: dataRows.filter((row) => !isBlankRow(row)).length,
    emptyColumnIndexes: findEmptyColumns(dataRows, columnCount),
  }
}

export function buildSheetData(
  fileName: string,
  sheetName: string,
  grid: RawGrid,
  options: ReadSheetOptions = {},
): SheetData {
  const { headerRowNumber, headers, dataRows } = splitGrid(grid, options.headerRowNumber)

  return { fileName, sheetName, headers, headerRowNumber, rows: dataRows }
}
