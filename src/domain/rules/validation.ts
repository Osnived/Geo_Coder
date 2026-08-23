import type { NormalizedField } from '../models/fields'
import type { EstablishmentRecord } from '../models/record'

/**
 * Validaciones del modelo normalizado (spec seccion 23 > Validaciones).
 *
 * Ninguna validacion modifica ni descarta datos: solo describe problemas.
 * La decision de que hacer con un registro invalido es del usuario
 * (spec principio 2).
 */

export type IssueLevel = 'error' | 'warning'

export type IssueCode =
  'EMPTY_RECORD' | 'MISSING_COUNTRY' | 'NOT_GEOCODABLE' | 'NO_LOCALITY' | 'ONLY_CLIENT'

export interface ValidationIssue {
  readonly code: IssueCode
  readonly level: IssueLevel
  readonly field: NormalizedField | null
  readonly message: string
}

export interface ValidationOptions {
  /** True cuando el pais es obligatorio para restringir las busquedas. */
  readonly requireCountry: boolean
  /**
   * True si la sesion tiene un pais global definido. Ese pais restringe la
   * busqueda aunque el registro no lo traiga, asi que en ese caso no falta
   * nada (spec seccion 8).
   */
  readonly hasSessionCountry?: boolean
}

const DEFAULT_OPTIONS: ValidationOptions = { requireCountry: true }

function has(record: EstablishmentRecord, field: NormalizedField): boolean {
  return record.fields[field].trim() !== ''
}

export function validateRecord(
  record: EstablishmentRecord,
  options: ValidationOptions = DEFAULT_OPTIONS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const anyValue = (Object.keys(record.fields) as NormalizedField[]).some((field) =>
    has(record, field),
  )

  if (!anyValue) {
    return [
      {
        code: 'EMPTY_RECORD',
        level: 'error',
        field: null,
        message: 'El registro no tiene ningun dato.',
      },
    ]
  }

  if (options.requireCountry && !has(record, 'country') && options.hasSessionCountry !== true) {
    issues.push({
      code: 'MISSING_COUNTRY',
      level: 'error',
      field: 'country',
      message: 'Falta el pais, necesario para restringir la busqueda.',
    })
  }

  // Sin nombre, direccion ni cliente no hay nada que buscar geograficamente.
  if (!has(record, 'location_name') && !has(record, 'address') && !has(record, 'client')) {
    issues.push({
      code: 'NOT_GEOCODABLE',
      level: 'error',
      field: null,
      message:
        'Se necesita al menos cliente, nombre del local o direccion para poder construir una busqueda.',
    })
  } else if (
    has(record, 'client') &&
    !has(record, 'location_name') &&
    !has(record, 'address') &&
    !has(record, 'city')
  ) {
    // Solo la cadena: "Olimpica, Colombia" devolveria cientos de sucursales.
    issues.push({
      code: 'ONLY_CLIENT',
      level: 'warning',
      field: 'client',
      message:
        'Solo hay cliente/cadena. La busqueda sera muy ambigua sin nombre del local, direccion o ciudad.',
    })
  }

  if (!has(record, 'city') && !has(record, 'region') && !has(record, 'postal_code')) {
    issues.push({
      code: 'NO_LOCALITY',
      level: 'warning',
      field: 'city',
      message:
        'Sin ciudad, region ni codigo postal el resultado puede ser ambiguo y requerir revision.',
    })
  }

  return issues
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error')
}

export interface ValidationSummary {
  readonly total: number
  readonly withErrors: number
  readonly withWarnings: number
  readonly byCode: Readonly<Partial<Record<IssueCode, number>>>
}

export function summarizeValidation(
  records: readonly EstablishmentRecord[],
  options: ValidationOptions = DEFAULT_OPTIONS,
): ValidationSummary {
  const byCode: Partial<Record<IssueCode, number>> = {}
  let withErrors = 0
  let withWarnings = 0

  for (const record of records) {
    const issues = validateRecord(record, options)
    if (issues.some((issue) => issue.level === 'error')) withErrors += 1
    if (issues.some((issue) => issue.level === 'warning')) withWarnings += 1
    for (const issue of issues) {
      byCode[issue.code] = (byCode[issue.code] ?? 0) + 1
    }
  }

  return { total: records.length, withErrors, withWarnings, byCode }
}
