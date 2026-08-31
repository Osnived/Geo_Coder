import { ProviderError } from '@/domain/services/geocoderProvider'
import type {
  PlaceKind,
  PlaceQuery,
  PlaceSearchOptions,
  PlaceSuggestion,
  PlaceSuggestionProvider,
} from '@/domain/services/placeProvider'
import { PHOTON_POLICY } from '@/shared/config/geocoding'

import { buildUrl, fetchJson } from '../http'

/**
 * Sugerencias de ciudades y departamentos sobre Photon.
 *
 * Photon esta hecho para autocompletar —es para lo que Komoot lo construyo— y
 * su parametro `layer` permite pedir solo nucleos de poblacion o solo regiones.
 *
 * Sobre acotar al pais, que es lo que hace util la sugerencia: Photon **no**
 * admite filtrar por pais. Se probaron tres formas contra el servicio real,
 * buscando "barran" y contando cuantos de 10 resultados eran colombianos:
 *
 *   sin acotar .................. 4 de 10
 *   con `bbox` del pais ......... 9 de 10
 *   con el nombre del pais
 *   dentro de la consulta ...... 10 de 10
 *
 * Gana la tercera, y ademas no obliga a mantener a mano una tabla de cajas
 * geograficas de 250 paises que, mal copiada, dejaria ciudades fuera. El nombre
 * del pais ya lo tenemos del catalogo. El filtro definitivo lo hace despues
 * `refineSuggestions` comparando el codigo ISO.
 */

/** Indice de Photon segun lo que se este escribiendo. */
const LAYER_BY_KIND: Record<PlaceKind, string> = {
  city: 'city',
  region: 'state',
}

const ENDPOINT = 'https://photon.komoot.io/api/'

/**
 * Se piden mas de las que se ensenan.
 *
 * Entre lo que devuelve Photon y lo que se muestra hay dos filtros —pais y
 * duplicados— y OpenStreetMap repite el mismo municipio varias veces. Pedir
 * justas dejaria la lista a medias.
 */
const DEFAULT_LIMIT = 15

interface PhotonProperties {
  name?: string
  state?: string
  county?: string
  country?: string
  countrycode?: string
  type?: string
}

interface PhotonFeature {
  properties?: PhotonProperties
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

function toSuggestion(feature: PhotonFeature, kind: PlaceKind): PlaceSuggestion | null {
  const properties = feature.properties ?? {}
  const name = (properties.name ?? '').trim()
  if (name === '') return null

  return {
    name,
    kind,
    // Una region no esta dentro de otra region: el campo queda vacio.
    // `county` es el respaldo porque en algunos paises OSM cuelga el municipio
    // del condado y deja `state` sin informar.
    region: kind === 'region' ? '' : (properties.state ?? properties.county ?? '').trim(),
    countryCode: (properties.countrycode ?? '').toUpperCase(),
    countryName: (properties.country ?? '').trim(),
  }
}

export function createPhotonPlacesProvider(
  options: { endpoint?: string } = {},
): PlaceSuggestionProvider {
  const endpoint = options.endpoint ?? ENDPOINT

  return {
    name: 'photon-places',

    async suggest(query: PlaceQuery, searchOptions: PlaceSearchOptions = {}) {
      const text = query.text.trim()
      if (text === '') return []

      // El nombre del pais viaja en el texto porque Photon no sabe filtrar.
      const queryText = query.country ? `${text} ${query.country.name}` : text

      const url = buildUrl(endpoint, {
        q: queryText,
        limit: String(searchOptions.limit ?? DEFAULT_LIMIT),
        layer: LAYER_BY_KIND[query.kind],
        // Sin `lang`: Photon solo acepta default, de, en y fr, y pedir `es`
        // devuelve un 400. Sin el responde con los nombres locales.
      })

      const payload = await fetchJson<PhotonResponse>(url, {
        provider: 'photon-places',
        timeoutMs: PHOTON_POLICY.timeoutMs,
        ...(searchOptions.signal ? { signal: searchOptions.signal } : {}),
      })

      const features = payload.features
      if (!Array.isArray(features)) {
        throw new ProviderError(
          'photon-places',
          'BAD_RESPONSE',
          'Photon devolvio una respuesta inesperada.',
        )
      }

      return features
        .map((feature) => toSuggestion(feature, query.kind))
        .filter((suggestion): suggestion is PlaceSuggestion => suggestion !== null)
    },
  }
}
