import type { AddressComponents } from '@/domain/models/geocode'
import type { ReverseGeocoder, ReversePoint } from '@/domain/services/reverseGeocoder'
import { NOMINATIM_POLICY } from '@/shared/config/geocoding'

import { buildUrl, fetchJson } from '../http'
import { toComponents, type NominatimAddress } from './NominatimProvider'

/**
 * Geocodificacion inversa sobre Nominatim: de coordenadas a direccion.
 *
 * Misma politica que la busqueda directa: una peticion por segundo, y la
 * identificacion de la aplicacion viaja en `Referer`.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'

interface NominatimReverseResponse {
  readonly address?: NominatimAddress
  /** Nominatim responde 200 con `error` cuando no conoce el punto. */
  readonly error?: string
}

export function createNominatimReverseGeocoder(
  options: { endpoint?: string; language?: string } = {},
): ReverseGeocoder {
  const endpoint = options.endpoint ?? ENDPOINT

  return {
    name: 'nominatim-reverse',
    minIntervalMs: Math.ceil(1000 / NOMINATIM_POLICY.requestsPerSecond),

    async reverse(point: ReversePoint, reverseOptions = {}): Promise<AddressComponents | null> {
      const url = buildUrl(endpoint, {
        lat: String(point.latitude),
        lon: String(point.longitude),
        format: 'jsonv2',
        addressdetails: '1',
        // Zoom 18: nivel de calle y numero, no solo de colonia.
        zoom: '18',
        'accept-language': options.language ?? 'es',
      })

      const payload = await fetchJson<NominatimReverseResponse>(url, {
        provider: 'nominatim-reverse',
        timeoutMs: NOMINATIM_POLICY.timeoutMs,
        ...(reverseOptions.signal ? { signal: reverseOptions.signal } : {}),
      })

      if (!payload.address) return null
      return toComponents(payload.address)
    },
  }
}
