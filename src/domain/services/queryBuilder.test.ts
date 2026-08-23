import { describe, expect, it } from 'vitest'

import { makeRecord } from '@/test/factories'

import { buildQueries, isSearchable, resolveCountry } from './queryBuilder'

const COLOMBIA = { name: 'Colombia', code: 'CO' }

describe('buildQueries', () => {
  it('usa toda la informacion disponible en la primera estrategia', () => {
    const record = makeRecord({
      client: 'Olimpica',
      business_type: 'Tienda',
      location_name: 'Olimpica Calle 72',
      address: 'Cra. 53 #75-140',
      city: 'Barranquilla',
      region: 'Atlantico',
      postal_code: '080020',
      country: 'Colombia',
    })

    const [first] = buildQueries(record, { sessionCountry: COLOMBIA })

    expect(first?.text).toBe(
      'Olimpica Calle 72, Cra. 53 #75-140, 080020, Barranquilla, Atlantico, Colombia',
    )
    expect(first?.strategy).toBe(0)
    expect(first?.templateId).toBe('name+address+locality')
    expect(first?.country).toEqual(COLOMBIA)
  })

  it('genera estrategias alternativas cada vez mas genericas', () => {
    const record = makeRecord({
      client: 'Olimpica',
      location_name: 'Olimpica Calle 72',
      address: 'Cra. 53 #75-140',
      city: 'Barranquilla',
      country: 'Colombia',
    })

    const queries = buildQueries(record, { sessionCountry: COLOMBIA })

    expect(queries.length).toBeGreaterThan(1)
    expect(queries.map((query) => query.strategy)).toEqual([0, 1, 2, 3])
    // La primera incluye mas campos que la ultima.
    const firstFields = queries[0]?.usedFields.length ?? 0
    const lastFields = queries[queries.length - 1]?.usedFields.length ?? 0
    expect(firstFields).toBeGreaterThan(lastFields)
  })

  it('funciona con cliente + nombre + ciudad + pais', () => {
    const record = makeRecord({
      client: 'Toks',
      location_name: 'Toks Plaza Universidad',
      city: 'Ciudad de Mexico',
    })

    const [first] = buildQueries(record, { sessionCountry: { name: 'Mexico', code: 'MX' } })

    expect(first?.text).toBe('Toks, Toks Plaza Universidad, Ciudad de Mexico, Mexico')
    expect(first?.usedFields).toEqual(['client', 'location_name', 'city'])
  })

  it('funciona con nombre + direccion + ciudad + pais', () => {
    const record = makeRecord({
      location_name: 'Starbucks Reforma 222',
      address: 'Paseo de la Reforma 222',
      city: 'Ciudad de Mexico',
    })

    const [first] = buildQueries(record, { sessionCountry: { name: 'Mexico', code: 'MX' } })

    expect(first?.templateId).toBe('name+address+locality')
    expect(first?.text).toContain('Paseo de la Reforma 222')
  })

  it('funciona con cliente + nombre + pais, sin ciudad', () => {
    const record = makeRecord({ client: 'Chedraui', location_name: 'Chedraui Coyoacan' })
    const queries = buildQueries(record, { sessionCountry: { name: 'Mexico', code: 'MX' } })

    expect(queries).not.toHaveLength(0)
    expect(queries[0]?.text).toBe('Chedraui Coyoacan, Mexico')
  })

  it('no repite consultas equivalentes', () => {
    const record = makeRecord({ location_name: 'Exito Country', city: 'Bogota' })
    const queries = buildQueries(record, { sessionCountry: COLOMBIA })
    const texts = queries.map((query) => query.text)

    expect(new Set(texts).size).toBe(texts.length)
  })

  it('respeta el tope de estrategias', () => {
    const record = makeRecord({
      client: 'Olimpica',
      business_type: 'Tienda',
      location_name: 'Olimpica Calle 72',
      address: 'Cra. 53 #75-140',
      city: 'Barranquilla',
      region: 'Atlantico',
      postal_code: '080020',
    })

    expect(buildQueries(record, { maxQueries: 2 })).toHaveLength(2)
  })

  it('devuelve una lista vacia si no hay nada que buscar', () => {
    expect(buildQueries(makeRecord({}))).toEqual([])
    expect(buildQueries(makeRecord({ business_type: 'Tienda' }))).toEqual([])
    expect(isSearchable(makeRecord({}))).toBe(false)
  })

  it('busca por ciudad sola cuando es lo unico que hay', () => {
    const queries = buildQueries(makeRecord({ city: 'Barranquilla' }), {
      sessionCountry: COLOMBIA,
    })

    expect(queries[0]?.text).toBe('Barranquilla, Colombia')
    expect(queries[0]?.templateId).toBe('city+region')
  })

  it('usa el tipo de establecimiento solo cuando no hay nombre de local', () => {
    const conNombre = buildQueries(
      makeRecord({
        client: 'Olimpica',
        business_type: 'Farmacia',
        location_name: 'Olimpica Prado',
        city: 'Barranquilla',
      }),
    )
    const sinNombre = buildQueries(
      makeRecord({ client: 'Olimpica', business_type: 'Farmacia', city: 'Barranquilla' }),
    )

    expect(conNombre[0]?.usedFields).not.toContain('business_type')
    expect(sinNombre.some((query) => query.usedFields.includes('business_type'))).toBe(true)
  })

  it('omite el pais cuando no hay ninguno', () => {
    const queries = buildQueries(makeRecord({ location_name: 'Toks Centro', city: 'CDMX' }))

    expect(queries[0]?.text).toBe('Toks Centro, CDMX')
    expect(queries[0]?.country).toBeNull()
  })
})

describe('resolveCountry', () => {
  it('prefiere el pais del registro', () => {
    const record = makeRecord({ country: 'Mexico' })
    expect(resolveCountry(record, COLOMBIA)).toEqual({ name: 'Mexico', code: '' })
  })

  it('cae en el pais de la sesion cuando el registro no lo trae', () => {
    expect(resolveCountry(makeRecord({}), COLOMBIA)).toEqual(COLOMBIA)
  })

  it('conserva el codigo ISO cuando coinciden registro y sesion', () => {
    expect(resolveCountry(makeRecord({ country: 'colombia' }), COLOMBIA)).toEqual(COLOMBIA)
    expect(resolveCountry(makeRecord({ country: 'CO' }), COLOMBIA)).toEqual(COLOMBIA)
  })

  it('devuelve null si no hay pais por ningun lado', () => {
    expect(resolveCountry(makeRecord({}), null)).toBeNull()
  })
})
