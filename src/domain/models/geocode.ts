import type { Country } from './country'
import type { NormalizedField } from './fields'

/**
 * Componentes geograficos de una direccion, ya separados.
 *
 * Vive en el modelo y no en el puerto del proveedor porque el resultado los
 * conserva: la exportacion necesita el estado, el municipio y el codigo postal
 * en columnas propias, no dentro de una cadena formateada.
 *
 * '' = el proveedor no informo ese componente.
 */
export interface AddressComponents {
  readonly street: string
  readonly houseNumber: string
  readonly city: string
  readonly region: string
  readonly postalCode: string
  readonly country: string
  /** ISO 3166-1 alpha-2 en mayusculas, o '' si el proveedor no lo da. */
  readonly countryCode: string
}

export function emptyComponents(): AddressComponents {
  return {
    street: '',
    houseNumber: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
    countryCode: '',
  }
}

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
  /** Componentes geograficos separados, tal como los dio el proveedor. */
  readonly components?: AddressComponents
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
  /**
   * Componentes geograficos del lugar encontrado. Se guardan aqui y no se
   * recalculan desde `matchedAddress`: partir una cadena formateada es
   * adivinar, y el proveedor ya los dio separados.
   */
  readonly components: AddressComponents
  /** Alternativas que devolvio el proveedor, para la pantalla de revision. */
  readonly candidates: readonly GeocodeCandidate[]
  /** Todo lo que se intento hasta llegar aqui (spec principio 7). */
  readonly attempts: readonly GeocodeAttempt[]
  /**
   * Motivos por los que la confianza se limito, si se limito. Explican por que
   * un resultado aparentemente perfecto pide revision.
   */
  readonly notes: readonly string[]
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
