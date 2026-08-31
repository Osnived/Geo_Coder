import { useEffect, useRef, useState } from 'react'

import { getPlacesProvider } from '@/app/store'
import type { Country } from '@/domain/models/country'
import type { PlaceKind, PlaceSuggestion } from '@/domain/services/placeProvider'
import { isQueryWorthSending, refineSuggestions } from '@/domain/services/placeSuggestions'

/**
 * Sugerencias de lugares mientras se escribe.
 *
 * Photon es un servicio publico de uso razonable, asi que este hook existe
 * tanto para la experiencia como para no abusar de el:
 *
 * - **Espera** a que se pare de escribir. Sin esto, "barranquilla" serian doce
 *   peticiones para un solo dato.
 * - **Cachea** por consulta. Borrar una letra y volver a escribirla no vuelve a
 *   preguntar, y quien corrige varios registros de la misma ciudad pregunta una
 *   vez.
 * - **Cancela** la peticion en vuelo cuando llega otra. Sin esto, una respuesta
 *   lenta de "barr" podria pisar la de "barranquilla".
 */

/**
 * Espera tras la ultima pulsacion.
 *
 * 300 ms es el punto donde deja de notarse el retardo pero ya no se envia una
 * peticion por letra.
 */
const DEBOUNCE_MS = 300

export interface PlaceSuggestionsState {
  readonly suggestions: readonly PlaceSuggestion[]
  readonly isLoading: boolean
  /** Mensaje si la consulta fallo. Nunca impide seguir escribiendo a mano. */
  readonly error: string | null
}

export function usePlaceSuggestions(input: {
  readonly text: string
  readonly kind: PlaceKind
  readonly country: Country | null
  /** Permite apagarlo mientras el campo no tiene el foco. */
  readonly enabled: boolean
}): PlaceSuggestionsState {
  const { text, kind, country, enabled } = input

  const [state, setState] = useState<PlaceSuggestionsState>({
    suggestions: [],
    isLoading: false,
    error: null,
  })

  /**
   * Cache de la sesion, por clase de campo, pais y texto.
   *
   * En un `ref` y no en el estado: cambiarla no debe provocar un render, y debe
   * sobrevivir a los renders que si ocurren.
   */
  const cache = useRef(new Map<string, readonly PlaceSuggestion[]>())

  useEffect(() => {
    if (!enabled || !isQueryWorthSending(text)) {
      setState({ suggestions: [], isLoading: false, error: null })
      return
    }

    const key = `${kind}|${country?.code ?? ''}|${text.trim().toLowerCase()}`

    const cached = cache.current.get(key)
    if (cached) {
      setState({ suggestions: cached, isLoading: false, error: null })
      return
    }

    const controller = new AbortController()
    let cancelled = false

    setState((current) => ({ ...current, isLoading: true, error: null }))

    const timer = setTimeout(() => {
      void getPlacesProvider()
        .suggest({ text: text.trim(), kind, country }, { signal: controller.signal })
        .then((raw) => {
          if (cancelled) return
          const refined = refineSuggestions(raw, { country })
          cache.current.set(key, refined)
          setState({ suggestions: refined, isLoading: false, error: null })
        })
        .catch((cause: unknown) => {
          if (cancelled || controller.signal.aborted) return
          setState({
            suggestions: [],
            isLoading: false,
            error:
              cause instanceof Error
                ? 'No se pudieron cargar las sugerencias. Puedes escribirlo a mano.'
                : null,
          })
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, kind, country, enabled])

  return state
}
