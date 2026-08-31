import { describe, expect, it } from 'vitest'

import type { ImportBatch } from '@/domain/models/batch'
import { emptyComponents } from '@/domain/models/geocode'
import type { EstablishmentRecord } from '@/domain/models/record'
import { buildExport } from '@/domain/services/exportBuilder'
import { readWorkbook } from '@/infrastructure/excel/workbookReader'
import { writeSheetToBlob } from '@/infrastructure/excel/workbookWriter'
import { makeRecord, makeResult } from '@/test/factories'

/**
 * Exportacion de verdad: se genera el .xlsx, se vuelve a leer y se comprueba lo
 * que hay dentro.
 *
 * `buildExport` ya esta probado como funcion pura, pero eso no dice nada sobre
 * si el archivo que acaba en el disco tiene las columnas separadas y los
 * numeros como numeros. Aqui se lee el archivo, no la estructura intermedia.
 */

const BARRANQUILLA: ImportBatch = {
  id: 'g-1',
  label: 'clientes_barranquilla.xlsx',
  source: 'excel',
  sheetName: 'Hoja1',
  importedCount: 2,
  createdAt: '2026-03-01T15:00:00.000Z',
}

const MANUAL: ImportBatch = {
  id: 'g-2',
  label: 'Manual — 31/08/2026 08:45',
  source: 'manual',
  sheetName: null,
  importedCount: 1,
  createdAt: '2026-08-31T13:45:00.000Z',
}

function located(
  id: string,
  batchId: string,
  original: Record<string, unknown>,
): EstablishmentRecord {
  return {
    ...makeRecord({
      client: 'Olimpica',
      location_name: 'Olimpica Calle 72',
      address: 'Calle 72 # 50-20',
      city: 'Barranquilla',
    }),
    id,
    batchId,
    source: 'excel',
    original,
    status: 'FOUND',
    result: makeResult({
      latitude: 10.9878,
      longitude: -74.8012,
      matchedName: 'Olimpica',
      matchedAddress: 'Calle 72 # 50-20',
      confidence: 0.91,
      components: {
        ...emptyComponents(),
        region: 'Atlántico',
        city: 'Barranquilla',
        postalCode: '080001',
        country: 'Colombia',
        countryCode: 'CO',
      },
    }),
  }
}

const RECORDS: readonly EstablishmentRecord[] = [
  located('r-1', 'g-1', { CLIENTE: 'OLIMPICA S.A.', 'VENTAS 2025': 15000 }),
  located('r-2', 'g-1', { CLIENTE: 'OLIMPICA S.A.', 'VENTAS 2025': 22000 }),
  {
    ...makeRecord({ client: 'Toks', location_name: 'Toks Plaza Universidad' }),
    id: 'm-1',
    batchId: 'g-2',
    status: 'NOT_FOUND',
    result: null,
  },
]

/** Genera el archivo y lo devuelve ya leido, como lo veria una hoja de calculo. */
async function roundTrip(
  options: Parameters<typeof buildExport>[1] = {},
): Promise<{ headers: readonly string[]; rows: readonly (readonly unknown[])[] }> {
  const sheet = buildExport(RECORDS, { batches: [BARRANQUILLA, MANUAL], ...options })
  const blob = await writeSheetToBlob(sheet)
  const workbook = await readWorkbook({
    fileName: 'export.xlsx',
    buffer: await blob.arrayBuffer(),
  })

  const read = workbook.readSheet(workbook.sheets[0]?.name ?? '')
  return { headers: read.headers, rows: read.rows }
}

describe('exportacion a un archivo real', () => {
  it('el archivo trae las columnas geograficas separadas y legibles', async () => {
    const { headers } = await roundTrip()

    for (const column of [
      'Estado/Departamento',
      'Municipio/Ciudad',
      'Código ZIP',
      'Dirección encontrada',
      'Coordenadas',
      'Latitud',
      'Longitud',
    ]) {
      expect(headers, `falta la columna ${column}`).toContain(column)
    }
  })

  it('conserva las columnas originales del Excel importado', async () => {
    const { headers, rows } = await roundTrip()

    expect(headers.slice(0, 2)).toEqual(['CLIENTE', 'VENTAS 2025'])
    expect(rows[0]?.[0]).toBe('OLIMPICA S.A.')
    expect(rows[0]?.[1]).toBe(15000)
  })

  it('escribe latitud y longitud como numeros, no como texto', async () => {
    const { headers, rows } = await roundTrip()

    const latitude = rows[0]?.[headers.indexOf('Latitud')]
    const longitude = rows[0]?.[headers.indexOf('Longitud')]

    expect(typeof latitude).toBe('number')
    expect(typeof longitude).toBe('number')
    expect(latitude).toBe(10.9878)
    expect(longitude).toBe(-74.8012)
  })

  it('la columna de coordenadas va en longitud, latitud', async () => {
    const { headers, rows } = await roundTrip()

    expect(rows[0]?.[headers.indexOf('Coordenadas')]).toBe('-74.801200, 10.987800')
  })

  it('separa estado, municipio y codigo postal en celdas propias', async () => {
    const { headers, rows } = await roundTrip()
    const value = (column: string) => rows[0]?.[headers.indexOf(column)]

    expect(value('Estado/Departamento')).toBe('Atlántico')
    expect(value('Municipio/Ciudad')).toBe('Barranquilla')
    // Con ceros a la izquierda: por eso el ZIP se escribe como texto.
    expect(value('Código ZIP')).toBe('080001')
  })

  it('identifica el grupo de cada fila', async () => {
    const { headers, rows } = await roundTrip()
    const grupo = headers.indexOf('Grupo')

    expect(rows[0]?.[grupo]).toBe('clientes_barranquilla.xlsx · Hoja1')
    expect(rows[2]?.[grupo]).toBe('Manual — 31/08/2026 08:45')
  })

  it('exportar un solo grupo deja fuera al resto', async () => {
    const { headers, rows } = await roundTrip({ groupIds: ['g-2'] })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.[headers.indexOf('ID interno')]).toBe('m-1')
    // Y las columnas del otro grupo tampoco aparecen.
    expect(headers).not.toContain('VENTAS 2025')
  })

  it('exportar varios grupos los trae todos', async () => {
    const { headers, rows } = await roundTrip({ groupIds: ['g-1', 'g-2'] })

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row[headers.indexOf('ID interno')])).toEqual(['r-1', 'r-2', 'm-1'])
  })

  it('un registro sin resultado deja las celdas geograficas vacias', async () => {
    const { headers, rows } = await roundTrip()
    const row = rows[2]

    for (const column of ['Latitud', 'Longitud', 'Coordenadas', 'Código ZIP']) {
      expect(row?.[headers.indexOf(column)], column).toBe('')
    }
    expect(row?.[headers.indexOf('Resultado')]).toBe('No encontrado')
  })

  it('no escribe nombres tecnicos de proveedor en las cabeceras', async () => {
    const { headers } = await roundTrip()

    for (const technical of ['lat', 'lng', 'formatted_address', 'admin_level_1', 'postcode']) {
      expect(headers).not.toContain(technical)
    }
  })

  it('todas las filas del archivo tienen tantas celdas como cabeceras', async () => {
    const { headers, rows } = await roundTrip()

    for (const row of rows) {
      expect(row).toHaveLength(headers.length)
    }
  })
})
