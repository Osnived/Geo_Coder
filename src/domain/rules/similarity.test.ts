import { describe, expect, it } from 'vitest'

import {
  containment,
  coverage,
  diceCoefficient,
  numbersIn,
  postalCodeSimilarity,
  similarity,
  tokens,
} from './similarity'

describe('tokens', () => {
  it('canoniza y descarta conectores', () => {
    expect(tokens('Parque Cultural del Caribe')).toEqual(['parque', 'cultural', 'caribe'])
  })

  it('expande abreviaturas de via', () => {
    expect(tokens('Cra. 53')).toEqual(['carrera', '53'])
    expect(tokens('Cll 72')).toEqual(['calle', '72'])
    expect(tokens('Av. Universidad')).toEqual(['avenida', 'universidad'])
  })

  it('devuelve lista vacia para texto sin contenido', () => {
    expect(tokens('  de la  ')).toEqual([])
  })
})

describe('diceCoefficient', () => {
  it('da 1 para conjuntos iguales', () => {
    expect(diceCoefficient(['a', 'b'], ['b', 'a'])).toBe(1)
  })

  it('da 0 sin palabras comunes', () => {
    expect(diceCoefficient(['a'], ['b'])).toBe(0)
  })

  it('da 0 con alguna lista vacia', () => {
    expect(diceCoefficient([], ['a'])).toBe(0)
  })
})

describe('containment', () => {
  it('mide que proporcion del primero esta en el segundo', () => {
    expect(containment(['olimpica'], ['supermercado', 'olimpica', 'prado'])).toBe(1)
    expect(containment(['olimpica', 'prado'], ['olimpica'])).toBe(0.5)
  })
})

describe('similarity', () => {
  it('reconoce un nombre contenido en un texto mas largo', () => {
    expect(similarity('Olímpica', 'Supermercado Olímpica Prado, Barranquilla')).toBe(1)
  })

  it('penaliza textos sin relacion', () => {
    expect(similarity('Olímpica Prado', 'Parque Cultural del Caribe')).toBe(0)
  })

  it('ignora acentos y mayusculas', () => {
    expect(similarity('Bogotá', 'BOGOTA')).toBe(1)
  })

  it('es 0 si alguno esta vacio', () => {
    expect(similarity('', 'Bogota')).toBe(0)
  })
})

describe('coverage', () => {
  it('mide cuanto del nombre aparece en la direccion', () => {
    expect(coverage('Olímpica Prado', 'Olímpica, Carrera 54, Alto Prado, Barranquilla')).toBe(1)
    expect(coverage('Olímpica Prado', 'Éxito, Carrera 54, Barranquilla')).toBe(0)
  })
})

describe('postalCodeSimilarity', () => {
  it('reconoce el codigo exacto pese al formato', () => {
    expect(postalCodeSimilarity('080 001', '08-0001')).toBe(1)
  })

  it('da media puntuacion a codigos con prefijo comun', () => {
    expect(postalCodeSimilarity('080001', '080020')).toBe(0.5)
  })

  it('da cero a codigos distintos', () => {
    expect(postalCodeSimilarity('080001', '110111')).toBe(0)
  })

  it('da cero si falta alguno', () => {
    expect(postalCodeSimilarity('', '080001')).toBe(0)
  })
})

describe('numbersIn', () => {
  it('extrae los numeros de una direccion', () => {
    expect(numbersIn('Cra. 54 #70-25')).toEqual(['54', '70', '25'])
  })

  it('descarta secuencias demasiado largas para ser un portal', () => {
    expect(numbersIn('id 1234567890')).toEqual([])
  })
})
