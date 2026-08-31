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

describe('valores por defecto de una carga', () => {
  const SHEET: SheetData = {
    fileName: 'tiendas.xlsx',
    sheetName: 'Hoja1',
    headers: ['NOMBRE', 'CIUDAD'],
    headerRowNumber: 1,
    rows: [
      ['Olimpica Prado', 'Barranquilla'],
      ['Olimpica Calle 72', 'Barranquilla'],
    ],
  }
  const MAPPING = ['location_name', 'city'] as const

  it('rellena el cliente en todos los registros de la carga', () => {
    const { records } = normalizeSheet(SHEET, MAPPING, {
      ...testOptions(),
      defaults: { client: 'Olimpica' },
    })

    expect(records.map((record) => record.fields.client)).toEqual(['Olimpica', 'Olimpica'])
  })

  it('rellena tambien el tipo de establecimiento', () => {
    const { records } = normalizeSheet(SHEET, MAPPING, {
      ...testOptions(),
      defaults: { business_type: 'supermercado' },
    })

    expect(records[0]?.fields.business_type).toBe('supermercado')
  })

  /** Principio 2: los datos de entrada no se modifican. */
  it('no pisa el valor que si trae la fila', () => {
    const sheet: SheetData = {
      ...SHEET,
      headers: ['CLIENTE', 'NOMBRE'],
      rows: [
        ['Exito', 'Exito Country'],
        ['', 'Olimpica Prado'],
      ],
    }

    const { records } = normalizeSheet(sheet, ['client', 'location_name'], {
      ...testOptions(),
      defaults: { client: 'Olimpica' },
    })

    // La primera fila conserva el suyo; la segunda recibe el valor por defecto.
    expect(records.map((record) => record.fields.client)).toEqual(['Exito', 'Olimpica'])
  })

  it('no toca los datos originales del archivo', () => {
    const { records } = normalizeSheet(SHEET, MAPPING, {
      ...testOptions(),
      defaults: { client: 'Olimpica' },
    })

    // La fila cruda no tenia columna de cliente y sigue sin tenerla.
    expect(Object.keys(records[0]?.original ?? {})).toEqual(['NOMBRE', 'CIUDAD'])
  })

  it('un valor por defecto vacio no hace nada', () => {
    const { records } = normalizeSheet(SHEET, MAPPING, {
      ...testOptions(),
      defaults: { client: '   ' },
    })

    expect(records[0]?.fields.client).toBe('')
  })

  it('normaliza los espacios del valor escrito a mano', () => {
    const { records } = normalizeSheet(SHEET, MAPPING, {
      ...testOptions(),
      defaults: { client: '  Olimpica   S.A.  ' },
    })

    expect(records[0]?.fields.client).toBe('Olimpica S.A.')
  })

  it('sin defaults se comporta como antes', () => {
    const { records } = normalizeSheet(SHEET, MAPPING, testOptions())

    expect(records[0]?.fields.client).toBe('')
  })

  it('convive con el pais por defecto', () => {
    const { records } = normalizeSheet(SHEET, MAPPING, {
      ...testOptions(),
      defaultCountry: { name: 'Colombia', code: 'CO' },
      defaults: { client: 'Olimpica' },
    })

    expect(records[0]?.fields.client).toBe('Olimpica')
    expect(records[0]?.fields.country).toBe('Colombia')
  })

  it('las filas en blanco siguen sin generar registro', () => {
    const sheet: SheetData = {
      ...SHEET,
      rows: [
        ['', ''],
        ['Olimpica Prado', 'Barranquilla'],
      ],
    }
    const { records, skippedBlankRows } = normalizeSheet(sheet, MAPPING, {
      ...testOptions(),
      defaults: { client: 'Olimpica' },
    })

    // Un valor por defecto no debe resucitar una fila vacia.
    expect(records).toHaveLength(1)
    expect(skippedBlankRows).toHaveLength(1)
  })

  it('tambien aplica a la entrada manual', () => {
    const record = normalizeManualEntry(
      { location_name: 'Olimpica Prado' },
      { ...testOptions(), defaults: { client: 'Olimpica' } },
    )

    expect(record.fields.client).toBe('Olimpica')
  })
})
