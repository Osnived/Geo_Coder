import type { GeocodeQuery } from '@/domain/models/geocode'
import type { ProviderCandidate } from '@/domain/services/geocoderProvider'
import { canonicalize } from '@/domain/rules/text'
import { createDb, type GeolocatorDb } from '@/infrastructure/storage/db'

/**
 * Cache de respuestas de geocodificacion (spec seccion 12).
 *
 * Evita repetir consultas identicas contra proveedores con limites estrictos.
 * Se guarda en IndexedDB porque un dataset grande no cabe en LocalStorage.
 */

export interface GeocodeCache {
  get: (key: string) => Promise<ProviderCandidate[] | null>
  set: (key: string, provider: string, candidates: readonly ProviderCandidate[]) => Promise<void>
  clear: () => Promise<void>
  size: () => Promise<number>
}

/**
 * Clave de cache. Incluye el limite porque pedir 3 o 10 candidatos devuelve
 * conjuntos distintos, y el codigo de pais porque cambia el filtro enviado.
 */
export function cacheKey(provider: string, query: GeocodeQuery, limit: number): string {
  const country = query.country?.code ?? query.country?.name ?? ''
  return [provider, canonicalize(query.text), canonicalize(country), String(limit)].join('|')
}

export interface CacheOptions {
  /** Edad maxima de una entrada. Por defecto 30 dias. */
  readonly maxAgeMs?: number
  readonly now?: () => number
}

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function createIndexedDbCache(
  db: GeolocatorDb = createDb(),
  options: CacheOptions = {},
): GeocodeCache {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = options.now ?? (() => Date.now())

  return {
    async get(key) {
      const entry = await db.cache.get(key)
      if (!entry) return null

      const age = now() - new Date(entry.cachedAt).getTime()
      if (Number.isNaN(age) || age > maxAgeMs) {
        await db.cache.delete(key)
        return null
      }
      return entry.candidates as ProviderCandidate[]
    },

    async set(key, provider, candidates) {
      await db.cache.put({
        key,
        provider,
        candidates: [...candidates],
        cachedAt: new Date(now()).toISOString(),
      })
    },

    async clear() {
      await db.cache.clear()
    },

    size() {
      return db.cache.count()
    },
  }
}

/** Cache en memoria, para tests y para navegadores sin IndexedDB. */
export function createMemoryCache(options: CacheOptions = {}): GeocodeCache {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = options.now ?? (() => Date.now())
  const entries = new Map<string, { candidates: ProviderCandidate[]; cachedAt: number }>()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return Promise.resolve(null)
      if (now() - entry.cachedAt > maxAgeMs) {
        entries.delete(key)
        return Promise.resolve(null)
      }
      return Promise.resolve(entry.candidates)
    },
    set(key, _provider, candidates) {
      entries.set(key, { candidates: [...candidates], cachedAt: now() })
      return Promise.resolve()
    },
    clear() {
      entries.clear()
      return Promise.resolve()
    },
    size: () => Promise.resolve(entries.size),
  }
}
