import { describe, expect, it } from 'vitest'

import type { GeocodeResult } from '@/domain/models/geocode'
import type { EstablishmentRecord } from '@/domain/models/record'
import type { RecordStatus } from '@/domain/models/status'
import { makeRecord } from '@/test/factories'

import { buildReviewQueue, findNextPending } from './reviewQueue'

const RESULT = {
  latitude: 1,
  longitude: 2,
  matchedName: 'x',
  matchedAddress: 'y',
  provider: 'nominatim',
  confidence: 0.6,
  queryUsed: 'q',
  manuallyVerified: false,
  candidates: [],
  attempts: [],
  notes: [],
  resolvedAt: '2026-01-01T00:00:00.000Z',
} satisfies GeocodeResult

function record(id: string, status: RecordStatus, withResult = true): EstablishmentRecord {
  return {
    ...makeRecord({ location_name: id }),
    id,
    status,
    result: withResult ? RESULT : null,
  }
}

describe('buildReviewQueue', () => {
  it('con "solo pendientes" deja los que necesitan una decision', () => {
    const queue = buildReviewQueue(
      [record('a', 'LOW_CONFIDENCE'), record('b', 'FOUND'), record('c', 'NOT_FOUND', false)],
      { onlyPending: true, selectedId: null },
    )

    expect(queue.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  /** Es la razon de ser de este modulo. */
  it('conserva el registro seleccionado aunque ya no necesite revision', () => {
    const queue = buildReviewQueue(
      [record('a', 'MANUALLY_VERIFIED'), record('b', 'NEEDS_REVIEW')],
      { onlyPending: true, selectedId: 'a' },
    )

    expect(queue.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('mantiene el seleccionado en su posicion, no al final', () => {
    const queue = buildReviewQueue(
      [record('a', 'NEEDS_REVIEW'), record('b', 'MANUALLY_VERIFIED'), record('c', 'NOT_FOUND')],
      { onlyPending: true, selectedId: 'b' },
    )

    expect(queue.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('no duplica el seleccionado si ya cumplia el filtro', () => {
    const queue = buildReviewQueue([record('a', 'NEEDS_REVIEW')], {
      onlyPending: true,
      selectedId: 'a',
    })

    expect(queue).toHaveLength(1)
  })

  it('sin "solo pendientes" incluye tambien los ya resueltos con resultado', () => {
    const queue = buildReviewQueue(
      [record('a', 'FOUND'), record('b', 'PENDING', false), record('c', 'NEEDS_REVIEW')],
      { onlyPending: false, selectedId: null },
    )

    expect(queue.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('devuelve lista vacia si no hay nada que revisar', () => {
    expect(
      buildReviewQueue([record('a', 'FOUND')], { onlyPending: true, selectedId: null }),
    ).toEqual([])
  })
})

describe('findNextPending', () => {
  it('encuentra el siguiente que espera decision', () => {
    const next = findNextPending(
      [record('a', 'MANUALLY_VERIFIED'), record('b', 'LOW_CONFIDENCE')],
      'a',
    )
    expect(next?.id).toBe('b')
  })

  it('nunca devuelve el que ya se esta revisando', () => {
    expect(findNextPending([record('a', 'NEEDS_REVIEW')], 'a')).toBeNull()
  })

  it('devuelve null si no queda nada pendiente', () => {
    expect(
      findNextPending([record('a', 'FOUND'), record('b', 'MANUALLY_VERIFIED')], null),
    ).toBeNull()
  })
})
