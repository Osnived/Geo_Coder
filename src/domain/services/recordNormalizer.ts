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

/**
 * Campos que admiten un valor por defecto para toda una carga.
 *
 * Solo los que se repiten igual en un archivo entero: la cadena a la que
 * pertenecen las tiendas y su tipo de establecimiento. `location_name` queda
 * fuera a proposito: darle el mismo nombre a todas las sucursales destruiria lo
 * unico que permite distinguirlas, que es de donde salen los topes de
 * confianza.
 */
export const DEFAULTABLE_FIELDS = ['client', 'business_type'] as const

export type DefaultableField = (typeof DEFAULTABLE_FIELDS)[number]

export type FieldDefaults = Partial<Record<DefaultableField, string>>

export interface NormalizeOptions {
  /** Lote al que pertenecen los registros creados. */
  readonly batchId: string
  /** Genera el identificador interno unico de cada registro. */
  readonly newId: () => string
  /** Marca de tiempo ISO para createdAt/updatedAt. */
  readonly now: () => string
  /** Pais global. Solo rellena registros que no traen pais propio. */
  readonly defaultCountry?: Country | null
  /**
   * Valores para toda la carga, escritos a mano cuando el archivo no trae la
   * columna. Solo rellenan huecos: nunca pisan un dato que venga en la fila.
   */
  readonly defaults?: FieldDefaults
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

/**
 * Rellena los huecos con los valores por defecto.
 *
 * La regla es la misma para el pais y para los campos escritos a mano: solo se
 * escribe si la fila no traia nada. Un valor por defecto ayuda cuando falta un
 * dato; pisar el que si vino seria perder informacion de entrada (principio 2
 * de la especificacion).
 */
function applyDefaults(fields: NormalizedFields, options: NormalizeOptions): void {
  for (const field of DEFAULTABLE_FIELDS) {
    const value = collapseWhitespace(options.defaults?.[field] ?? '')
    if (value !== '' && fields[field].trim() === '') fields[field] = value
  }

  const country = options.defaultCountry
  if (country && fields.country.trim() === '') fields.country = country.name
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

    applyDefaults(fields, options)

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
  applyDefaults(fields, options)

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
