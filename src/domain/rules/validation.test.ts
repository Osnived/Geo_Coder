import { describe, expect, it } from 'vitest'

import { makeRecord } from '@/test/factories'

import { hasErrors, summarizeValidation, validateRecord } from './validation'

const codes = (record: Parameters<typeof validateRecord>[0], requireCountry = true) =>
  validateRecord(record, { requireCountry }).map((issue) => issue.code)

describe('validateRecord', () => {
  it('marca un registro completamente vacio y no acumula mas problemas', () => {
    expect(codes(makeRecord({}))).toEqual(['EMPTY_RECORD'])
  })

  it('trata los campos con solo espacios como vacios', () => {
    expect(codes(makeRecord({ client: '   ', city: '  ' }))).toEqual(['EMPTY_RECORD'])
  })

  it('exige pais cuando esta configurado como obligatorio', () => {
    const record = makeRecord({ location_name: 'Toks Plaza Universidad', city: 'CDMX' })
    expect(codes(record)).toContain('MISSING_COUNTRY')
    expect(codes(record, false)).not.toContain('MISSING_COUNTRY')
  })

  it('rechaza registros sin nada que buscar', () => {
    const record = makeRecord({ city: 'Barranquilla', country: 'Colombia' })
    expect(codes(record)).toContain('NOT_GEOCODABLE')
  })

  it('advierte cuando solo hay cliente', () => {
    const record = makeRecord({ client: 'Olimpica', country: 'Colombia' })
    expect(codes(record)).toContain('ONLY_CLIENT')
    expect(codes(record)).not.toContain('NOT_GEOCODABLE')
  })

  it('advierte cuando no hay ninguna referencia de localidad', () => {
    const record = makeRecord({ location_name: 'Starbucks Reforma', country: 'Mexico' })
    expect(codes(record)).toContain('NO_LOCALITY')
  })

  it('acepta sin problemas un registro completo', () => {
    const record = makeRecord({
      client: 'Olimpica',
      business_type: 'Tienda',
      location_name: 'Olimpica Calle 72',
      address: 'Calle 72 #45-10',
      city: 'Barranquilla',
      region: 'Atlantico',
      postal_code: '080020',
      country: 'Colombia',
    })
    expect(validateRecord(record)).toEqual([])
    expect(hasErrors(validateRecord(record))).toBe(false)
  })
})

describe('summarizeValidation', () => {
  it('cuenta registros con errores y advertencias por separado', () => {
    const summary = summarizeValidation([
      makeRecord({}),
      makeRecord({ client: 'Olimpica', country: 'Colombia' }),
      makeRecord({
        location_name: 'Olimpica Calle 72',
        city: 'Barranquilla',
        country: 'Colombia',
      }),
    ])

    expect(summary.total).toBe(3)
    expect(summary.withErrors).toBe(1)
    expect(summary.withWarnings).toBe(1)
    expect(summary.byCode.EMPTY_RECORD).toBe(1)
    expect(summary.byCode.ONLY_CLIENT).toBe(1)
  })
})
