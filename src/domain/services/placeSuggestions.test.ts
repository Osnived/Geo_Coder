import { describe, expect, it } from 'vitest'

import type { PlaceKind, PlaceSuggestion } from './placeProvider'
import {
  describeSuggestion,
  isQueryWorthSending,
  MAX_SUGGESTIONS,
  MIN_QUERY_LENGTH,
  refineSuggestions,
  regionOf,
} from './placeSuggestions'

const COLOMBIA = { name: 'Colombia', code: 'CO' }

function suggestion(name: string, overrides: Partial<PlaceSuggestion> = {}): PlaceSuggestion {
  return {
    name,
    kind: 'city' as PlaceKind,
    region: 'Atlántico',
    countryCode: 'CO',
    countryName: 'Colombia',
    ...overrides,
  }
}

const names = (result: readonly PlaceSuggestion[]) => result.map((entry) => entry.name)

describe('isQueryWorthSending', () => {
  it(`pide al menos ${String(MIN_QUERY_LENGTH)} caracteres`, () => {
    expect(isQueryWorthSending('ba')).toBe(false)
    expect(isQueryWorthSending('bar')).toBe(true)
  })

  it('no cuenta los espacios', () => {
    expect(isQueryWorthSending('  b  ')).toBe(false)
    expect(isQueryWorthSending('  bar  ')).toBe(true)
  })

  it('una cadena vacia no se envia', () => {
    expect(isQueryWorthSending('')).toBe(false)
  })
})

describe('filtrado por pais', () => {
  it('descarta las sugerencias de otro pais', () => {
    const result = refineSuggestions(
      [
        suggestion('Barranquilla'),
        suggestion('Barranco', { countryCode: 'PE', countryName: 'Perú' }),
        suggestion('Barran', { countryCode: 'FR', countryName: 'Francia' }),
      ],
      { country: COLOMBIA },
    )

    expect(names(result)).toEqual(['Barranquilla'])
  })

  /** Misma regla que el scoring: solo se descarta si ambos codigos se conocen. */
  it('conserva la sugerencia sin pais informado', () => {
    const result = refineSuggestions([suggestion('Sin pais', { countryCode: '' })], {
      country: COLOMBIA,
    })

    expect(names(result)).toEqual(['Sin pais'])
  })

  it('sin pais de referencia no filtra nada', () => {
    const result = refineSuggestions(
      [suggestion('Barranquilla'), suggestion('Barranco', { countryCode: 'PE' })],
      { country: null },
    )

    expect(result).toHaveLength(2)
  })

  it('compara el codigo sin distinguir mayusculas', () => {
    const result = refineSuggestions([suggestion('Barranquilla', { countryCode: 'CO' })], {
      country: { name: 'Colombia', code: 'co' },
    })

    expect(result).toHaveLength(1)
  })
})

describe('duplicados', () => {
  /**
   * OpenStreetMap devuelve el mismo municipio varias veces: el limite
   * administrativo, el nucleo urbano, la comuna.
   */
  it('quita los repetidos con el mismo nombre y region', () => {
    const result = refineSuggestions(
      [
        suggestion('Barrancabermeja', { region: 'Santander' }),
        suggestion('Barrancabermeja', { region: 'Santander' }),
      ],
      { country: COLOMBIA },
    )

    expect(result).toHaveLength(1)
  })

  it('ignora acentos y mayusculas al comparar', () => {
    const result = refineSuggestions(
      [
        suggestion('Medellín', { region: 'Antioquia' }),
        suggestion('MEDELLIN', { region: 'antioquia' }),
      ],
      { country: COLOMBIA },
    )

    expect(result).toHaveLength(1)
    // Se conserva el primero, que es el mejor situado por el proveedor.
    expect(result[0]?.name).toBe('Medellín')
  })

  /** Dos municipios homonimos en departamentos distintos son dos cosas. */
  it('conserva los homonimos de departamentos distintos', () => {
    const result = refineSuggestions(
      [
        suggestion('Barranquilla', { region: 'Atlántico' }),
        suggestion('Barranquilla', { region: 'Tolima' }),
      ],
      { country: COLOMBIA },
    )

    expect(result).toHaveLength(2)
  })

  it('descarta las sugerencias sin nombre', () => {
    const result = refineSuggestions([suggestion(''), suggestion('   '), suggestion('Cali')], {
      country: COLOMBIA,
    })

    expect(names(result)).toEqual(['Cali'])
  })
})

describe('tope de sugerencias', () => {
  it(`no devuelve mas de ${String(MAX_SUGGESTIONS)}`, () => {
    const many = Array.from({ length: 30 }, (_, index) => suggestion(`Ciudad ${String(index)}`))

    expect(refineSuggestions(many, { country: COLOMBIA })).toHaveLength(MAX_SUGGESTIONS)
  })

  it('respeta un tope propio', () => {
    const many = Array.from({ length: 30 }, (_, index) => suggestion(`Ciudad ${String(index)}`))

    expect(refineSuggestions(many, { country: COLOMBIA, limit: 3 })).toHaveLength(3)
  })

  it('conserva el orden del proveedor, que es su ranking', () => {
    const result = refineSuggestions(
      [suggestion('Primera'), suggestion('Segunda'), suggestion('Tercera')],
      { country: COLOMBIA, limit: 2 },
    )

    expect(names(result)).toEqual(['Primera', 'Segunda'])
  })

  it('el tope se cuenta despues de filtrar, no antes', () => {
    const result = refineSuggestions(
      [suggestion('Fuera', { countryCode: 'PE' }), suggestion('Dentro 1'), suggestion('Dentro 2')],
      { country: COLOMBIA, limit: 2 },
    )

    expect(names(result)).toEqual(['Dentro 1', 'Dentro 2'])
  })
})

describe('describeSuggestion', () => {
  it('una ciudad se describe con su departamento', () => {
    expect(describeSuggestion(suggestion('Barranquilla'))).toBe('Atlántico')
  })

  it('una region se describe con su pais', () => {
    expect(describeSuggestion(suggestion('Atlántico', { kind: 'region', region: '' }))).toBe(
      'Colombia',
    )
  })

  it('sin departamento no inventa nada', () => {
    expect(describeSuggestion(suggestion('Barranquilla', { region: '' }))).toBe('')
  })
})

describe('regionOf', () => {
  it('devuelve el departamento de una ciudad', () => {
    expect(regionOf(suggestion('Barranquilla'))).toBe('Atlántico')
  })

  /** Una region no esta dentro de otra region. */
  it('devuelve vacio si la sugerencia ya es una region', () => {
    expect(regionOf(suggestion('Atlántico', { kind: 'region', region: 'algo' }))).toBe('')
  })
})
