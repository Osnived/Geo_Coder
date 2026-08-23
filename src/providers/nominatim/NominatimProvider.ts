import type { GeocodeQuery } from '@/domain/models/geocode'
import {
  emptyComponents,
  type AddressComponents,
  type GeocoderProvider,
  type ProviderCandidate,
  type SearchOptions,
} from '@/domain/services/geocoderProvider'
import { NOMINATIM_POLICY } from '@/shared/config/geocoding'

import { buildUrl, fetchJson } from '../http'

/**
 * Proveedor principal: Nominatim sobre datos de OpenStreetMap (spec seccion 9.1).
 *
 * Politica de uso que este cliente respeta:
 * - Como maximo 1 peticion por segundo (la impone la cola, ver MVP 5).
 * - Nunca peticiones en paralelo contra este proveedor.
 * - Resultados cacheados para no repetir consultas.
 *
 * La identificacion de la aplicacion viaja en `Referer`, que el navegador
 * envia automaticamente: `User-Agent` no se puede fijar desde JavaScript.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const DEFAULT_LIMIT = 5

interface NominatimAddress {
  road?: string
  house_number?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  county?: string
  state?: string
  region?: string
  postcode?: string
  country?: string
  country_code?: string
}

interface NominatimPlace {
  lat?: string
  lon?: string
  name?: string
  display_name?: string
  category?: string
  type?: string
  class?: string
  address?: NominatimAddress
}

function toComponents(address: NominatimAddress | undefined): AddressComponents {
  if (!address) return emptyComponents()

  return {
    street: address.road ?? '',
    houseNumber: address.house_number ?? '',
    // Nominatim reparte la localidad entre varias claves segun el tamano.
    city: address.city ?? address.town ?? address.village ?? address.municipality ?? '',
    region: address.state ?? address.region ?? address.county ?? '',
    postalCode: address.postcode ?? '',
    country: address.country ?? '',
    countryCode: (address.country_code ?? '').toUpperCase(),
  }
}

function toCandidate(place: NominatimPlace, rank: number): ProviderCandidate | null {
  const latitude = Number(place.lat)
  const longitude = Number(place.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const displayName = place.display_name ?? ''
  // `name` viene vacio en resultados puramente de direccion: se cae al primer
  // segmento del display_name, que es la parte mas especifica.
  const name = place.name && place.name !== '' ? place.name : (displayName.split(',')[0] ?? '')

  return {
    latitude,
    longitude,
    name,
    address: displayName,
    components: toComponents(place.address),
    category: place.type ?? place.category ?? place.class ?? '',
    rank,
    raw: place,
  }
}

export function createNominatimProvider(
  options: { endpoint?: string; language?: string } = {},
): GeocoderProvider {
  const endpoint = options.endpoint ?? ENDPOINT

  return {
    name: 'nominatim',
    requestsPerSecond: NOMINATIM_POLICY.requestsPerSecond,

    async search(query: GeocodeQuery, searchOptions: SearchOptions = {}) {
      const url = buildUrl(endpoint, {
        q: query.text,
        format: 'jsonv2',
        addressdetails: '1',
        limit: String(searchOptions.limit ?? DEFAULT_LIMIT),
        // El filtro por pais solo se aplica si conocemos el codigo ISO.
        countrycodes: query.country?.code ? query.country.code.toLowerCase() : undefined,
        'accept-language': options.language ?? 'es',
      })

      const payload = await fetchJson<NominatimPlace[]>(url, {
        provider: 'nominatim',
        timeoutMs: NOMINATIM_POLICY.timeoutMs,
        signal: searchOptions.signal,
      })

      if (!Array.isArray(payload)) return []

      return payload
        .map((place, index) => toCandidate(place, index))
        .filter((candidate): candidate is ProviderCandidate => candidate !== null)
    },
  }
}
