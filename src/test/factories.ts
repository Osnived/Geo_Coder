import type { NormalizedFields } from '@/domain/models/fields'
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
