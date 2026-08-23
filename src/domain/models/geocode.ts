import type { Country } from './country'
import type { NormalizedField } from './fields'

/** Un candidato devuelto por un proveedor, antes de decidir si es correcto. */
export interface GeocodeCandidate {
  readonly latitude: number
  readonly longitude: number
  readonly matchedName: string
  readonly matchedAddress: string
  readonly provider: string
  /** 0..1 — score calculado por la aplicacion, no por el proveedor. */
  readonly confidence: number
  /**
   * Aporte de cada senal al score, para poder explicar por que se acepto o se
   * rechazo un candidato (spec principio 7).
   */
  readonly signals: Readonly<Record<string, number>>
  /** Payload crudo del proveedor, para trazabilidad. */
  readonly raw?: unknown
}

/** Registro de un intento de busqueda, se conserve o no su resultado. */
export interface GeocodeAttempt {
  readonly provider: string
  readonly query: GeocodeQuery
  readonly candidateCount: number
  readonly bestConfidence: number
  readonly error: { readonly code: string; readonly message: string } | null
}

/** Resultado aceptado para un registro. Separado conceptualmente de la entrada. */
export interface GeocodeResult {
  readonly latitude: number
  readonly longitude: number
  readonly matchedName: string
  readonly matchedAddress: string
  readonly provider: string
  readonly confidence: number
  readonly queryUsed: string
  readonly manuallyVerified: boolean
  /** Alternativas que devolvio el proveedor, para la pantalla de revision. */
  readonly candidates: readonly GeocodeCandidate[]
  /** Todo lo que se intento hasta llegar aqui (spec principio 7). */
  readonly attempts: readonly GeocodeAttempt[]
  /** Resultado anterior si el usuario corrigio manualmente (spec seccion 15). */
  readonly replaced?: GeocodeResult
  readonly resolvedAt: string
}

/** Consulta construida por el QueryBuilder (spec seccion 6). */
export interface GeocodeQuery {
  /** Texto libre que se envia al proveedor. */
  readonly text: string
  /** Restriccion geografica. Se traduce al parametro propio de cada proveedor. */
  readonly country: Country | null
  /** Campos que se incluyeron, para poder explicar que se busco. */
  readonly usedFields: readonly NormalizedField[]
  /** Orden de intento: 0 es la estrategia principal. */
  readonly strategy: number
  /** Identificador de la plantilla usada, para trazabilidad. */
  readonly templateId: string
}
