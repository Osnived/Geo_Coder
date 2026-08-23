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
import { NOMINATIM_POLICY } from '@/shared/config/geocoding'

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

let chain: readonly GeocoderProvider[] | null = null
let cache: GeocodeCache | null = null

const stats: CacheStats = { hits: 0, misses: 0 }

export function getCache(): GeocodeCache {
  cache ??= isIndexedDbAvailable() ? createIndexedDbCache() : createMemoryCache()
  return cache
}

export function getCacheStats(): Readonly<CacheStats> {
  return stats
}

function build(): readonly GeocoderProvider[] {
  const nominatim = withCache(
    withRetry(withRateLimit(createNominatimProvider()), {
      maxRetries: NOMINATIM_POLICY.maxRetries,
      baseDelayMs: 1000,
    }),
    getCache(),
    stats,
  )

  return [nominatim]
}

export function getProviders(): readonly GeocoderProvider[] {
  chain ??= build()
  return chain
}

/** Solo para tests: sustituye la cadena de proveedores y la cache. */
export function setProviders(providers: readonly GeocoderProvider[] | null): void {
  chain = providers
}

export function setCache(next: GeocodeCache | null): void {
  cache = next
  chain = null
}
