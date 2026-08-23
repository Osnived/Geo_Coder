import type { RecordSource } from './record'

/**
 * Lote: el conjunto de registros que entraron juntos.
 *
 * Un lote es una importacion concreta de una hoja de un archivo, o la entrada
 * manual de un dia. Sirve para responder "estos registros, ¿de donde y cuando
 * salieron?" sin tener que mirar registro por registro.
 */
export interface ImportBatch {
  readonly id: string
  /** Nombre visible: el del archivo, o "Entrada manual". */
  readonly label: string
  readonly source: RecordSource
  /** Hoja del Excel, si vino de un archivo. */
  readonly sheetName: string | null
  /** Cuantos registros entraron. No cambia aunque despues se borren. */
  readonly importedCount: number
  readonly createdAt: string
}

/** Lote al que se asignan los registros guardados antes de existir los lotes. */
export const LEGACY_BATCH_ID = 'anteriores'

export const LEGACY_BATCH: ImportBatch = {
  id: LEGACY_BATCH_ID,
  label: 'Registros anteriores',
  source: 'manual',
  sheetName: null,
  importedCount: 0,
  createdAt: '',
}

/** Identificador del lote manual de un dia concreto. */
export function manualBatchId(isoTimestamp: string): string {
  return `manual-${isoTimestamp.slice(0, 10)}`
}

export function createManualBatch(isoTimestamp: string): ImportBatch {
  return {
    id: manualBatchId(isoTimestamp),
    label: 'Entrada manual',
    source: 'manual',
    sheetName: null,
    importedCount: 0,
    createdAt: isoTimestamp,
  }
}

export function createExcelBatch(input: {
  id: string
  fileName: string
  sheetName: string
  importedCount: number
  createdAt: string
}): ImportBatch {
  return {
    id: input.id,
    label: input.fileName,
    source: 'excel',
    sheetName: input.sheetName,
    importedCount: input.importedCount,
    createdAt: input.createdAt,
  }
}

/** Texto para la interfaz: "tiendas.xlsx · Hoja1" o "Entrada manual". */
export function describeBatch(batch: ImportBatch): string {
  return batch.sheetName ? `${batch.label} · ${batch.sheetName}` : batch.label
}

/** Fecha y hora en formato local corto. Cadena vacia si no hay fecha. */
export function formatTimestamp(isoTimestamp: string): string {
  if (isoTimestamp === '') return ''
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('es', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
