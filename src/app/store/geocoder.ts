import type { GeocoderProvider } from '@/domain/services/geocoderProvider'
import {
  createIndexedDbCache,
  createMemoryCache,
  type GeocodeCache,
} from '@/infrastructure/geocoders/cache'
import { withCache, type CacheStats } from '@/infrastructure/geocoders/withCache'
import { withRateLimit } from '@/infrastructure/geocoders/withRateLimit'
import { withRetry } from '@/infrastructure/geocoders/withRetry'
import { isIndexedDbAvailable } from '@/infrastructure/storage'
import { createNominatimProvider } from '@/providers/nominatim/NominatimProvider'
import { createPhotonProvider } from '@/providers/photon/PhotonProvider'
import { NOMINATIM_POLICY, PHOTON_POLICY } from '@/shared/config/geocoding'

/**
 * Cadena de proveedores de la aplicacion.
 *
 * El orden de los envoltorios importa:
 *
 *   cache -> reintentos -> limitador -> proveedor
 *
 * La cache va fuera para que un acierto no espere turno ni consuma cupo. Los
 * reintentos van dentro de la cache pero fuera del limitador, de modo que cada
 * reintento vuelve a respetar el ritmo pactado.
 */

let primary: GeocoderProvider | null = null
let fallback: GeocoderProvider | null = null
let cache: GeocodeCache | null = null

const stats: CacheStats = { hits: 0, misses: 0 }

export function getCache(): GeocodeCache {
  cache ??= isIndexedDbAvailable() ? createIndexedDbCache() : createMemoryCache()
  return cache
}

export function getCacheStats(): Readonly<CacheStats> {
  return stats
}

function decorate(
  provider: GeocoderProvider,
  maxRetries: number,
  baseDelayMs: number,
): GeocoderProvider {
  return withCache(
    withRetry(withRateLimit(provider), { maxRetries, baseDelayMs }),
    getCache(),
    stats,
  )
}

/**
 * Proveedores a usar, en orden. Photon solo entra si el usuario activa el
 * respaldo: cada proveedor extra multiplica las peticiones de un lote.
 */
export function getProviders(includeFallback = false): readonly GeocoderProvider[] {
  primary ??= decorate(createNominatimProvider(), NOMINATIM_POLICY.maxRetries, 1000)
  if (!includeFallback) return [primary]

  fallback ??= decorate(createPhotonProvider(), PHOTON_POLICY.maxRetries, 1000)
  return [primary, fallback]
}

/** Solo para tests: sustituye la cadena de proveedores y la cache. */
export function setProviders(providers: readonly GeocoderProvider[] | null): void {
  primary = providers?.[0] ?? null
  fallback = providers?.[1] ?? null
}

export function setCache(next: GeocodeCache | null): void {
  cache = next
  primary = null
  fallback = null
}
