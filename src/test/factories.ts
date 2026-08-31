import type { NormalizedFields } from '@/domain/models/fields'
import { emptyComponents, type GeocodeResult } from '@/domain/models/geocode'
import { createRecord, type EstablishmentRecord } from '@/domain/models/record'
import type { NormalizeOptions } from '@/domain/services/recordNormalizer'

/** Generador de ids determinista, para que los tests no dependan del azar. */
export function sequentialIds(prefix = 'rec'): () => string {
  let counter = 0
  return () => {
    counter += 1
    return `${prefix}-${counter}`
  }
}

export const FIXED_NOW = '2026-01-01T00:00:00.000Z'

export function testOptions(overrides: Partial<NormalizeOptions> = {}): NormalizeOptions {
  return {
    batchId: 'lote-test',
    newId: sequentialIds(),
    now: () => FIXED_NOW,
    ...overrides,
  }
}

export function makeRecord(fields: Partial<NormalizedFields>): EstablishmentRecord {
  return createRecord({
    id: 'test-1',
    source: 'manual',
    batchId: 'lote-test',
    fields,
    timestamp: FIXED_NOW,
  })
}

/**
 * Resultado de geocodificacion completo, para no repetir todos los campos en
 * cada test. `components` se rellena vacio salvo que se pida otra cosa.
 */
export function makeResult(overrides: Partial<GeocodeResult> = {}): GeocodeResult {
  return {
    latitude: 11.0057,
    longitude: -74.8139,
    matchedName: 'Olimpica',
    matchedAddress: 'Olimpica, Carrera 52, Barranquilla',
    provider: 'nominatim',
    confidence: 0.834,
    queryUsed: 'Olimpica Prado, Barranquilla, Colombia',
    manuallyVerified: false,
    components: emptyComponents(),
    candidates: [],
    attempts: [],
    notes: [],
    resolvedAt: FIXED_NOW,
    ...overrides,
  }
}
