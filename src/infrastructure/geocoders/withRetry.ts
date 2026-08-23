import { ProviderError, type GeocoderProvider } from '@/domain/services/geocoderProvider'

/**
 * Reintentos con espera creciente (spec seccion 11).
 *
 * Solo se reintenta lo que puede mejorar al repetirse: timeouts, fallos de red,
 * 5xx y 429. Un 403 o una respuesta invalida no se reintentan, porque volver a
 * preguntar daria el mismo resultado y consumiria cupo.
 */

export interface RetryPolicy {
  readonly maxRetries: number
  /** Espera base. Se duplica en cada intento. */
  readonly baseDelayMs: number
  /** Tope de espera entre intentos. */
  readonly maxDelayMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const DEFAULT_MAX_DELAY_MS = 30_000

function isRetryable(error: unknown): boolean {
  return error instanceof ProviderError && error.retryable
}

export function withRetry(provider: GeocoderProvider, policy: RetryPolicy): GeocoderProvider {
  const sleep = policy.sleep ?? defaultSleep
  const maxDelay = policy.maxDelayMs ?? DEFAULT_MAX_DELAY_MS

  return {
    name: provider.name,
    requestsPerSecond: provider.requestsPerSecond,

    async search(query, options) {
      let lastError: unknown

      for (let attempt = 0; attempt <= policy.maxRetries; attempt += 1) {
        if (options?.signal?.aborted === true) {
          throw new ProviderError(provider.name, 'ABORTED', 'Peticion cancelada.')
        }

        try {
          return await provider.search(query, options)
        } catch (error) {
          lastError = error
          if (!isRetryable(error) || attempt === policy.maxRetries) throw error

          const delay = Math.min(policy.baseDelayMs * 2 ** attempt, maxDelay)
          await sleep(delay)
        }
      }

      throw lastError
    },
  }
}
