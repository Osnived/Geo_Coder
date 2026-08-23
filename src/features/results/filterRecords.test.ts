import { describe, expect, it } from 'vitest'

import type { RecordFilters } from '@/app/store/types'
import { createRecord, type EstablishmentRecord } from '@/domain/models/record'
import type { NormalizedFields } from '@/domain/models/fields'
import { FIXED_NOW } from '@/test/factories'

import { filterRecords } from './filterRecords'

let counter = 0

function record(
  fields: Partial<NormalizedFields>,
  overrides: Partial<EstablishmentRecord> = {},
): EstablishmentRecord {
  counter += 1
  return {
    ...createRecord({
      id: `r-${String(counter)}`,
      source: 'manual',
      batchId: 'lote-test',
      fields,
      timestamp: FIXED_NOW,
    }),
    ...overrides,
  }
}

const NO_FILTERS: RecordFilters = {
  text: '',
  source: 'all',
  status: 'all',
  onlyWithIssues: false,
  batchId: 'all',
}

const OPTIONS = { requireCountry: true }

describe('filterRecords', () => {
  const complete = record({
    client: 'Olimpica',
    location_name: 'Olimpica Calle 72',
    city: 'Barranquilla',
    country: 'Colombia',
  })
  const incomplete = record({ client: 'Toks' })
  const imported = record(
    { location_name: 'Starbucks Reforma', city: 'CDMX', country: 'Mexico' },
    { source: 'excel' },
  )
  const found = record(
    { location_name: 'Chedraui Coyoacan', city: 'CDMX', country: 'Mexico' },
    { status: 'FOUND' },
  )
  const all = [complete, incomplete, imported, found]

  it('sin filtros devuelve todo', () => {
    expect(filterRecords(all, NO_FILTERS, OPTIONS)).toHaveLength(4)
  })

  it('filtra por origen', () => {
    const result = filterRecords(all, { ...NO_FILTERS, source: 'excel' }, OPTIONS)
    expect(result.map((item) => item.id)).toEqual([imported.id])
  })

  it('filtra por estado', () => {
    const result = filterRecords(all, { ...NO_FILTERS, status: 'FOUND' }, OPTIONS)
    expect(result.map((item) => item.id)).toEqual([found.id])
  })

  it('busca texto en cualquier campo', () => {
    const result = filterRecords(all, { ...NO_FILTERS, text: 'reforma' }, OPTIONS)
    expect(result.map((item) => item.id)).toEqual([imported.id])
  })

  it('la busqueda ignora acentos y mayusculas', () => {
    const bogota = record({ city: 'Bogotá', location_name: 'Exito', country: 'Colombia' })
    const result = filterRecords([bogota], { ...NO_FILTERS, text: 'BOGOTA' }, OPTIONS)
    expect(result).toHaveLength(1)
  })

  it('muestra solo los registros con problemas', () => {
    const result = filterRecords(all, { ...NO_FILTERS, onlyWithIssues: true }, OPTIONS)
    expect(result.map((item) => item.id)).toContain(incomplete.id)
    expect(result.map((item) => item.id)).not.toContain(complete.id)
  })

  it('respeta que el pais deje de ser obligatorio', () => {
    const sinPais = record({ location_name: 'Toks Centro', city: 'CDMX' })
    const strict = filterRecords([sinPais], { ...NO_FILTERS, onlyWithIssues: true }, OPTIONS)
    const relaxed = filterRecords(
      [sinPais],
      { ...NO_FILTERS, onlyWithIssues: true },
      {
        requireCountry: false,
      },
    )

    expect(strict).toHaveLength(1)
    expect(relaxed).toHaveLength(0)
  })

  it('combina filtros', () => {
    const result = filterRecords(
      all,
      { ...NO_FILTERS, source: 'manual', text: 'olimpica' },
      OPTIONS,
    )
    expect(result.map((item) => item.id)).toEqual([complete.id])
  })
})

describe('filtro por lote', () => {
  const deArchivo = record({ city: 'Bogota', location_name: 'Exito', country: 'Colombia' })
  const deOtro = {
    ...record({ city: 'Cali', location_name: 'Olimpica', country: 'Colombia' }),
    batchId: 'lote-2',
  }

  it('sin filtro devuelve los de todos los lotes', () => {
    expect(filterRecords([deArchivo, deOtro], NO_FILTERS, OPTIONS)).toHaveLength(2)
  })

  it('filtra por el lote indicado', () => {
    const result = filterRecords([deArchivo, deOtro], { ...NO_FILTERS, batchId: 'lote-2' }, OPTIONS)
    expect(result.map((item) => item.id)).toEqual([deOtro.id])
  })

  it('se combina con los demas filtros', () => {
    const result = filterRecords(
      [deArchivo, deOtro],
      { ...NO_FILTERS, batchId: 'lote-2', text: 'exito' },
      OPTIONS,
    )
    expect(result).toEqual([])
  })
})
