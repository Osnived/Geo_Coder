import type { AddressComponents, GeocodeResult } from '../models/geocode'
import type { Country } from '../models/country'
import type { NormalizedFields } from '../models/fields'
import { createRecord, type EstablishmentRecord } from '../models/record'

/**
 * Descubrimiento de locales: "dame todas las tiendas de esta marca en este pais".
 *
 * Es un puerto distinto al de geocodificacion a proposito. Geocodificar parte de
 * un nombre y busca sus coordenadas; descubrir parte de una marca y devuelve
 * locales que ya traen coordenadas desde la fuente. Por eso estos registros no
 * pasan por el motor de busqueda: su resultado se construye aqui, sin consultas.
 */

export interface DiscoveryQuery {
  /** Marca o nombre comercial tal como lo escribio el usuario, ya validado. */
  readonly brand: string
  readonly country: Country
}

export interface DiscoveredPlace {
  /** Identificador estable de la fuente, p. ej. "node/123456". Evita duplicados. */
  readonly osmId: string
  /** Nombre del local. Puede incluir la sucursal ("Soriana Hiper Tepeyac"). */
  readonly name: string
  /** Marca segun la fuente. '' si el local no la trae. */
  readonly brand: string
  /** Tipo de establecimiento ya legible, p. ej. "Supermercado". '' si no viene. */
  readonly businessType: string
  readonly latitude: number
  readonly longitude: number
  readonly components: AddressComponents
  /** True si la direccion se completo con geocodificacion inversa. */
  readonly enrichedAddress: boolean
  /** Etiquetas originales de la fuente, tal cual llegaron. */
  readonly tags: Readonly<Record<string, string>>
}

export interface PlaceDiscoveryProvider {
  readonly name: string
  discover(
    query: DiscoveryQuery,
    options?: { readonly signal?: AbortSignal },
  ): Promise<DiscoveredPlace[]>
}

/** Nombre de la fuente tal como se guarda en cada resultado y en la exportacion. */
export const DISCOVERY_PROVIDER = 'openstreetmap'

/** Nota que explica por que el resultado no paso por geocodificacion. */
export const DISCOVERY_NOTE = 'Coordenadas tomadas de OpenStreetMap; no se geocodificaron.'

/** Nota cuando la direccion vino de geocodificacion inversa y no de la fuente. */
export const ENRICHED_NOTE = 'Dirección completada por geocodificación inversa (Nominatim).'

/**
 * Letras, numeros, espacios, apostrofes y guiones. Sin mas caracteres.
 *
 * La marca se inserta dentro de una consulta de Overpass, que tiene su propia
 * sintaxis. Restringir el alfabeto evita que una comilla o un parentesis cambie
 * la consulta, y no deja fuera ninguna marca real del pais.
 */
const BRAND_PATTERN = /^[\p{L}\p{N} '-]{2,60}$/u

/**
 * Marca escrita por el usuario, limpia, o `null` si no es valida.
 *
 * Colapsa espacios repetidos y quita los de los extremos antes de validar.
 */
export function parseBrand(raw: string): string | null {
  const brand = raw.trim().replace(/\s+/g, ' ')
  return BRAND_PATTERN.test(brand) ? brand : null
}

/** Tipos de establecimiento de OSM, traducidos. Lo que no esta aqui se muestra tal cual. */
const BUSINESS_TYPE_BY_SHOP: Readonly<Record<string, string>> = {
  supermarket: 'Supermercado',
  department_store: 'Tienda departamental',
  convenience: 'Tienda de conveniencia',
  wholesale: 'Mayoreo',
  mall: 'Centro comercial',
}

export function businessTypeFor(shop: string | undefined): string {
  if (!shop) return ''
  return BUSINESS_TYPE_BY_SHOP[shop] ?? shop
}

/** "Av. Juarez 120" o "" si no hay calle. */
export function streetLine(components: AddressComponents): string {
  return `${components.street} ${components.houseNumber}`.trim()
}

/** Direccion completa en una linea, sin los componentes vacios. */
export function formatAddress(components: AddressComponents): string {
  return [
    streetLine(components),
    components.city,
    components.region,
    components.postalCode,
    components.country,
  ]
    .filter((part) => part !== '')
    .join(', ')
}

export interface DiscoveryRecordOptions {
  readonly batchId: string
  readonly newId: () => string
  readonly now: () => string
}

/**
 * Convierte locales descubiertos en registros listos para guardar.
 *
 * Cada uno sale ya con estado `FOUND` y su resultado completo. La confianza es
 * 1 porque la fuente da la posicion directamente; lo que la aplicacion no puede
 * confirmar (que el local siga abierto, por ejemplo) se deja a la revision.
 */
export function buildDiscoveryRecords(
  places: readonly DiscoveredPlace[],
  query: DiscoveryQuery,
  options: DiscoveryRecordOptions,
): EstablishmentRecord[] {
  return places.map((place) => {
    const timestamp = options.now()

    const fields: NormalizedFields = {
      client: place.brand || query.brand,
      business_type: place.businessType,
      location_name: place.name,
      address: streetLine(place.components),
      city: place.components.city,
      region: place.components.region,
      postal_code: place.components.postalCode,
      country: query.country.name,
    }

    const result: GeocodeResult = {
      latitude: place.latitude,
      longitude: place.longitude,
      matchedName: place.name,
      matchedAddress: formatAddress({ ...place.components, country: query.country.name }),
      provider: DISCOVERY_PROVIDER,
      confidence: 1,
      queryUsed: `OpenStreetMap: ${query.brand}, ${query.country.name}`,
      manuallyVerified: false,
      components: place.components,
      candidates: [],
      attempts: [],
      notes: place.enrichedAddress ? [DISCOVERY_NOTE, ENRICHED_NOTE] : [DISCOVERY_NOTE],
      resolvedAt: timestamp,
    }

    const record = createRecord({
      id: options.newId(),
      source: 'osm',
      batchId: options.batchId,
      fields,
      original: { 'OSM id': place.osmId, ...place.tags },
      timestamp,
    })

    return { ...record, status: 'FOUND', result }
  })
}
