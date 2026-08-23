import { describe, expect, it } from 'vitest'

import { readWorkbook } from './workbookReader'
import { exportFileName, writeSheetToBlob } from './workbookWriter'

const SHEET = {
  headers: ['CLIENTE', 'CIUDAD', 'latitude', 'longitude', 'status'],
  rows: [
    ['Olímpica', 'Barranquilla', 11.0057, -74.8139, 'FOUND'],
    ['Toks', 'Ciudad de México', '', '', 'PENDING'],
  ],
}

describe('writeSheetToBlob', () => {
  it('produce un xlsx que se puede volver a leer', async () => {
    const blob = await writeSheetToBlob(SHEET)
    const workbook = await readWorkbook({
      fileName: 'salida.xlsx',
      buffer: await blob.arrayBuffer(),
    })

    const sheet = workbook.readSheet(workbook.sheets[0]?.name ?? '')
    expect(sheet.headers).toEqual(SHEET.headers)
    expect(sheet.rows[0]?.[0]).toBe('Olímpica')
    expect(sheet.rows[0]?.[2]).toBe(11.0057)
    expect(sheet.rows[1]?.[0]).toBe('Toks')
  })

  it('conserva los numeros como numeros', async () => {
    const blob = await writeSheetToBlob(SHEET)
    const workbook = await readWorkbook({
      fileName: 'salida.xlsx',
      buffer: await blob.arrayBuffer(),
    })
    const sheet = workbook.readSheet(workbook.sheets[0]?.name ?? '')

    expect(typeof sheet.rows[0]?.[3]).toBe('number')
  })

  it('respeta el nombre de hoja indicado', async () => {
    const blob = await writeSheetToBlob(SHEET, { sheetName: 'Tiendas' })
    const workbook = await readWorkbook({
      fileName: 'salida.xlsx',
      buffer: await blob.arrayBuffer(),
    })

    expect(workbook.sheets[0]?.name).toBe('Tiendas')
  })

  it('funciona con una hoja sin filas', async () => {
    const blob = await writeSheetToBlob({ headers: ['a', 'b'], rows: [] })
    const workbook = await readWorkbook({
      fileName: 'vacio.xlsx',
      buffer: await blob.arrayBuffer(),
    })

    expect(workbook.readSheet('Resultados').headers).toEqual(['a', 'b'])
  })
})

describe('exportFileName', () => {
  it('incluye una marca temporal utilizable como nombre de archivo', () => {
    const name = exportFileName('geolocator', new Date('2026-03-01T14:30:05.000Z'))
    expect(name).toBe('geolocator-2026-03-01-14-30-05.xlsx')
  })
})
