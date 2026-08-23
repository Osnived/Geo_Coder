/**
 * Limitador de peticiones por segundo (spec seccion 11).
 *
 * Serializa las tareas y separa el inicio de cada una del anterior lo
 * suficiente para no superar el ritmo pactado con el proveedor. Nominatim
 * admite como maximo 1 peticion por segundo y prohibe las peticiones en
 * paralelo, asi que la ejecucion es estrictamente secuencial.
 */

export interface RateLimiter {
  /** Encola una tarea y la ejecuta cuando toque. */
  schedule: <T>(task: () => Promise<T>) => Promise<T>
  /** Tareas pendientes de empezar. */
  readonly pending: number
}

export interface RateLimiterOptions {
  readonly requestsPerSecond: number
  /** Inyectable para los tests. */
  readonly sleep?: (ms: number) => Promise<void>
  readonly now?: () => number
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const minIntervalMs = 1000 / Math.max(options.requestsPerSecond, 0.001)
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? (() => Date.now())

  let chain: Promise<unknown> = Promise.resolve()
  let lastStart = Number.NEGATIVE_INFINITY
  let pending = 0

  const limiter: RateLimiter = {
    schedule<T>(task: () => Promise<T>): Promise<T> {
      pending += 1

      const run = async (): Promise<T> => {
        const wait = lastStart + minIntervalMs - now()
        if (wait > 0) await sleep(wait)
        lastStart = now()
        pending -= 1
        return task()
      }

      // Cada tarea espera a la anterior: nunca hay dos en vuelo.
      const result = chain.then(run, run)
      chain = result.catch(() => undefined)
      return result
    },
    get pending() {
      return pending
    },
  }

  return limiter
}
