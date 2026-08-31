import { describe, expect, it } from 'vitest'

import { makeRecord } from '@/test/factories'

import { emptyComponents, type GeocodeCandidate, type GeocodeResult } from '../models/geocode'
import type { EstablishmentRecord } from '../models/record'

import {
  acceptResult,
  needsReview,
  rejectResult,
  resultHistory,
  selectCandidate,
  setManualCoordinates,
} from './reviewService'

const NOW = () => '2026-03-01T00:00:00.000Z'

function candidate(overrides: Partial<GeocodeCandidate> = {}): GeocodeCandidate {
  return {
    latitude: 11,
    longitude: -74.8,
    matchedName: 'Olimpica Prado',
    matchedAddress: 'Carrera 54, Barranquilla',
    provider: 'nominatim',
    confidence: 0.6,
    signals: { location_name: 1 },
    ...overrides,
  }
}

function result(overrides: Partial<GeocodeResult> = {}): GeocodeResult {
  return {
    latitude: 11,
    longitude: -74.8,
    matchedName: 'Olimpica Prado',
    matchedAddress: 'Carrera 54, Barranquilla',
    provider: 'nominatim',
    confidence: 0.6,
    queryUsed: 'Olimpica Prado, Barranquilla, Colombia',
    manuallyVerified: false,
    components: emptyComponents(),
    candidates: [candidate()],
    attempts: [],
    notes: [],
    resolvedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

function withResult(overrides: Partial<GeocodeResult> = {}): EstablishmentRecord {
  return {
    ...makeRecord({ location_name: 'Olimpica Prado', address: 'Cra. 54 #70-25' }),
    status: 'LOW_CONFIDENCE',
    result: result(overrides),
  }
}

describe('acceptResult', () => {
  it('marca el resultado como verificado manualmente', () => {
    const accepted = acceptResult(withResult(), { now: NOW })

    expect(accepted.status).toBe('MANUALLY_VERIFIED')
    expect(accepted.result?.manuallyVerified).toBe(true)
    expect(accepted.updatedAt).toBe(NOW())
  })

  it('conserva las coordenadas y el proveedor originales', () => {
    const accepted = acceptResult(withResult(), { now: NOW })

    expect(accepted.result?.latitude).toBe(11)
    expect(accepted.result?.provider).toBe('nominatim')
  })

  it('no hace nada si no hay resultado', () => {
    const record = makeRecord({ city: 'Bogota' })
    expect(acceptResult(record, { now: NOW })).toBe(record)
  })
})

describe('rejectResult', () => {
  it('deja el registro sin ubicacion pero guarda lo rechazado', () => {
    const rejected = rejectResult(withResult(), { now: NOW })

    expect(rejected.status).toBe('NOT_FOUND')
    expect(rejected.result).toBeNull()
    expect(rejected.rejected).toHaveLength(1)
    expect(rejected.rejected?.[0]?.latitude).toBe(11)
  })

  it('acumula varios rechazos', () => {
    const once = rejectResult(withResult(), { now: NOW })
    const again = rejectResult({ ...once, result: result({ latitude: 5 }) }, { now: NOW })

    expect(again.rejected).toHaveLength(2)
  })

  it('nunca toca los datos de entrada', () => {
    const record = withResult()
    const rejected = rejectResult(record, { now: NOW })

    expect(rejected.fields).toEqual(record.fields)
    expect(rejected.original).toEqual(record.original)
  })
})

describe('selectCandidate', () => {
  it('sustituye el resultado por el candidato elegido', () => {
    const otro = candidate({ latitude: 12.5, matchedName: 'Olimpica Centro', confidence: 0.4 })
    const updated = selectCandidate(withResult(), otro, { now: NOW })

    expect(updated.status).toBe('MANUALLY_VERIFIED')
    expect(updated.result?.latitude).toBe(12.5)
    expect(updated.result?.matchedName).toBe('Olimpica Centro')
    expect(updated.result?.manuallyVerified).toBe(true)
  })

  it('conserva el resultado anterior para trazabilidad', () => {
    const updated = selectCandidate(withResult(), candidate({ latitude: 12.5 }), { now: NOW })

    expect(updated.result?.replaced?.latitude).toBe(11)
    expect(updated.result?.replaced?.manuallyVerified).toBe(false)
  })

  it('conserva la consulta que se habia usado', () => {
    const updated = selectCandidate(withResult(), candidate({ latitude: 12.5 }), { now: NOW })
    expect(updated.result?.queryUsed).toBe('Olimpica Prado, Barranquilla, Colombia')
  })

  it('funciona sobre un registro que no tenia resultado', () => {
    const record = { ...makeRecord({ location_name: 'Toks' }), status: 'NOT_FOUND' as const }
    const updated = selectCandidate(record, candidate(), { now: NOW })

    expect(updated.result?.replaced).toBeUndefined()
    expect(updated.result?.candidates).toHaveLength(1)
  })
})

describe('setManualCoordinates', () => {
  it('fija las coordenadas elegidas con confianza total', () => {
    const updated = setManualCoordinates(withResult(), 10.5, -74.1, { now: NOW })

    expect(updated.status).toBe('MANUALLY_VERIFIED')
    expect(updated.result).toMatchObject({
      latitude: 10.5,
      longitude: -74.1,
      provider: 'manual',
      confidence: 1,
      manuallyVerified: true,
    })
  })

  it('encadena el historial de correcciones', () => {
    const first = setManualCoordinates(withResult(), 10.5, -74.1, { now: NOW })
    const second = setManualCoordinates(first, 10.6, -74.2, { now: NOW })

    expect(resultHistory(second.result)).toHaveLength(2)
    expect(resultHistory(second.result)[0]?.latitude).toBe(10.5)
    expect(resultHistory(second.result)[1]?.latitude).toBe(11)
  })

  it('usa los datos del registro si no habia resultado previo', () => {
    const record = makeRecord({ location_name: 'Toks Centro', address: 'Av. Universidad 1000' })
    const updated = setManualCoordinates(record, 19.4, -99.1, { now: NOW })

    expect(updated.result?.matchedName).toBe('Toks Centro')
    expect(updated.result?.matchedAddress).toBe('Av. Universidad 1000')
  })
})

describe('resultHistory', () => {
  it('devuelve lista vacia si no hubo sustituciones', () => {
    expect(resultHistory(result())).toEqual([])
    expect(resultHistory(null)).toEqual([])
  })
})

describe('needsReview', () => {
  it('selecciona los estados que exigen mirada humana', () => {
    const base = makeRecord({ city: 'Bogota' })
    expect(needsReview({ ...base, status: 'LOW_CONFIDENCE' })).toBe(true)
    expect(needsReview({ ...base, status: 'NEEDS_REVIEW' })).toBe(true)
    expect(needsReview({ ...base, status: 'NOT_FOUND' })).toBe(true)
    expect(needsReview({ ...base, status: 'ERROR' })).toBe(true)
    expect(needsReview({ ...base, status: 'FOUND' })).toBe(false)
    expect(needsReview({ ...base, status: 'MANUALLY_VERIFIED' })).toBe(false)
    expect(needsReview({ ...base, status: 'PENDING' })).toBe(false)
  })
})
