import type { GeocoderProvider } from '@/domain/services/geocoderProvider'

import { createRateLimiter, type RateLimiter } from './rateLimiter'

/**
 * Envuelve un proveedor para que respete su propio limite de peticiones.
 *
 * Cada proveedor tiene su limitador: el ritmo de Nominatim no debe frenar a
 * Photon ni al reves.
 */
export function withRateLimit(
  provider: GeocoderProvider,
  limiter: RateLimiter = createRateLimiter({ requestsPerSecond: provider.requestsPerSecond }),
): GeocoderProvider {
  return {
    name: provider.name,
    requestsPerSecond: provider.requestsPerSecond,
    search: (query, options) => limiter.schedule(() => provider.search(query, options)),
  }
}
