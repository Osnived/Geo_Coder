import type { Country } from '../models/country'
import { emptyFields, type NormalizedField, type NormalizedFields } from '../models/fields'
import { createRecord, type EstablishmentRecord } from '../models/record'
import { cellToString, collapseWhitespace } from '../rules/text'

/**
 * Convierte hojas de Excel y entradas manuales al mismo modelo normalizado
 * (spec seccion 4.2 y 23 > Normalizacion).
 *
 * Es TypeScript puro: no lee archivos ni conoce ExcelJS. Recibe una hoja ya
 * extraida por la capa de infraestructura.
 */

/** Hoja ya leida por la infraestructura, con celdas todavia crudas. */
export interface SheetData {
  readonly fileName: string
  readonly sheetName: string
  /** Encabezados tal como aparecen en el archivo, sin normalizar. */
  readonly headers: readonly string[]
  /** Fila (1-based) de la que se tomaron los encabezados. */
  readonly headerRowNumber: number
  /** Filas de datos. Cada fila esta alineada por indice con `headers`. */
  readonly rows: readonly (readonly unknown[])[]
}

/**
 * Asignacion columna -> campo. El indice del array es el indice de columna.
 * `null` significa "ignorar esta columna".
 */
export type ColumnAssignment = readonly (NormalizedField | null)[]

export interface NormalizeOptions {
  /** Lote al que pertenecen los registros creados. */
  readonly batchId: string
  /** Genera el identificador interno unico de cada registro. */
  readonly newId: () => string
  /** Marca de tiempo ISO para createdAt/updatedAt. */
  readonly now: () => string
  /** Pais global. Solo rellena registros que no traen pais propio. */
  readonly defaultCountry?: Country | null
}

export interface NormalizeSheetResult {
  readonly records: EstablishmentRecord[]
  /**
   * Numeros de fila (1-based, como los ve el usuario en Excel) que estaban
   * completamente en blanco y no generaron registro.
   */
  readonly skippedBlankRows: number[]
}

/**
 * Construye las claves de `original`. Los encabezados duplicados se
 * desambiguan ("CIUDAD", "CIUDAD (2)") para no perder ninguna columna.
 */
export function buildOriginalKeys(headers: readonly string[]): string[] {
  const used = new Map<string, number>()
  return headers.map((header, index) => {
    const base = collapseWhitespace(header) || `Columna ${index + 1}`
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    return seen === 0 ? base : `${base} (${seen + 1})`
  })
}

function applyDefaultCountry(fields: NormalizedFields, country: Country | null | undefined): void {
  if (!country) return
  if (fields.country.trim() === '') {
    fields.country = country.name
  }
}

export function normalizeSheet(
  sheet: SheetData,
  assignment: ColumnAssignment,
  options: NormalizeOptions,
): NormalizeSheetResult {
  const originalKeys = buildOriginalKeys(sheet.headers)
  const records: EstablishmentRecord[] = []
  const skippedBlankRows: number[] = []

  sheet.rows.forEach((row, rowOffset) => {
    // El usuario ve la fila de encabezado y luego los datos.
    const rowNumber = sheet.headerRowNumber + rowOffset + 1

    const original: Record<string, unknown> = {}
    const fields = emptyFields()
    let anyRawValue = false

    originalKeys.forEach((key, columnIndex) => {
      const raw = row[columnIndex]
      original[key] = raw ?? null

      const text = cellToString(raw)
      if (text !== '') anyRawValue = true

      const field = assignment[columnIndex]
      if (!field || text === '') return

      // Varias columnas pueden alimentar el mismo campo (p. ej. Direccion 1 y 2).
      fields[field] = fields[field] === '' ? text : `${fields[field]} ${text}`
    })

    if (!anyRawValue) {
      skippedBlankRows.push(rowNumber)
      return
    }

    applyDefaultCountry(fields, options.defaultCountry)

    records.push(
      createRecord({
        id: options.newId(),
        source: 'excel',
        batchId: options.batchId,
        fields,
        original,
        origin: {
          fileName: sheet.fileName,
          sheetName: sheet.sheetName,
          rowNumber,
        },
        timestamp: options.now(),
      }),
    )
  })

  return { records, skippedBlankRows }
}

/** Crea un registro a partir del formulario manual. Mismo modelo que Excel. */
export function normalizeManualEntry(
  input: Partial<NormalizedFields>,
  options: NormalizeOptions,
): EstablishmentRecord {
  const fields = emptyFields()
  for (const [key, value] of Object.entries(input)) {
    fields[key as NormalizedField] = collapseWhitespace(value ?? '')
  }
  applyDefaultCountry(fields, options.defaultCountry)

  return createRecord({
    id: options.newId(),
    source: 'manual',
    batchId: options.batchId,
    fields,
    original: {},
    origin: null,
    timestamp: options.now(),
  })
}

/** Copia un registro con un id nuevo. Usado por la accion "duplicar". */
export function duplicateRecord(
  record: EstablishmentRecord,
  options: NormalizeOptions,
): EstablishmentRecord {
  return {
    ...record,
    id: options.newId(),
    status: 'PENDING',
    result: null,
    createdAt: options.now(),
    updatedAt: options.now(),
    fields: { ...record.fields },
  }
}

/** Aplica cambios a un registro conservando id, origen y datos originales. */
export function updateRecordFields(
  record: EstablishmentRecord,
  changes: Partial<NormalizedFields>,
  options: Pick<NormalizeOptions, 'now'>,
): EstablishmentRecord {
  const fields = { ...record.fields }
  for (const [key, value] of Object.entries(changes)) {
    fields[key as NormalizedField] = collapseWhitespace(value ?? '')
  }
  return { ...record, fields, updatedAt: options.now() }
}
