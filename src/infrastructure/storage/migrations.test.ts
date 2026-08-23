import { describe, expect, it } from 'vitest'

import type { EstablishmentRecord } from '@/domain/models/record'
import { makeRecord } from '@/test/factories'

import { migrateRecord } from './migrations'

/** Simula un registro guardado por una version anterior del modelo. */
function legacy(result: unknown): EstablishmentRecord {
  return {
    ...makeRecord({ location_name: 'Olimpica Prado' }),
    result: result as EstablishmentRecord['result'],
  }
}

describe('migrateRecord', () => {
  it('rellena los campos de resultado que no existian', () => {
    const migrated = migrateRecord(
      legacy({
        latitude: 11,
        longitude: -74.8,
        matchedName: 'Olimpica',
        matchedAddress: 'Barranquilla',
        provider: 'nominatim',
        confidence: 0.6,
        queryUsed: 'Olimpica, Barranquilla',
        manuallyVerified: false,
        resolvedAt: '2026-02-01T00:00:00.000Z',
      }),
    )

    expect(migrated.result?.notes).toEqual([])
    expect(migrated.result?.attempts).toEqual([])
    expect(migrated.result?.candidates).toEqual([])
  })

  it('conserva los valores que ya estaban', () => {
    const migrated = migrateRecord(
      legacy({
        latitude: 11,
        longitude: -74.8,
        matchedName: 'Olimpica',
        matchedAddress: 'Barranquilla',
        provider: 'nominatim',
        confidence: 0.6,
        queryUsed: 'q',
        manuallyVerified: true,
        notes: ['una nota'],
        candidates: [],
        attempts: [],
        resolvedAt: '2026-02-01T00:00:00.000Z',
      }),
    )

    expect(migrated.result?.notes).toEqual(['una nota'])
    expect(migrated.result?.manuallyVerified).toBe(true)
  })

  it('migra tambien el historial encadenado', () => {
    const migrated = migrateRecord(
      legacy({
        latitude: 1,
        longitude: 2,
        matchedName: 'a',
        matchedAddress: 'b',
        provider: 'manual',
        confidence: 1,
        queryUsed: '',
        manuallyVerified: true,
        resolvedAt: 'x',
        replaced: {
          latitude: 3,
          longitude: 4,
          matchedName: 'c',
          matchedAddress: 'd',
          provider: 'nominatim',
          confidence: 0.5,
          queryUsed: '',
          manuallyVerified: false,
          resolvedAt: 'y',
        },
      }),
    )

    expect(migrated.result?.replaced?.notes).toEqual([])
  })

  it('acepta registros sin resultado', () => {
    const migrated = migrateRecord(makeRecord({ city: 'Bogota' }))
    expect(migrated.result).toBeNull()
    expect(migrated.rejected).toEqual([])
  })

  it('completa campos normalizados ausentes', () => {
    const incomplete = {
      ...makeRecord({ city: 'Bogota' }),
      fields: { city: 'Bogota' } as EstablishmentRecord['fields'],
    }
    expect(migrateRecord(incomplete).fields.client).toBe('')
  })
})
