import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import type { GeocodeQuery } from '@/domain/models/geocode'
import {
  emptyComponents,
  ProviderError,
  type GeocoderProvider,
  type ProviderCandidate,
} from '@/domain/services/geocoderProvider'
import { createDb } from '@/infrastructure/storage/db'

import { cacheKey, createIndexedDbCache, createMemoryCache } from './cache'
import { withCache } from './withCache'
import { withRetry } from './withRetry'

const QUERY: GeocodeQuery = {
  text: 'Olímpica Prado, Barranquilla, Colombia',
  country: { name: 'Colombia', code: 'CO' },
  usedFields: ['location_name', 'city'],
  strategy: 0,
  templateId: 'name+locality',
}

function candidate(): ProviderCandidate {
  return {
    latitude: 11,
    longitude: -74.8,
    name: 'Olímpica',
    address: 'Olímpica, Barranquilla',
    components: emptyComponents(),
    category: 'supermarket',
    rank: 0,
    raw: { id: 1 },
  }
}

function provider(search: GeocoderProvider['search']): GeocoderProvider {
  return { name: 'fake', requestsPerSecond: 10, search }
}

describe('cacheKey', () => {
  it('ignora acentos, mayusculas y espacios de la consulta', () => {
    const a = cacheKey('fake', QUERY, 5)
    const b = cacheKey('fake', { ...QUERY, text: 'OLIMPICA  PRADO, barranquilla, colombia' }, 5)
    expect(a).toBe(b)
  })

  it('distingue proveedor, pais y limite', () => {
    const base = cacheKey('fake', QUERY, 5)
    expect(cacheKey('otro', QUERY, 5)).not.toBe(base)
    expect(cacheKey('fake', { ...QUERY, country: null }, 5)).not.toBe(base)
    expect(cacheKey('fake', QUERY, 10)).not.toBe(base)
  })
})

describe('withCache', () => {
  it('no repite una consulta ya resuelta', async () => {
    const search = vi.fn(() => Promise.resolve([candidate()]))
    const cached = withCache(provider(search), createMemoryCache())

    const first = await cached.search(QUERY)
    const second = await cached.search(QUERY)

    expect(search).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(cached.stats).toEqual({ hits: 1, misses: 1 })
  })

  it('cachea tambien la ausencia de resultados', async () => {
    const search = vi.fn(() => Promise.resolve([]))
    const cached = withCache(provider(search), createMemoryCache())

    await cached.search(QUERY)
    await cached.search(QUERY)

    expect(search).toHaveBeenCalledTimes(1)
  })

  it('trata consultas distintas por separado', async () => {
    const search = vi.fn(() => Promise.resolve([candidate()]))
    const cached = withCache(provider(search), createMemoryCache())

    await cached.search(QUERY)
    await cached.search({ ...QUERY, text: 'Otra cosa' })

    expect(search).toHaveBeenCalledTimes(2)
  })

  it('no cachea los errores', async () => {
    let calls = 0
    const search = vi.fn(() => {
      calls += 1
      if (calls === 1) return Promise.reject(new ProviderError('fake', 'TIMEOUT', 'lento', true))
      return Promise.resolve([candidate()])
    })
    const cached = withCache(provider(search), createMemoryCache())

    await expect(cached.search(QUERY)).rejects.toThrow()
    await expect(cached.search(QUERY)).resolves.toHaveLength(1)
  })

  it('caduca las entradas viejas', async () => {
    let clock = 0
    const cache = createMemoryCache({ maxAgeMs: 1000, now: () => clock })
    const search = vi.fn(() => Promise.resolve([candidate()]))
    const cached = withCache(provider(search), cache)

    await cached.search(QUERY)
    clock = 2000
    await cached.search(QUERY)

    expect(search).toHaveBeenCalledTimes(2)
  })
})

describe('createIndexedDbCache', () => {
  const makeCache = () =>
    createIndexedDbCache(
      createDb(`cache-${String(Math.random())}`, { indexedDB: new IDBFactory(), IDBKeyRange }),
    )

  it('guarda y recupera candidatos', async () => {
    const cache = makeCache()
    await cache.set('k', 'fake', [candidate()])

    const found = await cache.get('k')
    expect(found).toHaveLength(1)
    expect(found?.[0]?.name).toBe('Olímpica')
    expect(await cache.size()).toBe(1)
  })

  it('devuelve null si no hay nada', async () => {
    expect(await makeCache().get('ausente')).toBeNull()
  })

  it('se puede vaciar', async () => {
    const cache = makeCache()
    await cache.set('k', 'fake', [candidate()])
    await cache.clear()
    expect(await cache.size()).toBe(0)
  })

  it('descarta entradas caducadas', async () => {
    let clock = 0
    const cache = createIndexedDbCache(
      createDb(`cache-ttl-${String(Math.random())}`, {
        indexedDB: new IDBFactory(),
        IDBKeyRange,
      }),
      { maxAgeMs: 1000, now: () => clock },
    )

    await cache.set('k', 'fake', [candidate()])
    clock = 5000

    expect(await cache.get('k')).toBeNull()
    expect(await cache.size()).toBe(0)
  })
})

describe('withRetry', () => {
  const noSleep = () => Promise.resolve()

  it('reintenta los errores reintentables', async () => {
    let calls = 0
    const search = vi.fn(() => {
      calls += 1
      if (calls < 3) return Promise.reject(new ProviderError('fake', 'TIMEOUT', 'lento', true))
      return Promise.resolve([candidate()])
    })

    const wrapped = withRetry(provider(search), {
      maxRetries: 3,
      baseDelayMs: 10,
      sleep: noSleep,
    })

    await expect(wrapped.search(QUERY)).resolves.toHaveLength(1)
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('no reintenta los errores definitivos', async () => {
    const search = vi.fn(() => Promise.reject(new ProviderError('fake', 'FORBIDDEN', 'no')))
    const wrapped = withRetry(provider(search), {
      maxRetries: 3,
      baseDelayMs: 10,
      sleep: noSleep,
    })

    await expect(wrapped.search(QUERY)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('se rinde tras agotar los intentos', async () => {
    const search = vi.fn(() =>
      Promise.reject(new ProviderError('fake', 'RATE_LIMITED', 'demasiado', true)),
    )
    const wrapped = withRetry(provider(search), {
      maxRetries: 2,
      baseDelayMs: 10,
      sleep: noSleep,
    })

    await expect(wrapped.search(QUERY)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(search).toHaveBeenCalledTimes(3)
  })

  it('duplica la espera en cada intento', async () => {
    const waits: number[] = []
    const search = vi.fn(() => Promise.reject(new ProviderError('fake', 'NETWORK', 'red', true)))

    const wrapped = withRetry(provider(search), {
      maxRetries: 3,
      baseDelayMs: 100,
      sleep: (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    })

    await expect(wrapped.search(QUERY)).rejects.toThrow()
    expect(waits).toEqual([100, 200, 400])
  })

  it('respeta el tope de espera', async () => {
    const waits: number[] = []
    const search = vi.fn(() => Promise.reject(new ProviderError('fake', 'NETWORK', 'red', true)))

    const wrapped = withRetry(provider(search), {
      maxRetries: 4,
      baseDelayMs: 1000,
      maxDelayMs: 2000,
      sleep: (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    })

    await expect(wrapped.search(QUERY)).rejects.toThrow()
    expect(waits).toEqual([1000, 2000, 2000, 2000])
  })

  it('no reintenta si se cancelo', async () => {
    const controller = new AbortController()
    controller.abort()
    const search = vi.fn()

    const wrapped = withRetry(provider(search), {
      maxRetries: 3,
      baseDelayMs: 10,
      sleep: noSleep,
    })

    await expect(wrapped.search(QUERY, { signal: controller.signal })).rejects.toMatchObject({
      code: 'ABORTED',
    })
    expect(search).not.toHaveBeenCalled()
  })
})
