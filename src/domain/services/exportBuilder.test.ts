import { describe, expect, it } from 'vitest'

import { FIXED_NOW, makeRecord } from '@/test/factories'

import type { GeocodeResult } from '../models/geocode'
import type { EstablishmentRecord } from '../models/record'

import { buildExport, collectOriginalColumns } from './exportBuilder'

function result(overrides: Partial<GeocodeResult> = {}): GeocodeResult {
  return {
    latitude: 11.0057,
    longitude: -74.8139,
    matchedName: 'Olimpica',
    matchedAddress: 'Olimpica, Carrera 52, Barranquilla',
    provider: 'nominatim',
    confidence: 0.834,
    queryUsed: 'Olimpica Prado, Barranquilla, Colombia',
    manuallyVerified: false,
    candidates: [],
    attempts: [],
    notes: [],
    resolvedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function imported(
  original: Record<string, unknown>,
  overrides: Partial<EstablishmentRecord> = {},
): EstablishmentRecord {
  return {
    ...makeRecord({ client: 'Olimpica', location_name: 'Olimpica Prado' }),
    id: 'r-1',
    source: 'excel',
    original,
    ...overrides,
  }
}

describe('collectOriginalColumns', () => {
  it('reune las columnas de todos los registros sin repetir', () => {
    const columns = collectOriginalColumns([
      imported({ CLIENTE: 'a', CIUDAD: 'b' }),
      imported({ CIUDAD: 'c', VENTAS: 1 }, { id: 'r-2' }),
    ])

    expect(columns).toEqual(['CLIENTE', 'CIUDAD', 'VENTAS'])
  })

  it('devuelve lista vacia si solo hay registros manuales', () => {
    expect(collectOriginalColumns([makeRecord({ client: 'Toks' })])).toEqual([])
  })
})

describe('buildExport', () => {
  it('conserva las columnas originales al principio y en su orden', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica', VENTAS: 15000 })])

    expect(sheet.headers.slice(0, 2)).toEqual(['CLIENTE', 'VENTAS'])
    expect(sheet.rows[0]?.slice(0, 2)).toEqual(['Olimpica', 15000])
  })

  it('anade los campos normalizados ademas de los originales', () => {
    const sheet = buildExport([imported({ CLIENTE: 'OLIMPICA S.A.' })])

    const clientIndex = sheet.headers.indexOf('client')
    expect(clientIndex).toBeGreaterThan(0)
    // El original se conserva aunque el normalizado se haya corregido.
    expect(sheet.rows[0]?.[0]).toBe('OLIMPICA S.A.')
    expect(sheet.rows[0]?.[clientIndex]).toBe('Olimpica')
  })

  it('anade las columnas de resultado que pide la especificacion', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })])

    for (const column of [
      'latitude',
      'longitude',
      'matched_name',
      'matched_address',
      'provider',
      'confidence',
      'status',
      'query_used',
      'manually_verified',
    ]) {
      expect(sheet.headers, `falta la columna ${column}`).toContain(column)
    }
  })

  it('vuelca el resultado cuando existe', () => {
    const sheet = buildExport([
      imported({ CLIENTE: 'Olimpica' }, { status: 'FOUND', result: result() }),
    ])
    const value = (column: string) => sheet.rows[0]?.[sheet.headers.indexOf(column)]

    expect(value('latitude')).toBe(11.0057)
    expect(value('longitude')).toBe(-74.8139)
    expect(value('matched_name')).toBe('Olimpica')
    expect(value('provider')).toBe('nominatim')
    expect(value('confidence')).toBe(83)
    expect(value('status')).toBe('FOUND')
    expect(value('query_used')).toBe('Olimpica Prado, Barranquilla, Colombia')
    expect(value('manually_verified')).toBe('NO')
  })

  it('deja vacias las columnas de resultado si no hay resultado', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })])
    const value = (column: string) => sheet.rows[0]?.[sheet.headers.indexOf(column)]

    expect(value('latitude')).toBe('')
    expect(value('confidence')).toBe('')
    expect(value('status')).toBe('PENDING')
  })

  it('marca la verificacion manual', () => {
    const sheet = buildExport([
      imported(
        { CLIENTE: 'Olimpica' },
        { status: 'MANUALLY_VERIFIED', result: result({ manuallyVerified: true }) },
      ),
    ])

    expect(sheet.rows[0]?.[sheet.headers.indexOf('manually_verified')]).toBe('SI')
  })

  it('no pisa una columna original que ya se llame igual', () => {
    const sheet = buildExport([imported({ latitude: 'valor original', client: 'texto' })])

    expect(sheet.headers).toContain('latitude')
    expect(sheet.headers).toContain('latitude_geo')
    expect(sheet.headers).toContain('client_geo')
    expect(sheet.rows[0]?.[sheet.headers.indexOf('latitude')]).toBe('valor original')
  })

  it('exporta registros manuales con sus campos aunque no tengan original', () => {
    const manual = makeRecord({ client: 'Toks', location_name: 'Toks Plaza Universidad' })
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' }), { ...manual, id: 'm-1' }])

    const row = sheet.rows[1]
    expect(row?.[sheet.headers.indexOf('CLIENTE')]).toBe('')
    expect(row?.[sheet.headers.indexOf('client')]).toBe('Toks')
    expect(row?.[sheet.headers.indexOf('source')]).toBe('manual')
  })

  it('incluye el identificador interno para trazabilidad', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })])
    expect(sheet.rows[0]?.[sheet.headers.indexOf('record_id')]).toBe('r-1')
  })

  it('permite exportar solo una seleccion', () => {
    const sheet = buildExport(
      [imported({ CLIENTE: 'a' }), imported({ CLIENTE: 'b' }, { id: 'r-2' })],
      { onlyIds: ['r-2'] },
    )

    expect(sheet.rows).toHaveLength(1)
    expect(sheet.rows[0]?.[0]).toBe('b')
  })

  it('todas las filas tienen tantas celdas como cabeceras', () => {
    const sheet = buildExport([
      imported({ CLIENTE: 'a', VENTAS: 1 }),
      imported({ CIUDAD: 'b' }, { id: 'r-2' }),
      makeRecord({ client: 'Toks' }),
    ])

    for (const row of sheet.rows) {
      expect(row).toHaveLength(sheet.headers.length)
    }
  })

  it('devuelve solo cabeceras si no hay registros', () => {
    const sheet = buildExport([])
    expect(sheet.rows).toEqual([])
    expect(sheet.headers).toContain('latitude')
  })
})

describe('lote y fechas en la exportacion', () => {
  const BATCH = {
    id: 'lote-test',
    label: 'tiendas.xlsx',
    source: 'excel' as const,
    sheetName: 'Hoja1',
    importedCount: 2,
    createdAt: '2026-03-01T10:00:00.000Z',
  }

  it('anade las columnas de lote y de fecha', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })], { batches: [BATCH] })

    for (const column of ['batch', 'batch_created_at', 'created_at', 'updated_at']) {
      expect(sheet.headers, `falta la columna ${column}`).toContain(column)
    }
  })

  it('escribe el nombre del lote con su hoja y su fecha', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })], { batches: [BATCH] })
    const value = (column: string) => sheet.rows[0]?.[sheet.headers.indexOf(column)]

    expect(value('batch')).toBe('tiendas.xlsx · Hoja1')
    expect(value('batch_created_at')).toBe('2026-03-01T10:00:00.000Z')
  })

  it('escribe la fecha de creacion y de modificacion del registro', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })], { batches: [BATCH] })
    const value = (column: string) => sheet.rows[0]?.[sheet.headers.indexOf(column)]

    expect(value('created_at')).toBe(FIXED_NOW)
    expect(value('updated_at')).toBe(FIXED_NOW)
  })

  it('cae en el id del lote si no se conoce su nombre', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })])
    expect(sheet.rows[0]?.[sheet.headers.indexOf('batch')]).toBe('lote-test')
  })
})
