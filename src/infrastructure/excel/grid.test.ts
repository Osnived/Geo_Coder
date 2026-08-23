import { describe, expect, it } from 'vitest'

import { ExcelReadError } from './errors'
import {
  buildPreview,
  buildSheetData,
  detectHeaderRowIndex,
  findEmptyColumns,
  isBlankRow,
  trimTrailingBlankRows,
} from './grid'

describe('isBlankRow', () => {
  it('considera vacias las filas con nulos y espacios', () => {
    expect(isBlankRow([null, '', '   ', undefined])).toBe(true)
    expect(isBlankRow([null, 0])).toBe(false)
  })
})

describe('trimTrailingBlankRows', () => {
  it('elimina el relleno final que arrastra Excel', () => {
    const grid = [['CIUDAD'], ['Bogota'], [null], ['  '], []]
    expect(trimTrailingBlankRows(grid)).toEqual([['CIUDAD'], ['Bogota']])
  })

  it('no toca las filas en blanco intermedias', () => {
    const grid = [['CIUDAD'], [null], ['Bogota']]
    expect(trimTrailingBlankRows(grid)).toHaveLength(3)
  })
})

describe('detectHeaderRowIndex', () => {
  it('elige la primera fila cuando la hoja empieza directo con encabezados', () => {
    expect(
      detectHeaderRowIndex([
        ['CLIENTE', 'CIUDAD'],
        ['Olimpica', 'Barranquilla'],
      ]),
    ).toBe(0)
  })

  it('salta un titulo suelto seguido de fila en blanco', () => {
    const grid = [
      ['REPORTE DE TIENDAS 2026', null, null],
      [null, null, null],
      ['CLIENTE', 'NOMBRE', 'CIUDAD'],
      ['Olimpica', 'Olimpica Calle 72', 'Barranquilla'],
    ]
    expect(detectHeaderRowIndex(grid)).toBe(2)
  })

  it('en empate se queda con la fila mas alta', () => {
    const grid = [
      ['A', 'B'],
      ['C', 'D'],
    ]
    expect(detectHeaderRowIndex(grid)).toBe(0)
  })

  it('falla si no hay ninguna celda con contenido', () => {
    expect(() =>
      detectHeaderRowIndex([
        [null, null],
        ['', '  '],
      ]),
    ).toThrow(ExcelReadError)
  })
})

describe('findEmptyColumns', () => {
  it('detecta columnas sin ningun dato', () => {
    const dataRows = [
      ['Olimpica', null, 'Barranquilla'],
      ['Olimpica', '   ', 'Cartagena'],
    ]
    expect(findEmptyColumns(dataRows, 3)).toEqual([1])
  })
})

describe('buildPreview', () => {
  const grid = [
    ['CLIENTE', 'CIUDAD', 'NOTAS'],
    ['Olimpica', 'Barranquilla', null],
    ['Olimpica', 'Cartagena', null],
    ['Olimpica', 'Santa Marta', null],
  ]

  it('devuelve encabezados, muestra y totales', () => {
    const preview = buildPreview('Hoja1', grid, { sampleSize: 2 })

    expect(preview.headerRowNumber).toBe(1)
    expect(preview.headers).toEqual(['CLIENTE', 'CIUDAD', 'NOTAS'])
    expect(preview.sampleRows).toHaveLength(2)
    expect(preview.totalDataRows).toBe(3)
    expect(preview.emptyColumnIndexes).toEqual([2])
  })

  it('acepta una fila de encabezado forzada por el usuario', () => {
    const preview = buildPreview('Hoja1', grid, { headerRowNumber: 2 })

    expect(preview.headers).toEqual(['Olimpica', 'Barranquilla', ''])
    expect(preview.totalDataRows).toBe(2)
  })

  it('falla en una hoja vacia', () => {
    expect(() => buildPreview('Hoja1', [[null], ['']])).toThrow(ExcelReadError)
  })
})

describe('buildSheetData', () => {
  it('produce la forma que consume el dominio', () => {
    const sheet = buildSheetData('tiendas.xlsx', 'Hoja1', [
      ['CLIENTE', 'CIUDAD'],
      ['Olimpica', 'Barranquilla'],
    ])

    expect(sheet).toEqual({
      fileName: 'tiendas.xlsx',
      sheetName: 'Hoja1',
      headers: ['CLIENTE', 'CIUDAD'],
      headerRowNumber: 1,
      rows: [['Olimpica', 'Barranquilla']],
    })
  })

  it('conserva encabezados duplicados tal cual', () => {
    const sheet = buildSheetData('t.xlsx', 'Hoja1', [
      ['CIUDAD', 'CIUDAD'],
      ['Bogota', 'Medellin'],
    ])
    expect(sheet.headers).toEqual(['CIUDAD', 'CIUDAD'])
  })
})
