import type { GeocodeQuery } from '../models/geocode'

/**
 * Puerto de geocodificacion (spec seccion 10).
 *
 * El resto de la aplicacion trabaja contra esta interfaz, nunca contra
 * Nominatim, Photon o Google. Las implementaciones viven en `src/providers/`.
 */

/** Componentes de direccion que devuelve el proveedor. '' = no informado. */
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

/** Candidato crudo del proveedor, todavia sin puntuar por la aplicacion. */
export interface ProviderCandidate {
  readonly latitude: number
  readonly longitude: number
  /** Nombre principal segun el proveedor. */
  readonly name: string
  /** Direccion completa formateada por el proveedor. */
  readonly address: string
  readonly components: AddressComponents
  /**
   * Tipo de lugar segun el proveedor ("supermarket", "restaurant", "house"...).
   * Sirve como senal debil de coincidencia de tipo.
   */
  readonly category: string
  /** Posicion en la lista devuelta por el proveedor. 0 es la primera. */
  readonly rank: number
  /** Respuesta cruda, para trazabilidad (spec principio 7). */
  readonly raw: unknown
}

export type ProviderErrorCode =
  'RATE_LIMITED' | 'FORBIDDEN' | 'TIMEOUT' | 'NETWORK' | 'BAD_RESPONSE' | 'ABORTED'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly provider: string
  /** True si reintentar tiene sentido. */
  readonly retryable: boolean

  constructor(provider: string, code: ProviderErrorCode, message: string, retryable = false) {
    super(message)
    this.name = 'ProviderError'
    this.provider = provider
    this.code = code
    this.retryable = retryable
  }
}

export interface SearchOptions {
  readonly signal?: AbortSignal
  /** Maximo de candidatos a pedir. */
  readonly limit?: number
}

export interface GeocoderProvider {
  /** Identificador estable que se guarda en el resultado. */
  readonly name: string
  /** Peticiones por segundo que admite la politica del proveedor. */
  readonly requestsPerSecond: number
  search(query: GeocodeQuery, options?: SearchOptions): Promise<ProviderCandidate[]>
}
