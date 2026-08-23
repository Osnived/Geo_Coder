import { describe, expect, it, vi } from 'vitest'

import { makeRecord } from '@/test/factories'

import { emptyComponents, ProviderError } from './geocoderProvider'
import type { GeocoderProvider, ProviderCandidate } from './geocoderProvider'
import { geocodeRecord, type CandidateScorer } from './geocoderService'

const THRESHOLDS = { accept: 0.8, review: 0.5 }
const NOW = () => '2026-01-01T00:00:00.000Z'

function candidate(overrides: Partial<ProviderCandidate> = {}): ProviderCandidate {
  return {
    latitude: 10.99,
    longitude: -74.79,
    name: 'Olimpica Calle 72',
    address: 'Cra. 53 #75-140, Barranquilla, Colombia',
    components: emptyComponents(),
    category: 'supermarket',
    rank: 0,
    raw: {},
    ...overrides,
  }
}

function fakeProvider(
  name: string,
  behaviour: (queryText: string) => ProviderCandidate[] | Error,
): GeocoderProvider {
  return {
    name,
    requestsPerSecond: 10,
    search: (query) => {
      const outcome = behaviour(query.text)
      if (outcome instanceof Error) return Promise.reject(outcome)
      return Promise.resolve(outcome)
    },
  }
}

/** Devuelve la confianza indicada, ignorando el candidato. */
const fixedScorer =
  (value: number): CandidateScorer =>
  () => ({
    confidence: value,
    signals: { fixed: value },
  })

const RECORD = makeRecord({
  client: 'Olimpica',
  location_name: 'Olimpica Calle 72',
  address: 'Cra. 53 #75-140',
  city: 'Barranquilla',
  country: 'Colombia',
})

describe('geocodeRecord', () => {
  it('acepta el primer candidato que supera el umbral y deja de buscar', async () => {
    const search = vi.fn(() => Promise.resolve([candidate()]))
    const provider: GeocoderProvider = { name: 'fake', requestsPerSecond: 10, search }

    const outcome = await geocodeRecord(RECORD, {
      providers: [provider],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('FOUND')
    expect(outcome.result?.latitude).toBe(10.99)
    expect(outcome.result?.provider).toBe('fake')
    expect(outcome.result?.manuallyVerified).toBe(false)
    // Solo una peticion: no sigue probando estrategias.
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('guarda la consulta que produjo el resultado', async () => {
    const outcome = await geocodeRecord(RECORD, {
      providers: [fakeProvider('fake', () => [candidate()])],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.result?.queryUsed).toContain('Olimpica Calle 72')
    expect(outcome.result?.queryUsed).toContain('Colombia')
  })

  it('marca LOW_CONFIDENCE cuando el mejor candidato no llega al umbral', async () => {
    const outcome = await geocodeRecord(RECORD, {
      providers: [fakeProvider('fake', () => [candidate()])],
      scorer: fixedScorer(0.6),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('LOW_CONFIDENCE')
    expect(outcome.result).not.toBeNull()
  })

  it('marca NEEDS_REVIEW cuando la confianza es baja', async () => {
    const outcome = await geocodeRecord(RECORD, {
      providers: [fakeProvider('fake', () => [candidate()])],
      scorer: fixedScorer(0.2),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('NEEDS_REVIEW')
    expect(outcome.result?.confidence).toBe(0.2)
  })

  it('marca NOT_FOUND cuando ningun proveedor devuelve nada', async () => {
    const outcome = await geocodeRecord(RECORD, {
      providers: [fakeProvider('fake', () => [])],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('NOT_FOUND')
    expect(outcome.result).toBeNull()
    expect(outcome.attempts.length).toBeGreaterThan(1)
  })

  it('marca NOT_FOUND sin gastar peticiones si no hay nada que buscar', async () => {
    const search = vi.fn()
    const outcome = await geocodeRecord(makeRecord({}), {
      providers: [{ name: 'fake', requestsPerSecond: 10, search }],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('NOT_FOUND')
    expect(outcome.attempts).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('prueba estrategias alternativas cuando la primera no da resultados', async () => {
    const seen: string[] = []
    const provider = fakeProvider('fake', (text) => {
      seen.push(text)
      // Solo la segunda estrategia encuentra algo.
      return seen.length === 2 ? [candidate()] : []
    })

    const outcome = await geocodeRecord(RECORD, {
      providers: [provider],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(seen.length).toBe(2)
    expect(outcome.status).toBe('FOUND')
  })

  it('pasa al siguiente proveedor si el primero no encuentra nada', async () => {
    const primary = fakeProvider('primario', () => [])
    const secondary = fakeProvider('secundario', () => [candidate()])

    const outcome = await geocodeRecord(RECORD, {
      providers: [primary, secondary],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('FOUND')
    expect(outcome.result?.provider).toBe('secundario')
  })

  it('un error de una estrategia no aborta las demas', async () => {
    let call = 0
    const provider = fakeProvider('fake', () => {
      call += 1
      if (call === 1) return new ProviderError('fake', 'TIMEOUT', 'sin respuesta', true)
      return [candidate()]
    })

    const outcome = await geocodeRecord(RECORD, {
      providers: [provider],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('FOUND')
    expect(outcome.attempts[0]?.error?.code).toBe('TIMEOUT')
  })

  it('marca ERROR solo si todos los intentos fallaron', async () => {
    const provider = fakeProvider(
      'fake',
      () => new ProviderError('fake', 'RATE_LIMITED', 'demasiadas peticiones', true),
    )

    const outcome = await geocodeRecord(RECORD, {
      providers: [provider],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.status).toBe('ERROR')
    expect(outcome.result).toBeNull()
    expect(outcome.attempts.every((attempt) => attempt.error !== null)).toBe(true)
  })

  it('ordena los candidatos por confianza y los conserva para revision', async () => {
    const provider = fakeProvider('fake', () => [
      candidate({ name: 'lejano', rank: 0 }),
      candidate({ name: 'exacto', rank: 1 }),
    ])
    const scorer: CandidateScorer = (_record, item) => ({
      confidence: item.name === 'exacto' ? 0.7 : 0.3,
      signals: {},
    })

    const outcome = await geocodeRecord(RECORD, {
      providers: [provider],
      scorer,
      thresholds: THRESHOLDS,
      now: NOW,
    })

    expect(outcome.result?.matchedName).toBe('exacto')
    expect(outcome.result?.candidates.map((item) => item.matchedName)).toEqual(['exacto', 'lejano'])
  })

  it('deja de buscar si se cancela', async () => {
    const controller = new AbortController()
    controller.abort()
    const search = vi.fn(() => Promise.resolve([candidate()]))

    const outcome = await geocodeRecord(RECORD, {
      providers: [{ name: 'fake', requestsPerSecond: 10, search }],
      scorer: fixedScorer(0.9),
      thresholds: THRESHOLDS,
      now: NOW,
      signal: controller.signal,
    })

    expect(search).not.toHaveBeenCalled()
    expect(outcome.status).toBe('NOT_FOUND')
  })

  it('registra cada intento para poder explicar el resultado', async () => {
    const outcome = await geocodeRecord(RECORD, {
      providers: [fakeProvider('fake', () => [candidate()])],
      scorer: fixedScorer(0.4),
      thresholds: THRESHOLDS,
      now: NOW,
      maxQueries: 2,
    })

    expect(outcome.attempts).toHaveLength(2)
    expect(outcome.attempts[0]).toMatchObject({
      provider: 'fake',
      candidateCount: 1,
      bestConfidence: 0.4,
      error: null,
    })
    expect(outcome.attempts[0]?.query.strategy).toBe(0)
  })
})
