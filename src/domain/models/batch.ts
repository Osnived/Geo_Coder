import type { RecordSource } from './record'

/**
 * Grupo (lote): el conjunto de registros que entraron juntos.
 *
 * Un grupo es una importacion concreta de una hoja de un archivo, o una sesion
 * de entrada manual. Sirve para responder "estos registros, ¿de donde y cuando
 * salieron?" sin tener que mirar registro por registro, y es la unidad con la
 * que se filtra en revision y se elige que exportar.
 *
 * Los nombres de campo se mantienen (`label`, `source`, `importedCount`) para
 * no romper lo ya guardado en IndexedDB. Conceptualmente son el `name`, el
 * `type` y el `recordCount` del grupo.
 */
export interface ImportBatch {
  readonly id: string
  /** Nombre visible: el del archivo, o "Manual — 31/08/2026 08:45". */
  readonly label: string
  readonly source: RecordSource
  /** Hoja del Excel, si vino de un archivo. */
  readonly sheetName: string | null
  /** Cuantos registros entraron. No cambia aunque despues se borren. */
  readonly importedCount: number
  readonly createdAt: string
}

/** Grupo al que se asignan los registros guardados antes de existir los grupos. */
export const LEGACY_BATCH_ID = 'anteriores'

export const LEGACY_BATCH: ImportBatch = {
  id: LEGACY_BATCH_ID,
  label: 'Registros anteriores',
  source: 'manual',
  sheetName: null,
  importedCount: 0,
  createdAt: '',
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

/**
 * Nombre de un grupo manual: "Manual — 31/08/2026 08:45".
 *
 * Lleva la hora y no solo el dia porque un grupo manual es una sesion de
 * trabajo, no una jornada: quien mete veinte tiendas por la manana y otras
 * treinta por la tarde tiene dos conjuntos distintos.
 */
export function manualBatchLabel(isoTimestamp: string): string {
  const stamp = formatTimestamp(isoTimestamp)
  return stamp === '' ? 'Manual' : `Manual — ${stamp}`
}

/**
 * Crea el grupo de una sesion de entrada manual.
 *
 * El identificador se pasa desde fuera y no se deriva de la fecha: dos grupos
 * creados en el mismo milisegundo compartirian id, y entonces cerrar un grupo
 * para empezar otro no serviria de nada. La fecha solo da el nombre visible.
 *
 * Antes se agrupaba por dia, lo que mezclaba tandas que el usuario habia
 * introducido como conjuntos separados.
 */
export function createManualBatch(input: { id: string; createdAt: string }): ImportBatch {
  return {
    id: input.id,
    label: manualBatchLabel(input.createdAt),
    source: 'manual',
    sheetName: null,
    importedCount: 0,
    createdAt: input.createdAt,
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

/** Texto para la interfaz: "tiendas.xlsx · Hoja1" o "Manual — 31/08/2026 08:45". */
export function describeBatch(batch: ImportBatch): string {
  return batch.sheetName ? `${batch.label} · ${batch.sheetName}` : batch.label
}

/** Etiqueta corta del tipo de grupo, para badges y filtros. */
export function batchTypeLabel(batch: ImportBatch): string {
  return batch.source === 'excel' ? 'Excel' : 'Manual'
}

/**
 * Grupos con su recuento actual de registros.
 *
 * `importedCount` es historico y no baja al borrar registros; `recordCount` es
 * lo que de verdad hay ahora, que es lo que se filtra y se exporta. Los
 * registros cuyo grupo no esta guardado (versiones anteriores) se agrupan bajo
 * el grupo heredado para que sigan siendo visibles.
 */
export interface BatchSummary {
  readonly batch: ImportBatch
  readonly recordCount: number
}

export function summarizeBatches(
  batches: readonly ImportBatch[],
  records: readonly { readonly batchId: string }[],
): BatchSummary[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    counts.set(record.batchId, (counts.get(record.batchId) ?? 0) + 1)
  }

  const known = batches.map((batch) => ({ batch, recordCount: counts.get(batch.id) ?? 0 }))

  const orphans = [...counts.entries()]
    .filter(([id]) => !batches.some((batch) => batch.id === id))
    .map(([id, recordCount]) => ({ batch: { ...LEGACY_BATCH, id }, recordCount }))

  return [...known, ...orphans].filter(
    (entry) => entry.recordCount > 0 || entry.batch.importedCount > 0,
  )
}
