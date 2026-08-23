import type { GeocoderProvider } from '@/domain/services/geocoderProvider'
import { withRateLimit } from '@/infrastructure/geocoders/withRateLimit'
import { createNominatimProvider } from '@/providers/nominatim/NominatimProvider'

/**
 * Cadena de proveedores de la aplicacion, en orden de preferencia.
 *
 * Cada uno va envuelto en su propio limitador de peticiones, creado una sola
 * vez: si se recrease en cada llamada el limite no se respetaria.
 */

let chain: readonly GeocoderProvider[] | null = null

export function getProviders(): readonly GeocoderProvider[] {
  chain ??= [withRateLimit(createNominatimProvider())]
  return chain
}

/** Solo para tests: sustituye la cadena de proveedores. */
export function setProviders(providers: readonly GeocoderProvider[] | null): void {
  chain = providers
}
