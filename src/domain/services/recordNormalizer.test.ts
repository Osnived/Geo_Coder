import { describe, expect, it } from 'vitest'

import { testOptions } from '@/test/factories'

import type { ColumnAssignment, SheetData } from './recordNormalizer'
import {
  buildOriginalKeys,
  duplicateRecord,
  normalizeManualEntry,
  normalizeSheet,
  updateRecordFields,
} from './recordNormalizer'

function sheet(overrides: Partial<SheetData> = {}): SheetData {
  return {
    fileName: 'tiendas.xlsx',
    sheetName: 'Hoja1',
    headers: ['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD'],
    headerRowNumber: 1,
    rows: [
      ['Olimpica', 'Olimpica Calle 72', 'Barranquilla'],
      ['Olimpica', 'Olimpica Prado', 'Barranquilla'],
    ],
    ...overrides,
  }
}

const BASIC_ASSIGNMENT: ColumnAssignment = ['client', 'location_name', 'city']

describe('buildOriginalKeys', () => {
  it('desambigua encabezados duplicados', () => {
    expect(buildOriginalKeys(['CIUDAD', 'CIUDAD', 'CIUDAD'])).toEqual([
      'CIUDAD',
      'CIUDAD (2)',
      'CIUDAD (3)',
    ])
  })

  it('nombra las columnas sin encabezado por su posicion', () => {
    expect(buildOriginalKeys(['CIUDAD', '', '  '])).toEqual(['CIUDAD', 'Columna 2', 'Columna 3'])
  })
})

describe('normalizeSheet', () => {
  it('produce un registro por fila con los campos mapeados', () => {
    const { records } = normalizeSheet(sheet(), BASIC_ASSIGNMENT, testOptions())

    expect(records).toHaveLength(2)
    expect(records[0]?.fields.client).toBe('Olimpica')
    expect(records[0]?.fields.location_name).toBe('Olimpica Calle 72')
    expect(records[0]?.fields.city).toBe('Barranquilla')
    expect(records[0]?.fields.address).toBe('')
    expect(records[0]?.status).toBe('PENDING')
    expect(records[0]?.source).toBe('excel')
  })

  it('asigna identificadores unicos', () => {
    const { records } = normalizeSheet(sheet(), BASIC_ASSIGNMENT, testOptions())
    expect(new Set(records.map((record) => record.id)).size).toBe(2)
  })

  it('conserva intacta la fila original, incluidas las columnas ignoradas', () => {
    const data = sheet({
      headers: ['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD', 'VENTAS'],
      rows: [['Olimpica', 'Olimpica Calle 72', 'Barranquilla', 15000]],
    })
    const { records } = normalizeSheet(data, [...BASIC_ASSIGNMENT, null], testOptions())

    expect(records[0]?.original).toEqual({
      CLIENTE: 'Olimpica',
      'NOMBRE DEL LOCAL': 'Olimpica Calle 72',
      CIUDAD: 'Barranquilla',
      VENTAS: 15000,
    })
  })

  it('registra el origen de cada fila para trazabilidad', () => {
    const { records } = normalizeSheet(sheet(), BASIC_ASSIGNMENT, testOptions())

    expect(records[0]?.origin).toEqual({
      fileName: 'tiendas.xlsx',
      sheetName: 'Hoja1',
      rowNumber: 2,
    })
    expect(records[1]?.origin?.rowNumber).toBe(3)
  })

  it('respeta encabezados que no estan en la primera fila', () => {
    const data = sheet({ headerRowNumber: 5 })
    const { records } = normalizeSheet(data, BASIC_ASSIGNMENT, testOptions())
    expect(records[0]?.origin?.rowNumber).toBe(6)
  })

  it('omite filas completamente en blanco y las reporta', () => {
    const data = sheet({
      rows: [
        ['Olimpica', 'Olimpica Calle 72', 'Barranquilla'],
        [null, '', '   '],
        ['Olimpica', 'Olimpica Prado', 'Barranquilla'],
      ],
    })
    const { records, skippedBlankRows } = normalizeSheet(data, BASIC_ASSIGNMENT, testOptions())

    expect(records).toHaveLength(2)
    expect(skippedBlankRows).toEqual([3])
  })

  it('genera un registro vacio, no lo descarta, si la fila solo tiene columnas ignoradas', () => {
    const data = sheet({
      headers: ['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD', 'NOTAS'],
      rows: [[null, null, null, 'revisar despues']],
    })
    const { records, skippedBlankRows } = normalizeSheet(
      data,
      [...BASIC_ASSIGNMENT, null],
      testOptions(),
    )

    expect(skippedBlankRows).toEqual([])
    expect(records).toHaveLength(1)
    expect(records[0]?.fields.client).toBe('')
    expect(records[0]?.original.NOTAS).toBe('revisar despues')
  })

  it('concatena varias columnas mapeadas al mismo campo', () => {
    const data = sheet({
      headers: ['DIRECCION 1', 'DIRECCION 2'],
      rows: [['Calle 72 #45-10', 'Local 3']],
    })
    const { records } = normalizeSheet(data, ['address', 'address'], testOptions())

    expect(records[0]?.fields.address).toBe('Calle 72 #45-10 Local 3')
  })

  it('convierte celdas no textuales a texto', () => {
    const data = sheet({
      headers: ['NOMBRE DEL LOCAL', 'CP'],
      rows: [[{ formula: 'A1', result: 'Toks Centro' }, 80020]],
    })
    const { records } = normalizeSheet(data, ['location_name', 'postal_code'], testOptions())

    expect(records[0]?.fields.location_name).toBe('Toks Centro')
    expect(records[0]?.fields.postal_code).toBe('80020')
  })

  it('aplica el pais por defecto solo cuando la fila no trae uno', () => {
    const data = sheet({
      headers: ['NOMBRE DEL LOCAL', 'PAIS'],
      rows: [
        ['Toks Plaza Universidad', ''],
        ['Starbucks Reforma', 'Mexico'],
      ],
    })
    const options = testOptions({ defaultCountry: { name: 'Colombia', code: 'CO' } })
    const { records } = normalizeSheet(data, ['location_name', 'country'], options)

    expect(records[0]?.fields.country).toBe('Colombia')
    expect(records[1]?.fields.country).toBe('Mexico')
  })

  it('devuelve una lista vacia para una hoja sin filas', () => {
    const { records, skippedBlankRows } = normalizeSheet(
      sheet({ rows: [] }),
      BASIC_ASSIGNMENT,
      testOptions(),
    )

    expect(records).toEqual([])
    expect(skippedBlankRows).toEqual([])
  })
})

describe('normalizeManualEntry', () => {
  it('produce exactamente el mismo modelo que Excel', () => {
    const record = normalizeManualEntry(
      { client: 'Toks', business_type: 'Restaurante', location_name: '  Toks Plaza Universidad  ' },
      testOptions(),
    )

    expect(record.source).toBe('manual')
    expect(record.origin).toBeNull()
    expect(record.original).toEqual({})
    expect(record.status).toBe('PENDING')
    expect(record.fields.location_name).toBe('Toks Plaza Universidad')
    expect(record.fields.city).toBe('')
    expect(Object.keys(record.fields).sort()).toEqual([
      'address',
      'business_type',
      'city',
      'client',
      'country',
      'location_name',
      'postal_code',
      'region',
    ])
  })

  it('aplica el pais por defecto', () => {
    const record = normalizeManualEntry(
      { location_name: 'Olimpica Prado' },
      testOptions({ defaultCountry: { name: 'Colombia', code: 'CO' } }),
    )
    expect(record.fields.country).toBe('Colombia')
  })
})

describe('duplicateRecord', () => {
  it('copia los campos con un id nuevo y estado inicial', () => {
    const original = normalizeManualEntry({ location_name: 'Chedraui Coyoacan' }, testOptions())
    const copy = duplicateRecord(original, testOptions({ newId: () => 'copia-1' }))

    expect(copy.id).toBe('copia-1')
    expect(copy.id).not.toBe(original.id)
    expect(copy.fields).toEqual(original.fields)
    expect(copy.status).toBe('PENDING')
    expect(copy.result).toBeNull()
  })

  it('no comparte referencia de campos con el original', () => {
    const original = normalizeManualEntry({ city: 'CDMX' }, testOptions())
    const copy = duplicateRecord(original, testOptions())

    expect(copy.fields).not.toBe(original.fields)
  })
})

describe('updateRecordFields', () => {
  it('modifica solo los campos indicados y conserva id y origen', () => {
    const original = normalizeManualEntry({ client: 'Walmart', city: 'Puebla' }, testOptions())
    const updated = updateRecordFields(
      original,
      { city: '  Guadalajara  ' },
      { now: () => '2026-02-02T00:00:00.000Z' },
    )

    expect(updated.id).toBe(original.id)
    expect(updated.fields.client).toBe('Walmart')
    expect(updated.fields.city).toBe('Guadalajara')
    expect(updated.createdAt).toBe(original.createdAt)
    expect(updated.updatedAt).toBe('2026-02-02T00:00:00.000Z')
  })

  it('nunca toca los datos originales importados', () => {
    const data = sheet({ rows: [['Olimpica', 'Olimpica Calle 72', 'Barranquilla']] })
    const { records } = normalizeSheet(data, BASIC_ASSIGNMENT, testOptions())
    const record = records[0]
    if (!record) throw new Error('se esperaba un registro')

    const updated = updateRecordFields(record, { city: 'Cartagena' }, { now: () => 'ahora' })

    expect(updated.fields.city).toBe('Cartagena')
    expect(updated.original.CIUDAD).toBe('Barranquilla')
  })
})
