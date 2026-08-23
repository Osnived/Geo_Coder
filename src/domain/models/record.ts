import { emptyFields, type NormalizedFields } from './fields'
import type { GeocodeResult } from './geocode'
import type { RecordStatus } from './status'

export type RecordSource = 'excel' | 'manual'

/** De donde vino un registro importado, para trazabilidad. */
export interface ExcelOrigin {
  readonly fileName: string
  readonly sheetName: string
  /** Numero de fila en la hoja original (1-based, tal como lo ve el usuario). */
  readonly rowNumber: number
}

/**
 * Registro normalizado. Excel y entrada manual producen esta misma forma
 * (spec seccion 4.2).
 *
 * `original` conserva la fila cruda importada y nunca se modifica
 * (spec principio 2).
 */
export interface EstablishmentRecord {
  readonly id: string
  readonly source: RecordSource
  readonly origin: ExcelOrigin | null
  readonly fields: NormalizedFields
  readonly original: Readonly<Record<string, unknown>>
  readonly status: RecordStatus
  readonly result: GeocodeResult | null
  /**
   * Resultados que una persona rechazo explicitamente. Se conservan para no
   * volver a proponerlos y para poder explicar la decision.
   */
  readonly rejected?: readonly GeocodeResult[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateRecordInput {
  readonly id: string
  readonly source: RecordSource
  readonly fields: Partial<NormalizedFields>
  readonly original?: Readonly<Record<string, unknown>>
  readonly origin?: ExcelOrigin | null
  readonly timestamp: string
}

export function createRecord(input: CreateRecordInput): EstablishmentRecord {
  return {
    id: input.id,
    source: input.source,
    origin: input.origin ?? null,
    fields: { ...emptyFields(), ...input.fields },
    original: input.original ?? {},
    status: 'PENDING',
    result: null,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  }
}

/** True si el registro no tiene ningun campo con contenido. */
export function isEmptyRecord(record: EstablishmentRecord): boolean {
  return Object.values(record.fields).every((value) => value.trim() === '')
}
