import type { SheetData } from '@/domain/services/recordNormalizer'

/** Matriz cruda de una hoja: filas de celdas sin interpretar. */
export type RawGrid = (readonly unknown[])[]

export interface SheetSummary {
  readonly name: string
  /** Filas con al menos una celda con contenido. */
  readonly rowCount: number
  readonly columnCount: number
  readonly isEmpty: boolean
}

export interface SheetPreview {
  readonly sheetName: string
  /** Fila (1-based) usada como encabezado. */
  readonly headerRowNumber: number
  readonly headers: readonly string[]
  /** Primeras filas de datos, para la vista previa. */
  readonly sampleRows: RawGrid
  /** Total de filas de datos disponibles, no solo las de la muestra. */
  readonly totalDataRows: number
  /** Indices de columna cuyas celdas estan todas vacias. */
  readonly emptyColumnIndexes: readonly number[]
}

/**
 * Libro ya cargado en memoria. La aplicacion trabaja contra esta interfaz,
 * no contra ExcelJS ni Papa Parse (spec seccion 19).
 */
export interface LoadedWorkbook {
  readonly fileName: string
  readonly sheets: readonly SheetSummary[]
  /** Detecta la fila de encabezado y devuelve una muestra para la UI. */
  preview(sheetName: string, options?: PreviewOptions): SheetPreview
  /** Devuelve la hoja completa en el formato que consume el dominio. */
  readSheet(sheetName: string, options?: ReadSheetOptions): SheetData
}

export interface PreviewOptions {
  /** Numero de filas de datos a incluir en la muestra. Por defecto 20. */
  readonly sampleSize?: number
  /** Fuerza la fila de encabezado en lugar de detectarla. */
  readonly headerRowNumber?: number
}

export interface ReadSheetOptions {
  readonly headerRowNumber?: number
}
