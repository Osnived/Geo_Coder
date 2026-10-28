import type { AddressComponents } from '../models/geocode'

/**
 * Puerto de geocodificacion inversa: "¿que direccion hay en estas coordenadas?".
 *
 * Sirve para completar locales que la fuente da con posicion pero sin direccion.
 * Solo se usa para rellenar huecos; nunca reemplaza lo que ya trae la fuente.
 */

export interface ReversePoint {
  readonly latitude: number
  readonly longitude: number
}

export interface ReverseGeocoder {
  readonly name: string
  /** Tiempo minimo entre dos peticiones, en milisegundos. */
  readonly minIntervalMs: number
  /** Componentes de la direccion, o `null` si el servicio no conoce el punto. */
  reverse(
    point: ReversePoint,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AddressComponents | null>
}

/** True si falta alguno de los componentes que la exportacion muestra. */
export function hasMissingAddress(components: AddressComponents): boolean {
  return (
    components.street === '' ||
    components.city === '' ||
    components.region === '' ||
    components.postalCode === ''
  )
}

/**
 * Rellena solo los componentes vacios de `current` con los de `found`.
 *
 * Lo que la fuente ya dio se conserva: si OSM trae una ciudad, no se cambia por
 * la que sugiere el servicio de direcciones.
 */
export function completeComponents(
  current: AddressComponents,
  found: AddressComponents,
): AddressComponents {
  const pick = (own: string, other: string) => (own === '' ? other : own)

  return {
    street: pick(current.street, found.street),
    houseNumber: pick(current.houseNumber, found.houseNumber),
    city: pick(current.city, found.city),
    region: pick(current.region, found.region),
    postalCode: pick(current.postalCode, found.postalCode),
    country: pick(current.country, found.country),
    countryCode: pick(current.countryCode, found.countryCode),
  }
}
