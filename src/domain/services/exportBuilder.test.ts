import { describe, expect, it } from 'vitest'

import { makeRecord, makeResult } from '@/test/factories'

import type { ImportBatch } from '../models/batch'
import { emptyComponents } from '../models/geocode'
import type { EstablishmentRecord } from '../models/record'

import {
  buildExport,
  collectOriginalColumns,
  formatCoordinates,
  GEO_COLUMNS,
  selectForExport,
} from './exportBuilder'

const result = makeResult

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

/** Acceso por nombre de columna, que es como se lee una hoja de verdad. */
function reader(sheet: { headers: readonly string[]; rows: readonly (readonly unknown[])[] }) {
  return (column: string, row = 0) => sheet.rows[row]?.[sheet.headers.indexOf(column)]
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

describe('formatCoordinates', () => {
  it('escribe longitud y despues latitud, con seis decimales', () => {
    expect(formatCoordinates(10.9878, -74.8012)).toBe('-74.801200, 10.987800')
  })

  it('no pierde el signo de los valores negativos', () => {
    expect(formatCoordinates(-33.4489, -70.6693)).toBe('-70.669300, -33.448900')
  })
})

describe('buildExport: informacion original', () => {
  it('conserva las columnas originales al principio y en su orden', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica', VENTAS: 15000 })])

    expect(sheet.headers.slice(0, 2)).toEqual(['CLIENTE', 'VENTAS'])
    expect(sheet.rows[0]?.slice(0, 2)).toEqual(['Olimpica', 15000])
  })

  it('anade los campos normalizados ademas de los originales', () => {
    const sheet = buildExport([imported({ CLIENTE: 'OLIMPICA S.A.' })])
    const value = reader(sheet)

    // El original se conserva aunque el normalizado se haya corregido.
    expect(sheet.rows[0]?.[0]).toBe('OLIMPICA S.A.')
    expect(value('Cliente / cadena')).toBe('Olimpica')
  })

  it('exporta registros manuales con sus campos aunque no tengan original', () => {
    const manual = makeRecord({ client: 'Toks', location_name: 'Toks Plaza Universidad' })
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' }), { ...manual, id: 'm-1' }])
    const value = reader(sheet)

    expect(value('CLIENTE', 1)).toBe('')
    expect(value('Cliente / cadena', 1)).toBe('Toks')
    expect(value('Origen', 1)).toBe('Manual')
  })

  it('no pisa una columna original que ya se llame igual', () => {
    const sheet = buildExport([imported({ Latitud: 'valor original' })])

    expect(sheet.headers).toContain('Latitud')
    expect(sheet.headers).toContain('Latitud (geo)')
    expect(reader(sheet)('Latitud')).toBe('valor original')
  })

  it('permite quitar las columnas originales', () => {
    const sheet = buildExport([imported({ CLIENTE: 'Olimpica' })], {
      sections: { original: false },
    })

    expect(sheet.headers).not.toContain('CLIENTE')
    expect(reader(sheet)('Cliente / cadena')).toBe('Olimpica')
  })
})

describe('buildExport: columnas geograficas separadas', () => {
  const located = imported(
    { CLIENTE: 'Olimpica' },
    {
      status: 'FOUND',
      result: result({
        latitude: 10.9878,
        longitude: -74.8012,
        matchedAddress: 'Calle 72 # 50-20',
        components: {
          ...emptyComponents(),
          region: 'Atlántico',
          city: 'Barranquilla',
          postalCode: '080001',
          country: 'Colombia',
          countryCode: 'CO',
        },
      }),
    },
  )

  it('incluye las siete columnas geograficas con nombres legibles', () => {
    const sheet = buildExport([located])

    for (const column of GEO_COLUMNS) {
      expect(sheet.headers, `falta la columna ${column}`).toContain(column)
    }
  })

  it('no usa nombres tecnicos del proveedor', () => {
    const sheet = buildExport([located])

    for (const technical of ['lat', 'lng', 'formatted_address', 'admin_level_1', 'postcode']) {
      expect(sheet.headers).not.toContain(technical)
    }
  })

  it('separa estado, municipio y codigo postal en columnas propias', () => {
    const value = reader(buildExport([located]))

    expect(value('Estado/Departamento')).toBe('Atlántico')
    expect(value('Municipio/Ciudad')).toBe('Barranquilla')
    expect(value('Código ZIP')).toBe('080001')
    expect(value('Dirección encontrada')).toBe('Calle 72 # 50-20')
  })

  it('exporta latitud y longitud como numeros independientes', () => {
    const value = reader(buildExport([located]))

    expect(value('Latitud')).toBe(10.9878)
    expect(value('Longitud')).toBe(-74.8012)
  })

  it('compone la columna de coordenadas como longitud, latitud', () => {
    expect(reader(buildExport([located]))('Coordenadas')).toBe('-74.801200, 10.987800')
  })

  it('deja las columnas geograficas vacias si no hay resultado', () => {
    const value = reader(buildExport([imported({ CLIENTE: 'Olimpica' })]))

    for (const column of GEO_COLUMNS) {
      expect(value(column), `la columna ${column} deberia estar vacia`).toBe('')
    }
  })

  it('deja vacio el componente que el proveedor no informo', () => {
    const partial = imported(
      { CLIENTE: 'Olimpica' },
      { status: 'FOUND', result: result({ components: emptyComponents() }) },
    )
    const value = reader(buildExport([partial]))

    expect(value('Código ZIP')).toBe('')
    // Pero las coordenadas si estan: son otra cosa.
    expect(value('Latitud')).toBe(11.0057)
  })

  it('permite quitar el bloque geografico', () => {
    const sheet = buildExport([located], { sections: { geographic: false } })

    expect(sheet.headers).not.toContain('Coordenadas')
    expect(sheet.headers).toContain('Resultado')
  })
})

describe('buildExport: resultado de la busqueda', () => {
  it('escribe el resultado en castellano, no el codigo interno', () => {
    const sheet = buildExport([
      imported({ CLIENTE: 'Olimpica' }, { status: 'FOUND', result: result() }),
    ])
    const value = reader(sheet)

    expect(value('Resultado')).toBe('Encontrado')
    expect(value('Confianza (%)')).toBe(83)
    expect(value('Proveedor')).toBe('nominatim')
    expect(value('Consulta usada')).toBe('Olimpica Prado, Barranquilla, Colombia')
    expect(value('Verificado manualmente')).toBe('NO')
  })

  it('marca la verificacion manual', () => {
    const sheet = buildExport([
      imported(
        { CLIENTE: 'Olimpica' },
        { status: 'MANUALLY_VERIFIED', result: result({ manuallyVerified: true }) },
      ),
    ])

    expect(reader(sheet)('Verificado manualmente')).toBe('SI')
  })

  it('informa del estado aunque no haya resultado', () => {
    const value = reader(buildExport([imported({ CLIENTE: 'Olimpica' })]))

    expect(value('Resultado')).toBe('Pendiente')
    expect(value('Confianza (%)')).toBe('')
  })

  it('permite quitar el bloque de resultado', () => {
    const sheet = buildExport([imported({ CLIENTE: 'a' })], { sections: { result: false } })
    expect(sheet.headers).not.toContain('Proveedor')
  })
})

describe('buildExport: integridad de la hoja', () => {
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

  it('sigue cuadrando con todos los bloques desactivados', () => {
    const sheet = buildExport([imported({ CLIENTE: 'a' })], {
      sections: { original: false, geographic: false, result: false, group: false },
    })

    expect(sheet.rows[0]).toHaveLength(sheet.headers.length)
    // El identificador interno nunca se quita: es la vuelta al dato.
    expect(sheet.headers).toContain('ID interno')
  })

  it('devuelve solo cabeceras si no hay registros', () => {
    const sheet = buildExport([])
    expect(sheet.rows).toEqual([])
    expect(sheet.headers).toContain('Latitud')
  })

  it('incluye el identificador interno para trazabilidad', () => {
    expect(reader(buildExport([imported({ CLIENTE: 'Olimpica' })]))('ID interno')).toBe('r-1')
  })
})

describe('exportacion por grupo', () => {
  const BARRANQUILLA: ImportBatch = {
    id: 'g-1',
    label: 'clientes_barranquilla.xlsx',
    source: 'excel',
    sheetName: 'Hoja1',
    importedCount: 2,
    createdAt: '2026-03-01T10:00:00.000Z',
  }
  const CARTAGENA: ImportBatch = {
    id: 'g-2',
    label: 'clientes_cartagena.xlsx',
    source: 'excel',
    sheetName: 'Hoja1',
    importedCount: 1,
    createdAt: '2026-03-02T10:00:00.000Z',
  }
  const MANUAL: ImportBatch = {
    id: 'g-3',
    label: 'Manual — 31/08/2026 08:45',
    source: 'manual',
    sheetName: null,
    importedCount: 1,
    createdAt: '2026-08-31T13:45:00.000Z',
  }

  const BATCHES = [BARRANQUILLA, CARTAGENA, MANUAL]

  const records = [
    imported({ CLIENTE: 'a' }, { id: 'r-1', batchId: 'g-1' }),
    imported({ CLIENTE: 'b' }, { id: 'r-2', batchId: 'g-1' }),
    imported({ CLIENTE: 'c' }, { id: 'r-3', batchId: 'g-2' }),
    { ...makeRecord({ client: 'd' }), id: 'r-4', batchId: 'g-3' },
  ]

  it('sin filtro exporta todos los grupos', () => {
    const sheet = buildExport(records, { batches: BATCHES })
    expect(sheet.rows).toHaveLength(4)
  })

  it('una lista de grupos vacia se trata como "todos"', () => {
    const sheet = buildExport(records, { batches: BATCHES, groupIds: [] })
    expect(sheet.rows).toHaveLength(4)
  })

  it('exporta exclusivamente los registros de un grupo', () => {
    const sheet = buildExport(records, { batches: BATCHES, groupIds: ['g-1'] })
    const ids = sheet.rows.map((row) => row[sheet.headers.indexOf('ID interno')])

    expect(ids).toEqual(['r-1', 'r-2'])
  })

  it('exporta varios grupos a la vez', () => {
    const sheet = buildExport(records, { batches: BATCHES, groupIds: ['g-2', 'g-3'] })
    const ids = sheet.rows.map((row) => row[sheet.headers.indexOf('ID interno')])

    expect(ids).toEqual(['r-3', 'r-4'])
  })

  it('identifica el grupo de cada fila', () => {
    const sheet = buildExport(records, { batches: BATCHES })
    const value = reader(sheet)

    expect(value('Grupo')).toBe('clientes_barranquilla.xlsx · Hoja1')
    expect(value('Tipo de grupo')).toBe('Excel')
    expect(value('Grupo', 3)).toBe('Manual — 31/08/2026 08:45')
    expect(value('Tipo de grupo', 3)).toBe('Manual')
  })

  it('cae en el id del grupo si no se conoce su nombre', () => {
    const sheet = buildExport([imported({ CLIENTE: 'x' }, { batchId: 'desconocido' })])
    expect(reader(sheet)('Grupo')).toBe('desconocido')
  })

  it('permite quitar el bloque de grupo', () => {
    const sheet = buildExport(records, { batches: BATCHES, sections: { group: false } })
    expect(sheet.headers).not.toContain('Grupo')
  })

  it('combina filtro por grupo y por seleccion de registros', () => {
    const sheet = buildExport(records, { groupIds: ['g-1'], onlyIds: ['r-2', 'r-3'] })
    const ids = sheet.rows.map((row) => row[sheet.headers.indexOf('ID interno')])

    expect(ids).toEqual(['r-2'])
  })

  it('las columnas originales se calculan sobre lo seleccionado', () => {
    const sheet = buildExport(
      [
        imported({ SOLO_EN_G1: 'x' }, { id: 'r-1', batchId: 'g-1' }),
        imported({ SOLO_EN_G2: 'y' }, { id: 'r-2', batchId: 'g-2' }),
      ],
      { groupIds: ['g-2'] },
    )

    expect(sheet.headers).not.toContain('SOLO_EN_G1')
    expect(sheet.headers).toContain('SOLO_EN_G2')
  })
})

describe('selectForExport', () => {
  const records = [
    imported({}, { id: 'a', batchId: 'g-1' }),
    imported({}, { id: 'b', batchId: 'g-2' }),
  ]

  it('sin opciones devuelve todo', () => {
    expect(selectForExport(records, {}).map((record) => record.id)).toEqual(['a', 'b'])
  })

  it('filtra por grupo', () => {
    expect(selectForExport(records, { groupIds: ['g-2'] }).map((record) => record.id)).toEqual([
      'b',
    ])
  })

  it('un grupo inexistente no devuelve nada', () => {
    expect(selectForExport(records, { groupIds: ['g-9'] })).toEqual([])
  })
})
