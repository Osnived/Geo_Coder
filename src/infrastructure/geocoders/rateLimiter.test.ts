import { describe, expect, it } from 'vitest'

import { createRateLimiter } from './rateLimiter'

/** Reloj falso: el tiempo solo avanza cuando alguien duerme. */
function fakeClock() {
  let current = 0
  return {
    now: () => current,
    sleep: (ms: number) => {
      current += ms
      return Promise.resolve()
    },
    advance: (ms: number) => {
      current += ms
    },
  }
}

describe('createRateLimiter', () => {
  it('separa los inicios segun el ritmo pactado', async () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ requestsPerSecond: 1, now: clock.now, sleep: clock.sleep })
    const starts: number[] = []

    await Promise.all(
      [0, 1, 2].map(() =>
        limiter.schedule(() => {
          starts.push(clock.now())
          return Promise.resolve(null)
        }),
      ),
    )

    expect(starts).toEqual([0, 1000, 2000])
  })

  it('no espera si ya paso suficiente tiempo', async () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ requestsPerSecond: 1, now: clock.now, sleep: clock.sleep })

    await limiter.schedule(() => Promise.resolve(null))
    clock.advance(5000)
    const before = clock.now()
    await limiter.schedule(() => Promise.resolve(null))

    expect(clock.now()).toBe(before)
  })

  it('nunca ejecuta dos tareas a la vez', async () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ requestsPerSecond: 10, now: clock.now, sleep: clock.sleep })
    let running = 0
    let maxRunning = 0

    await Promise.all(
      Array.from({ length: 5 }, () =>
        limiter.schedule(async () => {
          running += 1
          maxRunning = Math.max(maxRunning, running)
          await Promise.resolve()
          running -= 1
        }),
      ),
    )

    expect(maxRunning).toBe(1)
  })

  it('un fallo no bloquea la cola', async () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ requestsPerSecond: 10, now: clock.now, sleep: clock.sleep })

    const failed = limiter.schedule(() => Promise.reject(new Error('boom')))
    const next = limiter.schedule(() => Promise.resolve('ok'))

    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })

  it('propaga el resultado de la tarea', async () => {
    const limiter = createRateLimiter({ requestsPerSecond: 1000 })
    await expect(limiter.schedule(() => Promise.resolve(42))).resolves.toBe(42)
  })
})
