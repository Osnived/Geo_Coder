import { describe, expect, it } from 'vitest'

import type { ColumnAssignment } from '@/domain/services/recordNormalizer'
import type { RawGrid, SheetPreview } from '@/infrastructure/excel'

import { analyzeDefaultableFields } from './defaultableFields'

function preview(rows: RawGrid, headers = ['A', 'B', 'C']): SheetPreview {
  return {
    sheetName: 'Hoja1',
    headerRowNumber: 1,
    headers,
    sampleRows: rows,
    totalDataRows: rows.length,
    nonBlankDataRows: rows.length,
    emptyColumnIndexes: [],
  }
}

/** Columna 0 = cliente, columna 1 = tipo, columna 2 = ciudad. */
const FULL_MAPPING: ColumnAssignment = ['client', 'business_type', 'city']
const NO_CLIENT: ColumnAssignment = [null, 'business_type', 'city']
const NOTHING: ColumnAssignment = [null, null, null]

describe('campos sin columna asignada', () => {
  it('marca el cliente como no mapeado cuando ninguna columna lo alimenta', () => {
    const result = analyzeDefaultableFields(
      preview([['Olimpica', 'supermercado', 'Barranquilla']]),
      NO_CLIENT,
    )

    expect(result).toEqual([{ field: 'client', isMapped: false, blankInSample: 1, sampleSize: 1 }])
  })

  it('sin mapeo devuelve los dos campos que admiten valor por defecto', () => {
    const result = analyzeDefaultableFields(preview([['a', 'b', 'c']]), NOTHING)

    expect(result.map((entry) => entry.field)).toEqual(['client', 'business_type'])
    expect(result.every((entry) => !entry.isMapped)).toBe(true)
  })

  it('cuenta toda la muestra como hueco si no hay columna', () => {
    const result = analyzeDefaultableFields(
      preview([
        ['x', 'y', 'z'],
        ['x', 'y', 'z'],
        ['x', 'y', 'z'],
      ]),
      NO_CLIENT,
    )

    expect(result[0]?.blankInSample).toBe(3)
    expect(result[0]?.sampleSize).toBe(3)
  })
})

describe('campos mapeados', () => {
  it('no ofrece nada si las columnas estan mapeadas y completas', () => {
    const result = analyzeDefaultableFields(
      preview([
        ['Olimpica', 'supermercado', 'Barranquilla'],
        ['Exito', 'supermercado', 'Bogota'],
      ]),
      FULL_MAPPING,
    )

    expect(result).toEqual([])
  })

  it('ofrece el campo si la columna existe pero tiene huecos', () => {
    const result = analyzeDefaultableFields(
      preview([
        ['Olimpica', 'supermercado', 'Barranquilla'],
        ['', 'supermercado', 'Bogota'],
        ['', 'supermercado', 'Cali'],
      ]),
      FULL_MAPPING,
    )

    expect(result).toEqual([{ field: 'client', isMapped: true, blankInSample: 2, sampleSize: 3 }])
  })

  it('trata los espacios en blanco como hueco', () => {
    const result = analyzeDefaultableFields(
      preview([['   ', 'supermercado', 'Cali']]),
      FULL_MAPPING,
    )

    expect(result[0]?.blankInSample).toBe(1)
  })

  it('trata null y undefined como hueco', () => {
    const result = analyzeDefaultableFields(
      preview([
        [null, 'supermercado', 'Cali'],
        [undefined, 'supermercado', 'Cali'],
      ]),
      FULL_MAPPING,
    )

    expect(result[0]?.blankInSample).toBe(2)
  })

  it('un numero en la celda no es un hueco', () => {
    const result = analyzeDefaultableFields(preview([[123, 'supermercado', 'Cali']]), FULL_MAPPING)

    expect(result).toEqual([])
  })
})

describe('varias columnas al mismo campo', () => {
  /**
   * El normalizador permite que dos columnas alimenten un campo. Basta con que
   * una traiga algo para que la fila no necesite valor por defecto.
   */
  it('no cuenta hueco si otra de las columnas trae el dato', () => {
    const mapping: ColumnAssignment = ['client', 'client', 'city']
    const result = analyzeDefaultableFields(
      preview([
        ['Olimpica', '', 'Barranquilla'],
        ['', 'Exito', 'Bogota'],
      ]),
      mapping,
    )

    // El tipo de establecimiento no esta mapeado, pero el cliente si esta cubierto.
    expect(result.map((entry) => entry.field)).toEqual(['business_type'])
  })

  it('cuenta hueco solo si todas las columnas del campo vienen vacias', () => {
    const mapping: ColumnAssignment = ['client', 'client', 'business_type']
    const result = analyzeDefaultableFields(
      preview([
        ['', '', 'supermercado'],
        ['Olimpica', '', 'supermercado'],
      ]),
      mapping,
    )

    expect(result).toEqual([{ field: 'client', isMapped: true, blankInSample: 1, sampleSize: 2 }])
  })
})

describe('nunca ofrece el nombre del local', () => {
  /**
   * Darle el mismo nombre a todas las sucursales destruiria lo unico que
   * permite distinguirlas.
   */
  it('location_name no aparece aunque no este mapeado', () => {
    const result = analyzeDefaultableFields(preview([['a', 'b', 'c']]), NOTHING)

    expect(result.map((entry) => entry.field)).not.toContain('location_name')
  })
})

describe('muestra vacia', () => {
  it('no revienta con una hoja sin filas de datos', () => {
    const result = analyzeDefaultableFields(preview([]), NO_CLIENT)

    expect(result).toEqual([{ field: 'client', isMapped: false, blankInSample: 0, sampleSize: 0 }])
  })
})
