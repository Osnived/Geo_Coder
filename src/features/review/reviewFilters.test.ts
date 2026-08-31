import { describe, expect, it } from 'vitest'

import type { EstablishmentRecord } from '@/domain/models/record'
import type { RecordStatus } from '@/domain/models/status'
import { makeRecord, makeResult } from '@/test/factories'

import {
  DEFAULT_REVIEW_FILTERS,
  filterForReview,
  summarizeReview,
  type ReviewFilters,
} from './reviewFilters'

function record(
  id: string,
  status: RecordStatus,
  options: { withResult?: boolean; batchId?: string; name?: string; verified?: boolean } = {},
): EstablishmentRecord {
  const withResult = options.withResult ?? status !== 'NOT_FOUND'
  return {
    ...makeRecord({ location_name: options.name ?? id }),
    id,
    status,
    batchId: options.batchId ?? 'g-1',
    result: withResult ? makeResult({ manuallyVerified: options.verified ?? false }) : null,
  }
}

const filters = (overrides: Partial<ReviewFilters> = {}): ReviewFilters => ({
  ...DEFAULT_REVIEW_FILTERS,
  geocode: 'all',
  outcome: 'all',
  ...overrides,
})

const records = [
  record('encontrado', 'FOUND'),
  record('flojo', 'LOW_CONFIDENCE'),
  record('vacio', 'NOT_FOUND', { withResult: false, batchId: 'g-2' }),
  record('roto', 'ERROR', { withResult: false, batchId: 'g-2' }),
  record('a-mano', 'MANUALLY_VERIFIED', { verified: true, batchId: 'g-3' }),
]

const ids = (result: readonly EstablishmentRecord[]) => result.map((entry) => entry.id)

describe('valores por defecto', () => {
  it('arranca mostrando lo que espera una decision', () => {
    expect(DEFAULT_REVIEW_FILTERS.outcome).toBe('pending')
    expect(DEFAULT_REVIEW_FILTERS.groupId).toBe('all')
  })
})

describe('filtro por grupo', () => {
  it('"all" no filtra', () => {
    expect(filterForReview(records, filters())).toHaveLength(5)
  })

  it('deja solo los registros del grupo elegido', () => {
    expect(ids(filterForReview(records, filters({ groupId: 'g-2' })))).toEqual(['vacio', 'roto'])
  })

  it('un grupo sin registros devuelve lista vacia', () => {
    expect(filterForReview(records, filters({ groupId: 'g-9' }))).toEqual([])
  })
})

describe('filtro por geocodificacion', () => {
  it('"con coordenadas" deja los que tienen resultado', () => {
    expect(ids(filterForReview(records, filters({ geocode: 'located' })))).toEqual([
      'encontrado',
      'flojo',
      'a-mano',
    ])
  })

  it('"sin coordenadas" deja los que no lo tienen', () => {
    expect(ids(filterForReview(records, filters({ geocode: 'missing' })))).toEqual([
      'vacio',
      'roto',
    ])
  })

  it('"con error o no encontrados" mira el estado, no el resultado', () => {
    expect(ids(filterForReview(records, filters({ geocode: 'failed' })))).toEqual(['vacio', 'roto'])
  })
})

describe('filtro por resultado', () => {
  it('"cumple" deja lo resuelto que no espera nada', () => {
    expect(ids(filterForReview(records, filters({ outcome: 'accepted' })))).toEqual([
      'encontrado',
      'a-mano',
    ])
  })

  it('"pendiente de decision" deja lo que necesita una persona', () => {
    expect(ids(filterForReview(records, filters({ outcome: 'pending' })))).toEqual([
      'flojo',
      'vacio',
      'roto',
    ])
  })

  it('"verificado a mano" deja solo lo confirmado por una persona', () => {
    expect(ids(filterForReview(records, filters({ outcome: 'verified' })))).toEqual(['a-mano'])
  })
})

describe('busqueda por texto', () => {
  it('busca en todos los campos e ignora acentos', () => {
    const bogota = record('uno', 'FOUND', { name: 'Éxito Bogotá' })
    const cali = record('dos', 'FOUND', { name: 'Éxito Cali' })

    expect(ids(filterForReview([bogota, cali], filters({ text: 'bogota' })))).toEqual(['uno'])
  })

  it('texto vacio no filtra', () => {
    expect(filterForReview(records, filters({ text: '' }))).toHaveLength(5)
  })
})

describe('combinacion de filtros', () => {
  it('los filtros se acumulan', () => {
    const result = filterForReview(
      records,
      filters({ groupId: 'g-2', geocode: 'missing', outcome: 'pending', text: 'roto' }),
    )

    expect(ids(result)).toEqual(['roto'])
  })

  it('una combinacion imposible no devuelve nada', () => {
    // Con coordenadas y a la vez con error de proveedor: no existe.
    expect(
      filterForReview(records, filters({ geocode: 'located', outcome: 'pending', groupId: 'g-2' })),
    ).toEqual([])
  })
})

describe('summarizeReview', () => {
  it('resume total, localizados, pendientes y grupos', () => {
    expect(summarizeReview(records)).toEqual({
      total: 5,
      located: 3,
      pending: 3,
      groups: 3,
      locatedPercentage: 60,
    })
  })

  it('un conjunto vacio no divide por cero', () => {
    expect(summarizeReview([])).toEqual({
      total: 0,
      located: 0,
      pending: 0,
      groups: 0,
      locatedPercentage: 0,
    })
  })

  it('cuenta los grupos distintos, no los registros', () => {
    const sameGroup = [record('a', 'FOUND'), record('b', 'FOUND'), record('c', 'FOUND')]
    expect(summarizeReview(sameGroup).groups).toBe(1)
  })
})
