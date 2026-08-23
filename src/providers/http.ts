import { ProviderError } from '@/domain/services/geocoderProvider'

/** Utilidades HTTP compartidas por los proveedores. */

export interface FetchJsonOptions {
  readonly provider: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal | undefined
}

function combineSignals(
  timeoutMs: number,
  external: AbortSignal | undefined,
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException('timeout', 'TimeoutError'))
  }, timeoutMs)

  const onAbort = () => {
    controller.abort(external?.reason)
  }
  if (external) {
    if (external.aborted) onAbort()
    else external.addEventListener('abort', onAbort, { once: true })
  }

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * GET JSON con tiempo de espera y errores tipados.
 *
 * Nota sobre Nominatim: su politica pide identificar la aplicacion mediante
 * `User-Agent`, cabecera que los navegadores no permiten fijar. Desde el
 * navegador la identificacion viaja en `Referer`, que se envia solo. Por eso
 * aqui no se intenta poner `User-Agent`: seria ignorado.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const { signal, cancel } = combineSignals(options.timeoutMs, options.signal)

  try {
    const response = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
      // Sin credenciales: son APIs publicas.
      credentials: 'omit',
    })

    if (response.status === 429) {
      throw new ProviderError(
        options.provider,
        'RATE_LIMITED',
        'El proveedor rechazo la peticion por exceso de solicitudes.',
        true,
      )
    }
    if (response.status === 403) {
      throw new ProviderError(
        options.provider,
        'FORBIDDEN',
        'El proveedor bloqueo la peticion. Revisa su politica de uso.',
      )
    }
    if (!response.ok) {
      throw new ProviderError(
        options.provider,
        'BAD_RESPONSE',
        `Respuesta ${String(response.status)} del proveedor.`,
        response.status >= 500,
      )
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ProviderError) throw error

    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ProviderError(
        options.provider,
        'TIMEOUT',
        'El proveedor no respondio a tiempo.',
        true,
      )
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ProviderError(options.provider, 'ABORTED', 'Peticion cancelada.')
    }
    throw new ProviderError(
      options.provider,
      'NETWORK',
      error instanceof Error ? error.message : 'Error de red.',
      true,
    )
  } finally {
    cancel()
  }
}

export function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value)
  }
  return url.toString()
}
