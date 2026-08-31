import { batchTypeLabel, describeBatch, formatTimestamp, type ImportBatch } from '../models/batch'
import { FIELD_LABELS, NORMALIZED_FIELDS, type NormalizedField } from '../models/fields'
import type { EstablishmentRecord } from '../models/record'
import { STATUS_LABELS } from '../models/status'

/**
 * Construccion de la hoja de exportacion (spec seccion 17).
 *
 * Reglas:
 * - Las columnas originales del Excel importado se conservan tal cual, en el
 *   orden en que aparecieron. Nunca se elimina informacion de entrada.
 * - Los campos normalizados se exportan ademas de las columnas originales,
 *   porque el usuario puede haberlos corregido y ya no coincidir.
 * - La informacion geografica encontrada va en columnas separadas y con
 *   nombres legibles: quien abre el Excel no tiene por que saber que es
 *   `admin_level_1` ni `formatted_address`.
 * - Al final, la trazabilidad: resultado, grupo e identificadores internos.
 *
 * Es una funcion pura: no sabe nada de ExcelJS ni de archivos.
 */

/**
 * Columnas geograficas, con los nombres que se leen en la hoja.
 *
 * `Coordenadas` es redundante con `Latitud` y `Longitud` a proposito: pegar una
 * sola celda en un buscador de mapas es lo que la gente hace de verdad.
 */
export const GEO_COLUMNS = [
  'Estado/Departamento',
  'Municipio/Ciudad',
  'Código ZIP',
  'Dirección encontrada',
  'Coordenadas',
  'Latitud',
  'Longitud',
] as const

/** Columnas de resultado y de trazabilidad de la busqueda. */
export const RESULT_COLUMNS = [
  'Resultado',
  'Nombre encontrado',
  'Confianza (%)',
  'Proveedor',
  'Consulta usada',
  'Verificado manualmente',
] as const

/** Columnas que identifican el grupo de origen. */
export const GROUP_COLUMNS = ['Grupo', 'Tipo de grupo', 'Fecha del grupo'] as const

/** Columnas internas. Se conservan porque son la unica forma de volver al dato. */
export const META_COLUMNS = ['ID interno', 'Origen', 'Creado', 'Actualizado'] as const

/**
 * Orden de las coordenadas en la columna combinada.
 *
 * Se fija aqui una sola vez: mezclar convenciones entre pantallas y export es
 * la forma mas facil de acabar con puntos en medio del oceano.
 */
export const COORDINATE_ORDER = 'longitude,latitude' as const

/** "-74.801200, 10.987800" — longitud primero, con 6 decimales. */
export function formatCoordinates(latitude: number, longitude: number): string {
  return `${longitude.toFixed(6)}, ${latitude.toFixed(6)}`
}

export interface ExportSheet {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly unknown[])[]
}

/** Bloques de columnas que el usuario puede quitar de la hoja. */
export interface ExportSections {
  /** Columnas tal cual venian del archivo importado. */
  readonly original: boolean
  /** Estado, municipio, ZIP, direccion encontrada y coordenadas. */
  readonly geographic: boolean
  /** Estado de la busqueda, confianza, proveedor y consulta. */
  readonly result: boolean
  /** Nombre, tipo y fecha del grupo de origen. */
  readonly group: boolean
}

export const DEFAULT_SECTIONS: ExportSections = {
  original: true,
  geographic: true,
  result: true,
  group: true,
}

export interface ExportOptions {
  /** Exportar solo estos registros. Por defecto, todos. */
  readonly onlyIds?: readonly string[]
  /** Exportar solo los registros de estos grupos. Vacio o ausente = todos. */
  readonly groupIds?: readonly string[]
  /** Grupos conocidos, para poder escribir su nombre y su fecha. */
  readonly batches?: readonly ImportBatch[]
  readonly sections?: Partial<ExportSections>
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
 * "Latitud", la nuestra pasa a "Latitud (geo)" en lugar de pisarla.
 */
function disambiguate(headers: readonly string[], taken: Set<string>): string[] {
  return headers.map((header) => {
    if (!taken.has(header)) {
      taken.add(header)
      return header
    }
    let candidate = `${header} (geo)`
    let counter = 2
    while (taken.has(candidate)) {
      candidate = `${header} (geo ${String(counter)})`
      counter += 1
    }
    taken.add(candidate)
    return candidate
  })
}

/** Filtra los registros segun grupo y seleccion explicita. */
export function selectForExport(
  records: readonly EstablishmentRecord[],
  options: ExportOptions,
): EstablishmentRecord[] {
  const ids = options.onlyIds ? new Set(options.onlyIds) : null
  const groups = options.groupIds && options.groupIds.length > 0 ? new Set(options.groupIds) : null

  return records.filter((record) => {
    if (ids && !ids.has(record.id)) return false
    if (groups && !groups.has(record.batchId)) return false
    return true
  })
}

function geoValues(record: EstablishmentRecord): unknown[] {
  const { result } = record
  if (!result) return ['', '', '', '', '', '', '']

  const components = result.components
  return [
    components.region,
    components.city,
    components.postalCode,
    result.matchedAddress,
    formatCoordinates(result.latitude, result.longitude),
    result.latitude,
    result.longitude,
  ]
}

function resultValues(record: EstablishmentRecord): unknown[] {
  const { result } = record
  return [
    STATUS_LABELS[record.status],
    result?.matchedName ?? '',
    // En porcentaje entero: mas legible en una hoja de calculo.
    result ? Math.round(result.confidence * 100) : '',
    result?.provider ?? '',
    result?.queryUsed ?? '',
    result ? (result.manuallyVerified ? 'SI' : 'NO') : '',
  ]
}

export function buildExport(
  records: readonly EstablishmentRecord[],
  options: ExportOptions = {},
): ExportSheet {
  const sections: ExportSections = { ...DEFAULT_SECTIONS, ...options.sections }
  const selected = selectForExport(records, options)

  const originalColumns = sections.original ? collectOriginalColumns(selected) : []

  const taken = new Set<string>(originalColumns)
  const normalizedHeaders = disambiguate(
    NORMALIZED_FIELDS.map((field) => FIELD_LABELS[field]),
    taken,
  )
  const geoHeaders = sections.geographic ? disambiguate([...GEO_COLUMNS], taken) : []
  const resultHeaders = sections.result ? disambiguate([...RESULT_COLUMNS], taken) : []
  const groupHeaders = sections.group ? disambiguate([...GROUP_COLUMNS], taken) : []
  const metaHeaders = disambiguate([...META_COLUMNS], taken)

  const headers = [
    ...originalColumns,
    ...normalizedHeaders,
    ...geoHeaders,
    ...resultHeaders,
    ...groupHeaders,
    ...metaHeaders,
  ]

  const batchById = new Map((options.batches ?? []).map((batch) => [batch.id, batch]))

  const rows = selected.map((record) => {
    const batch = batchById.get(record.batchId)
    return [
      ...originalColumns.map((column) => record.original[column] ?? ''),
      ...NORMALIZED_FIELDS.map((field: NormalizedField) => record.fields[field]),
      ...(sections.geographic ? geoValues(record) : []),
      ...(sections.result ? resultValues(record) : []),
      ...(sections.group
        ? [
            batch ? describeBatch(batch) : record.batchId,
            batch ? batchTypeLabel(batch) : '',
            batch ? formatTimestamp(batch.createdAt) : '',
          ]
        : []),
      record.id,
      record.source === 'excel' ? 'Excel' : 'Manual',
      formatTimestamp(record.createdAt),
      formatTimestamp(record.updatedAt),
    ]
  })

  return { headers, rows }
}
