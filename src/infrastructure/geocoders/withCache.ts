import type { GeocoderProvider } from '@/domain/services/geocoderProvider'

import { cacheKey, type GeocodeCache } from './cache'

/**
 * Envuelve un proveedor para que no repita consultas ya resueltas.
 *
 * Va por fuera del limitador de peticiones: un acierto de cache no consume
 * cupo ni espera al siguiente hueco.
 */

const DEFAULT_LIMIT = 5

export interface CacheStats {
  hits: number
  misses: number
}

export function withCache(
  provider: GeocoderProvider,
  cache: GeocodeCache,
  stats: CacheStats = { hits: 0, misses: 0 },
): GeocoderProvider & { readonly stats: CacheStats } {
  return {
    name: provider.name,
    requestsPerSecond: provider.requestsPerSecond,
    stats,

    async search(query, options) {
      const limit = options?.limit ?? DEFAULT_LIMIT
      const key = cacheKey(provider.name, query, limit)

      const cached = await cache.get(key)
      if (cached) {
        stats.hits += 1
        return cached
      }

      stats.misses += 1
      const candidates = await provider.search(query, options)
      // Tambien se cachea la ausencia de resultados: preguntarlo otra vez
      // devolveria lo mismo y gastaria cupo igual.
      await cache.set(key, provider.name, candidates)
      return candidates
    },
  }
}
