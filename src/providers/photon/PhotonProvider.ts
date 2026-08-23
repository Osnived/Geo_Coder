import type { GeocodeQuery } from '@/domain/models/geocode'
import {
  emptyComponents,
  type AddressComponents,
  type GeocoderProvider,
  type ProviderCandidate,
  type SearchOptions,
} from '@/domain/services/geocoderProvider'
import { PHOTON_POLICY } from '@/shared/config/geocoding'

import { buildUrl, fetchJson } from '../http'

/**
 * Proveedor secundario: Photon, tambien sobre datos de OpenStreetMap
 * (spec seccion 9.2).
 *
 * Complementa a Nominatim porque su indice esta orientado a busqueda por
 * nombre y suele encontrar POIs que Nominatim no resuelve.
 *
 * Dos limitaciones de la API publica, comprobadas contra el servicio real:
 * - No admite filtrar por pais. El pais viaja en el texto de la consulta y el
 *   filtrado real lo hace despues el scoring, que descarta los candidatos de
 *   otro pais.
 * - Solo acepta `lang` con los valores `default`, `de`, `en` y `fr`; pedir
 *   `es` devuelve un 400. Por eso no se envia el parametro: sin el, Photon
 *   responde con los nombres locales, que es lo que interesa aqui.
 */

const ENDPOINT = 'https://photon.komoot.io/api/'
const DEFAULT_LIMIT = 5

interface PhotonProperties {
  name?: string
  street?: string
  housenumber?: string
  postcode?: string
  city?: string
  district?: string
  county?: string
  state?: string
  country?: string
  countrycode?: string
  osm_key?: string
  osm_value?: string
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown }
  properties?: PhotonProperties
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

function toComponents(properties: PhotonProperties): AddressComponents {
  return {
    ...emptyComponents(),
    street: properties.street ?? '',
    houseNumber: properties.housenumber ?? '',
    city: properties.city ?? properties.district ?? properties.county ?? '',
    region: properties.state ?? '',
    postalCode: properties.postcode ?? '',
    country: properties.country ?? '',
    countryCode: (properties.countrycode ?? '').toUpperCase(),
  }
}

/** Photon no devuelve una direccion formateada: se compone con sus partes. */
function formatAddress(properties: PhotonProperties): string {
  const street = [properties.street, properties.housenumber].filter(Boolean).join(' ')
  return [
    properties.name,
    street,
    properties.postcode,
    properties.city ?? properties.district,
    properties.state,
    properties.country,
  ]
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
}

function toCandidate(feature: PhotonFeature, rank: number): ProviderCandidate | null {
  const coordinates = feature.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null

  // GeoJSON usa [longitud, latitud], al reves de lo habitual.
  const longitude = Number(coordinates[0])
  const latitude = Number(coordinates[1])
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const properties = feature.properties ?? {}

  return {
    latitude,
    longitude,
    name: properties.name ?? '',
    address: formatAddress(properties),
    components: toComponents(properties),
    category: properties.osm_value ?? properties.osm_key ?? '',
    rank,
    raw: feature,
  }
}

/** Idiomas que acepta la API publica de Photon. */
export type PhotonLanguage = 'default' | 'de' | 'en' | 'fr'

export function createPhotonProvider(
  options: { endpoint?: string; language?: PhotonLanguage } = {},
): GeocoderProvider {
  const endpoint = options.endpoint ?? ENDPOINT

  return {
    name: 'photon',
    requestsPerSecond: PHOTON_POLICY.requestsPerSecond,

    async search(query: GeocodeQuery, searchOptions: SearchOptions = {}) {
      const url = buildUrl(endpoint, {
        q: query.text,
        limit: String(searchOptions.limit ?? DEFAULT_LIMIT),
        // Sin `lang`, Photon devuelve el nombre local de cada lugar.
        lang: options.language,
      })

      const payload = await fetchJson<PhotonResponse>(url, {
        provider: 'photon',
        timeoutMs: PHOTON_POLICY.timeoutMs,
        signal: searchOptions.signal,
      })

      const features = payload.features
      if (!Array.isArray(features)) return []

      return features
        .map((feature, index) => toCandidate(feature, index))
        .filter((candidate): candidate is ProviderCandidate => candidate !== null)
    },
  }
}
