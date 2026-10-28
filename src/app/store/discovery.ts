import type { PlaceDiscoveryProvider } from '@/domain/services/placeDiscovery'
import type { ReverseGeocoder } from '@/domain/services/reverseGeocoder'
import { createNominatimReverseGeocoder } from '@/providers/nominatim/NominatimReverseProvider'
import { createOverpassProvider } from '@/providers/overpass/OverpassProvider'

/**
 * Proveedores de descubrimiento de locales activos.
 *
 * Sin cache ni limitador propios: cada busqueda la pide el usuario a mano. El
 * ritmo de la geocodificacion inversa lo marca `minIntervalMs` del proveedor.
 */

let provider: PlaceDiscoveryProvider | null = null
let reverse: ReverseGeocoder | null = null

export function getDiscoveryProvider(): PlaceDiscoveryProvider {
  provider ??= createOverpassProvider()
  return provider
}

export function getReverseGeocoder(): ReverseGeocoder {
  reverse ??= createNominatimReverseGeocoder()
  return reverse
}

/** Solo para tests: sustituye los proveedores de descubrimiento. */
export function setDiscoveryProvider(next: PlaceDiscoveryProvider | null): void {
  provider = next
}

export function setReverseGeocoder(next: ReverseGeocoder | null): void {
  reverse = next
}
