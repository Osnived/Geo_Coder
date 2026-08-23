import { describe, expect, it } from 'vitest'

import { makeRecord } from '@/test/factories'

import { noopAssistant, sanitizeColumnSuggestions, sanitizeQuerySuggestions } from './aiAssistant'

const HEADERS = ['NOMBRE PDV', 'ZONA COMERCIAL']

describe('noopAssistant', () => {
  it('no sugiere nada: la IA esta apagada de fabrica', async () => {
    expect(await noopAssistant.mapUnknownColumns(HEADERS)).toEqual([])
    expect(await noopAssistant.suggestQueries(makeRecord({ client: 'Toks' }), [])).toEqual([])
  })
})

describe('sanitizeColumnSuggestions', () => {
  it('acepta sugerencias validas', () => {
    const result = sanitizeColumnSuggestions(
      [{ header: 'NOMBRE PDV', field: 'location_name', confidence: 0.8 }],
      HEADERS,
    )

    expect(result).toEqual([{ header: 'NOMBRE PDV', field: 'location_name', confidence: 0.8 }])
  })

  it('descarta encabezados que no se preguntaron', () => {
    const result = sanitizeColumnSuggestions(
      [{ header: 'INVENTADO', field: 'city', confidence: 1 }],
      HEADERS,
    )
    expect(result).toEqual([])
  })

  it('descarta campos que no existen', () => {
    const result = sanitizeColumnSuggestions(
      [{ header: 'NOMBRE PDV', field: 'telefono', confidence: 1 }],
      HEADERS,
    )
    expect(result).toEqual([])
  })

  it('no permite dos columnas para el mismo campo', () => {
    const result = sanitizeColumnSuggestions(
      [
        { header: 'NOMBRE PDV', field: 'city', confidence: 0.9 },
        { header: 'ZONA COMERCIAL', field: 'city', confidence: 0.8 },
      ],
      HEADERS,
    )
    expect(result).toHaveLength(1)
  })

  it('no repite el mismo encabezado', () => {
    const result = sanitizeColumnSuggestions(
      [
        { header: 'NOMBRE PDV', field: 'location_name', confidence: 0.9 },
        { header: 'NOMBRE PDV', field: 'client', confidence: 0.8 },
      ],
      HEADERS,
    )
    expect(result).toHaveLength(1)
  })

  it('acota la confianza al rango 0..1', () => {
    const result = sanitizeColumnSuggestions(
      [
        { header: 'NOMBRE PDV', field: 'location_name', confidence: 7 },
        { header: 'ZONA COMERCIAL', field: 'region', confidence: -3 },
      ],
      HEADERS,
    )

    expect(result[0]?.confidence).toBe(1)
    expect(result[1]?.confidence).toBe(0)
  })

  it('usa 0.5 si la confianza no es un numero', () => {
    const result = sanitizeColumnSuggestions(
      [{ header: 'NOMBRE PDV', field: 'location_name', confidence: 'alta' }],
      HEADERS,
    )
    expect(result[0]?.confidence).toBe(0.5)
  })

  it('tolera basura', () => {
    expect(sanitizeColumnSuggestions(null, HEADERS)).toEqual([])
    expect(sanitizeColumnSuggestions('texto', HEADERS)).toEqual([])
    expect(sanitizeColumnSuggestions([1, null, 'x'], HEADERS)).toEqual([])
  })
})

describe('sanitizeQuerySuggestions', () => {
  it('acepta consultas nuevas', () => {
    const result = sanitizeQuerySuggestions(['Toks Coyoacan, CDMX', 'Toks Centro'], [])
    expect(result).toEqual(['Toks Coyoacan, CDMX', 'Toks Centro'])
  })

  it('descarta las que ya se intentaron, sin distinguir mayusculas', () => {
    const result = sanitizeQuerySuggestions(['toks centro'], ['Toks Centro'])
    expect(result).toEqual([])
  })

  it('no repite entre las propuestas', () => {
    expect(sanitizeQuerySuggestions(['Toks', 'toks '], [])).toEqual(['Toks'])
  })

  it('descarta cadenas demasiado cortas o largas', () => {
    const result = sanitizeQuerySuggestions(['ab', 'x'.repeat(400), 'Toks Centro'], [])
    expect(result).toEqual(['Toks Centro'])
  })

  it('respeta el tope de propuestas', () => {
    const result = sanitizeQuerySuggestions(['uno largo', 'dos largo', 'tres largo'], [], 2)
    expect(result).toHaveLength(2)
  })

  it('normaliza espacios', () => {
    expect(sanitizeQuerySuggestions(['  Toks   Centro  '], [])).toEqual(['Toks Centro'])
  })

  it('tolera basura', () => {
    expect(sanitizeQuerySuggestions(null, [])).toEqual([])
    expect(sanitizeQuerySuggestions([1, {}, null], [])).toEqual([])
  })
})
