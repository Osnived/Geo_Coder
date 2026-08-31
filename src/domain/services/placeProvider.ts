import type { Country } from '../models/country'

/**
 * Puerto de sugerencias de lugares.
 *
 * Separado del puerto de geocodificacion a proposito: geocodificar es "dame las
 * coordenadas de este establecimiento" y sugerir es "voy escribiendo, dime que
 * ciudades empiezan asi". Tienen ritmos, formas y errores distintos, y meterlos
 * en la misma interfaz obligaria a que cada implementacion soportara ambos.
 */

/** Que se esta escribiendo. Decide el indice que se consulta. */
export type PlaceKind = 'city' | 'region'

export interface PlaceQuery {
  /** Lo que el usuario lleva escrito. */
  readonly text: string
  readonly kind: PlaceKind
  /**
   * Pais al que acotar. Es lo que hace util la sugerencia: sin el, escribir
   * "barran" devuelve resultados de Francia, Portugal y Peru.
   */
  readonly country: Country | null
}

export interface PlaceSuggestion {
  readonly name: string
  readonly kind: PlaceKind
  /**
   * Departamento, estado o provincia a la que pertenece. '' si el proveedor no
   * lo informa (siempre vacio cuando la propia sugerencia es una region).
   *
   * Es el motivo por el que sugerir ciudades vale la pena: al elegir una, el
   * departamento se rellena solo en lugar de tener que buscarlo aparte.
   */
  readonly region: string
  /** ISO 3166-1 alpha-2 en mayusculas, o '' si no viene. */
  readonly countryCode: string
  readonly countryName: string
}

export interface PlaceSearchOptions {
  readonly signal?: AbortSignal
  readonly limit?: number
}

export interface PlaceSuggestionProvider {
  readonly name: string
  suggest(query: PlaceQuery, options?: PlaceSearchOptions): Promise<PlaceSuggestion[]>
}
