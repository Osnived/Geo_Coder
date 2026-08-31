import type { Country } from '../models/country'
import { canonicalize } from '../rules/text'

import type { PlaceSuggestion } from './placeProvider'

/**
 * Depurado de las sugerencias que devuelve un proveedor.
 *
 * Funciones puras. El proveedor trae lo que trae; aqui se decide que se le
 * ensena a la persona: fuera lo de otro pais, fuera los duplicados y un tope de
 * cuantas caben en una lista que se lee de un vistazo.
 */

/**
 * Sugerencias que se muestran como maximo.
 *
 * Una lista mas larga no se lee: se recorre con las flechas y ocho ya obligan a
 * desplazarse dentro del desplegable.
 */
export const MAX_SUGGESTIONS = 8

/** Caracteres minimos antes de preguntar al proveedor. */
export const MIN_QUERY_LENGTH = 3

/**
 * True si merece la pena consultar al proveedor.
 *
 * Con menos de tres caracteres cualquier busqueda devuelve ruido y se gasta una
 * peticion por pulsacion contra una API publica de uso razonable.
 */
export function isQueryWorthSending(text: string): boolean {
  return text.trim().length >= MIN_QUERY_LENGTH
}

/**
 * Descarta las sugerencias de otro pais.
 *
 * Solo se descarta cuando **ambos** codigos son conocidos, igual que hace el
 * scoring: un proveedor que no informa el pais no es motivo para tirar un
 * resultado que probablemente si valga.
 */
function matchesCountry(suggestion: PlaceSuggestion, country: Country | null): boolean {
  if (!country?.code) return true
  if (suggestion.countryCode === '') return true
  return suggestion.countryCode === country.code.toUpperCase()
}

/**
 * Clave de igualdad de una sugerencia.
 *
 * Nombre y region, sin acentos ni mayusculas: OpenStreetMap devuelve el mismo
 * municipio varias veces (el limite administrativo, el nucleo urbano, la
 * comuna) y en la lista se veria tres veces "Barrancabermeja". Dos municipios
 * homonimos en departamentos distintos si son dos cosas, y se conservan ambos.
 */
function identityOf(suggestion: PlaceSuggestion): string {
  return `${canonicalize(suggestion.name)}|${canonicalize(suggestion.region)}`
}

export function refineSuggestions(
  suggestions: readonly PlaceSuggestion[],
  options: { readonly country: Country | null; readonly limit?: number },
): PlaceSuggestion[] {
  const limit = options.limit ?? MAX_SUGGESTIONS
  const seen = new Set<string>()
  const result: PlaceSuggestion[] = []

  for (const suggestion of suggestions) {
    if (suggestion.name.trim() === '') continue
    if (!matchesCountry(suggestion, options.country)) continue

    const identity = identityOf(suggestion)
    if (seen.has(identity)) continue
    seen.add(identity)

    result.push(suggestion)
    // Se corta al llegar al tope: el orden del proveedor es su ranking.
    if (result.length >= limit) break
  }

  return result
}

/**
 * Texto secundario de una sugerencia: el departamento, o el pais si es la
 * propia region. Cadena vacia si no hay nada que anadir.
 */
export function describeSuggestion(suggestion: PlaceSuggestion): string {
  if (suggestion.kind === 'region') return suggestion.countryName
  return suggestion.region
}

/**
 * Departamento que corresponde a una sugerencia de ciudad, si se conoce.
 *
 * Se expone como funcion y no se lee el campo a pelo para que quien la use no
 * tenga que acordarse de que en una region el campo viene vacio.
 */
export function regionOf(suggestion: PlaceSuggestion): string {
  return suggestion.kind === 'city' ? suggestion.region : ''
}
