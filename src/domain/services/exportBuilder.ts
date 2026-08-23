import { NORMALIZED_FIELDS, type NormalizedField } from '../models/fields'
import type { EstablishmentRecord } from '../models/record'

/**
 * Construccion de la hoja de exportacion (spec seccion 17).
 *
 * Reglas:
 * - Las columnas originales del Excel importado se conservan tal cual, en el
 *   orden en que aparecieron. Nunca se elimina informacion de entrada.
 * - Los campos normalizados se exportan ademas de las columnas originales,
 *   porque el usuario puede haberlos corregido y ya no coincidir.
 * - Al final se anaden las columnas de resultado.
 *
 * Es una funcion pura: no sabe nada de ExcelJS ni de archivos.
 */

/** Columnas de resultado, con los nombres que pide la especificacion. */
export const RESULT_COLUMNS = [
  'latitude',
  'longitude',
  'matched_name',
  'matched_address',
  'provider',
  'confidence',
  'status',
  'query_used',
  'manually_verified',
] as const

/** Columnas de trazabilidad del propio sistema. */
export const META_COLUMNS = ['record_id', 'source'] as const

export interface ExportSheet {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly unknown[])[]
}

export interface ExportOptions {
  /** Exportar solo estos registros. Por defecto, todos. */
  readonly onlyIds?: readonly string[]
}

/** Union de las columnas originales, en orden de primera aparicion. */
export function collectOriginalColumns(records: readonly EstablishmentRecord[]): string[] {
  const seen = new Set<string>()
  const columns: string[] = []

  for (const record of records) {
    for (const key of Object.keys(record.original)) {
      if (seen.has(key)) continue
      seen.add(key)
      columns.push(key)
    }
  }

  return columns
}

/**
 * Evita que dos columnas se llamen igual. Si un Excel ya traia una columna
 * "latitude", la nuestra pasa a "latitude_geo" en lugar de pisarla.
 */
function disambiguate(headers: readonly string[], taken: Set<string>): string[] {
  return headers.map((header) => {
    if (!taken.has(header)) {
      taken.add(header)
      return header
    }
    let candidate = `${header}_geo`
    let counter = 2
    while (taken.has(candidate)) {
      candidate = `${header}_geo_${String(counter)}`
      counter += 1
    }
    taken.add(candidate)
    return candidate
  })
}

function resultValues(record: EstablishmentRecord): unknown[] {
  const { result } = record
  return [
    result?.latitude ?? '',
    result?.longitude ?? '',
    result?.matchedName ?? '',
    result?.matchedAddress ?? '',
    result?.provider ?? '',
    // Se exporta en porcentaje entero: mas legible en una hoja de calculo.
    result ? Math.round(result.confidence * 100) : '',
    record.status,
    result?.queryUsed ?? '',
    result ? (result.manuallyVerified ? 'SI' : 'NO') : '',
  ]
}

export function buildExport(
  records: readonly EstablishmentRecord[],
  options: ExportOptions = {},
): ExportSheet {
  const selected = options.onlyIds
    ? records.filter((record) => options.onlyIds?.includes(record.id))
    : records

  const originalColumns = collectOriginalColumns(selected)

  const taken = new Set<string>(originalColumns)
  const normalizedHeaders = disambiguate([...NORMALIZED_FIELDS], taken)
  const resultHeaders = disambiguate([...RESULT_COLUMNS], taken)
  const metaHeaders = disambiguate([...META_COLUMNS], taken)

  const headers = [...originalColumns, ...normalizedHeaders, ...resultHeaders, ...metaHeaders]

  const rows = selected.map((record) => [
    ...originalColumns.map((column) => record.original[column] ?? ''),
    ...NORMALIZED_FIELDS.map((field: NormalizedField) => record.fields[field]),
    ...resultValues(record),
    record.id,
    record.source,
  ])

  return { headers, rows }
}
