import { describe, expect, it } from 'vitest'

import type { EstablishmentRecord } from '@/domain/models/record'
import type { RecordStatus } from '@/domain/models/status'
import { makeRecord, makeResult } from '@/test/factories'

import { buildReviewQueue, findNextPending } from './reviewQueue'

function record(id: string, status: RecordStatus, withResult = true): EstablishmentRecord {
  return {
    ...makeRecord({ location_name: id }),
    id,
    status,
    result: withResult ? makeResult({ confidence: 0.6 }) : null,
  }
}

const ids = (records: readonly EstablishmentRecord[]) => records.map((entry) => entry.id)

describe('buildReviewQueue', () => {
  const pendiente = record('pendiente', 'LOW_CONFIDENCE')
  const resuelto = record('resuelto', 'FOUND')
  const vacio = record('vacio', 'NOT_FOUND', false)

  const all = [pendiente, resuelto, vacio]

  it('sin seleccion devuelve lo que pasaron los filtros', () => {
    expect(ids(buildReviewQueue([pendiente, vacio], all, null))).toEqual(['pendiente', 'vacio'])
  })

  it('no altera el orden de lo filtrado', () => {
    expect(ids(buildReviewQueue([vacio, pendiente], all, 'vacio'))).toEqual(['vacio', 'pendiente'])
  })

  /** Es la razon de ser de este modulo. */
  it('conserva el registro seleccionado aunque el filtro lo haya descartado', () => {
    const queue = buildReviewQueue([pendiente], all, 'resuelto')

    expect(ids(queue)).toEqual(['pendiente', 'resuelto'])
  })

  it('no duplica el seleccionado si ya pasaba el filtro', () => {
    const queue = buildReviewQueue([pendiente, vacio], all, 'pendiente')

    expect(ids(queue)).toEqual(['pendiente', 'vacio'])
  })

  it('un seleccionado que ya no existe se ignora sin romper', () => {
    expect(ids(buildReviewQueue([pendiente], all, 'borrado'))).toEqual(['pendiente'])
  })

  it('con el filtro vacio y una seleccion, la cola es solo esa', () => {
    expect(ids(buildReviewQueue([], all, 'resuelto'))).toEqual(['resuelto'])
  })

  it('no muta la lista recibida', () => {
    const matching = [pendiente]
    buildReviewQueue(matching, all, 'resuelto')
    expect(matching).toHaveLength(1)
  })
})

describe('findNextPending', () => {
  const records = [
    record('a', 'FOUND'),
    record('b', 'LOW_CONFIDENCE'),
    record('c', 'NOT_FOUND', false),
  ]

  it('devuelve el primero que necesita decision', () => {
    expect(findNextPending(records, null)?.id).toBe('b')
  })

  it('salta el que ya se esta mirando', () => {
    expect(findNextPending(records, 'b')?.id).toBe('c')
  })

  it('devuelve null si no queda nada pendiente', () => {
    expect(findNextPending([record('a', 'FOUND')], null)).toBeNull()
  })

  it('devuelve null si el unico pendiente es el seleccionado', () => {
    expect(findNextPending([record('b', 'NEEDS_REVIEW')], 'b')).toBeNull()
  })
})
