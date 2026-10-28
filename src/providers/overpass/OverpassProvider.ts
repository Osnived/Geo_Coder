import type { AddressComponents } from '@/domain/models/geocode'
import { emptyComponents } from '@/domain/models/geocode'
import { ProviderError } from '@/domain/services/geocoderProvider'
import {
  businessTypeFor,
  parseBrand,
  type DiscoveredPlace,
  type DiscoveryQuery,
  type PlaceDiscoveryProvider,
} from '@/domain/services/placeDiscovery'
import { OVERPASS_POLICY, OVERPASS_QUERY_TIMEOUT_SECONDS } from '@/shared/config/geocoding'

import { buildUrl, fetchJson } from '../http'

/**
 * Descubrimiento de locales sobre Overpass, la API de consultas de OpenStreetMap.
 *
 * La busqueda es por marca exacta, tal como la escribe OSM (distingue mayusculas).
 * Se probo contra el servicio real: buscar tambien por nombre con expresion
 * regular dentro del pais agotaba el tiempo del servidor. Los locales sin la
 * etiqueta `brand` no aparecen.
 *
 * Se piden con `out center` para que los poligonos (edificios) traigan un punto.
 */

const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const PROVIDER = 'overpass'

interface OverpassElement {
  readonly type: string
  readonly id: number
  readonly lat?: number
  readonly lon?: number
  readonly center?: { readonly lat: number; readonly lon: number }
  readonly tags?: Readonly<Record<string, string>>
}

interface OverpassResponse {
  readonly elements?: readonly OverpassElement[]
  /** Overpass avisa de errores de ejecucion dentro de una respuesta 200. */
  readonly remark?: string
}

/**
 * Consulta en el lenguaje de Overpass.
 *
 * La marca se inserta entre comillas, por eso se valida antes con `parseBrand`.
 * Si llega algo fuera de ese alfabeto, no se construye la consulta.
 */
export function buildOverpassQuery(query: DiscoveryQuery): string {
  if (parseBrand(query.brand) !== query.brand) {
    throw new Error('La marca contiene caracteres no permitidos.')
  }

  return [
    `[out:json][timeout:${String(OVERPASS_QUERY_TIMEOUT_SECONDS)}];`,
    `area["ISO3166-1"="${query.country.code}"][admin_level=2]->.country;`,
    `nwr["brand"="${query.brand}"](area.country);`,
    'out center tags;',
  ].join('\n')
}

/** Punto de un elemento: sus coordenadas, o el centro si es un poligono. */
function pointOf(element: OverpassElement): { lat: number; lon: number } | null {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lon: element.lon }
  }
  if (element.center) return { lat: element.center.lat, lon: element.center.lon }
  return null
}

/**
 * Direccion separada a partir de las etiquetas `addr:*`.
 *
 * La ciudad se busca en varias etiquetas porque OSM no es uniforme: segun quien
 * capturo el dato, el municipio puede estar en `addr:city`, `addr:town` o
 * `addr:village`.
 */
function componentsOf(tags: Readonly<Record<string, string>>): AddressComponents {
  return {
    ...emptyComponents(),
    street: tags['addr:street'] ?? '',
    houseNumber: tags['addr:housenumber'] ?? '',
    city:
      tags['addr:city'] ??
      tags['addr:town'] ??
      tags['addr:village'] ??
      tags['addr:municipality'] ??
      '',
    region: tags['addr:state'] ?? '',
    postalCode: tags['addr:postcode'] ?? '',
  }
}

/**
 * Respuesta de Overpass convertida en locales.
 *
 * Descarta los elementos sin posicion y los repetidos: una consulta que busca
 * por marca y por nombre puede devolver el mismo local dos veces.
 */
export function parseOverpassResponse(payload: OverpassResponse): DiscoveredPlace[] {
  if (!Array.isArray(payload.elements)) {
    throw new ProviderError(PROVIDER, 'BAD_RESPONSE', 'Overpass devolvio una respuesta inesperada.')
  }
  if (payload.remark?.includes('runtime error')) {
    throw new ProviderError(
      PROVIDER,
      'BAD_RESPONSE',
      'OpenStreetMap no pudo terminar la consulta. Intenta de nuevo en unos minutos.',
      true,
    )
  }

  const seen = new Set<string>()
  const places: DiscoveredPlace[] = []

  for (const element of payload.elements) {
    const point = pointOf(element)
    if (!point) continue

    const osmId = `${element.type}/${String(element.id)}`
    if (seen.has(osmId)) continue
    seen.add(osmId)

    const tags = element.tags ?? {}
    places.push({
      osmId,
      name: tags.name ?? tags.brand ?? '',
      brand: tags.brand ?? '',
      businessType: businessTypeFor(tags.shop),
      latitude: point.lat,
      longitude: point.lon,
      components: componentsOf(tags),
      enrichedAddress: false,
      tags,
    })
  }

  return places.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function createOverpassProvider(
  options: { endpoint?: string } = {},
): PlaceDiscoveryProvider {
  const endpoint = options.endpoint ?? ENDPOINT

  return {
    name: PROVIDER,

    async discover(query, discoverOptions = {}) {
      const url = buildUrl(endpoint, { data: buildOverpassQuery(query) })

      const payload = await fetchJson<OverpassResponse>(url, {
        provider: PROVIDER,
        timeoutMs: OVERPASS_POLICY.timeoutMs,
        ...(discoverOptions.signal ? { signal: discoverOptions.signal } : {}),
      })

      return parseOverpassResponse(payload)
    },
  }
}
