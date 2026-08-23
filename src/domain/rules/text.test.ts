import { describe, expect, it } from 'vitest'

import { canonicalize, cellToString, containsWord, stripDiacritics } from './text'

describe('stripDiacritics', () => {
  it('quita acentos y enies', () => {
    expect(stripDiacritics('DIRECCIÓN')).toBe('DIRECCION')
    expect(stripDiacritics('Compañía')).toBe('Compania')
    expect(stripDiacritics('Bogotá')).toBe('Bogota')
  })
})

describe('canonicalize', () => {
  it('normaliza mayusculas, acentos y separadores', () => {
    expect(canonicalize('CÓDIGO_POSTAL')).toBe('codigo postal')
    expect(canonicalize('  Nombre   del  Local ')).toBe('nombre del local')
    expect(canonicalize('Address-Line/1')).toBe('address line 1')
  })

  it('devuelve cadena vacia para encabezados sin contenido util', () => {
    expect(canonicalize('')).toBe('')
    expect(canonicalize('   ')).toBe('')
    expect(canonicalize('---')).toBe('')
  })
})

describe('containsWord', () => {
  it('exige palabras completas', () => {
    expect(containsWord('codigo postal', 'postal')).toBe(true)
    expect(containsWord('codigo postal', 'post')).toBe(false)
  })

  it('soporta frases de varias palabras', () => {
    expect(containsWord('nombre del punto de venta', 'punto de venta')).toBe(true)
    expect(containsWord('punto venta', 'punto de venta')).toBe(false)
  })

  it('no coincide con cadena vacia', () => {
    expect(containsWord('cualquier cosa', '')).toBe(false)
  })
})

describe('cellToString', () => {
  it('maneja tipos primitivos', () => {
    expect(cellToString('  Olimpica  ')).toBe('Olimpica')
    expect(cellToString(110111)).toBe('110111')
    expect(cellToString(null)).toBe('')
    expect(cellToString(undefined)).toBe('')
  })

  it('extrae el resultado de celdas con formula', () => {
    expect(cellToString({ formula: 'A1&B1', result: 'Toks Centro' })).toBe('Toks Centro')
  })

  it('extrae el texto de hipervinculos', () => {
    expect(cellToString({ text: 'Ver mapa', hyperlink: 'https://example.com' })).toBe('Ver mapa')
  })

  it('concatena rich text', () => {
    expect(cellToString({ richText: [{ text: 'Star' }, { text: 'bucks' }] })).toBe('Starbucks')
  })
})
