import type { PlaceSuggestionProvider } from '@/domain/services/placeProvider'
import { createPhotonPlacesProvider } from '@/providers/photon/PhotonPlacesProvider'

/**
 * Proveedor de sugerencias activo.
 *
 * Mismo patron que la cadena de geocodificacion: se crea una sola vez y se
 * puede sustituir en los tests sin tocar la interfaz.
 */

let provider: PlaceSuggestionProvider | null = null

export function getPlacesProvider(): PlaceSuggestionProvider {
  provider ??= createPhotonPlacesProvider()
  return provider
}

/** Solo para tests. */
export function setPlacesProvider(next: PlaceSuggestionProvider | null): void {
  provider = next
}
