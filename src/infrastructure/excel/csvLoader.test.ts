import { describe, expect, it } from 'vitest'

import { decodeCsv, detectDelimiter, loadCsvGrid } from './csvLoader'

function utf8(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

function latin1(text: string): ArrayBuffer {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff
  }
  return bytes.buffer
}

describe('detectDelimiter', () => {
  it('reconoce la coma', () => {
    expect(detectDelimiter('CLIENTE,CIUDAD\nOlimpica,Barranquilla\n')).toBe(',')
  })

  it('reconoce el punto y coma de Excel en espanol', () => {
    expect(detectDelimiter('CLIENTE;CIUDAD\nOlimpica;Barranquilla\n')).toBe(';')
  })

  it('reconoce el tabulador', () => {
    expect(detectDelimiter('CLIENTE\tCIUDAD\nOlimpica\tBarranquilla\n')).toBe('\t')
  })

  it('no se confunde con comas dentro de campos entrecomillados', () => {
    const text = 'NOMBRE;DIRECCION\nToks;"Av. Universidad 1000, Local 5"\n'
    expect(detectDelimiter(text)).toBe(';')
  })

  it('prefiere el delimitador que parte de forma consistente', () => {
    const text = 'A;B;C\n1;2;3\n4;5;6\n'
    expect(detectDelimiter(text)).toBe(';')
  })

  it('cae en la coma cuando el archivo tiene una sola columna', () => {
    expect(detectDelimiter('CIUDAD\nBogota\n')).toBe(',')
  })
})

describe('decodeCsv', () => {
  it('lee UTF-8 directamente', () => {
    expect(decodeCsv(utf8('Bogotá'))).toBe('Bogotá')
  })

  it('reintenta con Windows-1252 cuando UTF-8 produce basura', () => {
    expect(decodeCsv(latin1('Bogotá'))).toBe('Bogotá')
  })
})

describe('loadCsvGrid', () => {
  it('devuelve la matriz cruda', () => {
    const grid = loadCsvGrid(utf8('CLIENTE;CIUDAD\nOlimpica;Barranquilla\n'))
    expect(grid[0]).toEqual(['CLIENTE', 'CIUDAD'])
    expect(grid[1]).toEqual(['Olimpica', 'Barranquilla'])
  })
})
