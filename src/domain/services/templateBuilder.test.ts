import { describe, expect, it } from 'vitest'

import { NORMALIZED_FIELDS } from '../models/fields'
import { suggestColumnMapping, suggestFieldForHeader } from '../rules/columnMatching'

import {
  buildInstructionsSheet,
  buildTemplateSheet,
  buildTemplateWorkbook,
  TEMPLATE_COLUMNS,
} from './templateBuilder'

describe('plantilla de carga', () => {
  it('cubre los ocho campos normalizados, sin repetir ninguno', () => {
    const fields = TEMPLATE_COLUMNS.map((column) => column.field)

    expect(new Set(fields).size).toBe(fields.length)
    expect([...fields].sort()).toEqual([...NORMALIZED_FIELDS].sort())
  })

  /**
   * Este es el test que importa: la plantilla solo sirve si quien la usa no
   * tiene que mapear nada. Si alguien cambia los sinonimos de deteccion, aqui
   * se entera.
   */
  it('cada encabezado se reconoce de forma exacta como su campo', () => {
    for (const column of TEMPLATE_COLUMNS) {
      const suggestion = suggestFieldForHeader(column.header)

      expect(suggestion.field, `encabezado ${column.header}`).toBe(column.field)
      expect(suggestion.strength, `encabezado ${column.header}`).toBe('exact')
    }
  })

  it('la hoja completa se mapea sola, sin columnas desplazadas', () => {
    const entries = suggestColumnMapping(buildTemplateSheet().headers)

    expect(entries.map((entry) => entry.field)).toEqual(
      TEMPLATE_COLUMNS.map((column) => column.field),
    )
    expect(entries.every((entry) => entry.displacedBy === null)).toBe(true)
  })

  it('trae filas de ejemplo completas', () => {
    const sheet = buildTemplateSheet()

    expect(sheet.rows.length).toBeGreaterThan(0)
    for (const row of sheet.rows) {
      expect(row).toHaveLength(sheet.headers.length)
      expect(row.every((cell) => String(cell).trim() !== '')).toBe(true)
    }
  })

  it('los ejemplos no valen como datos reales por accidente: son de paises distintos', () => {
    const countryIndex = TEMPLATE_COLUMNS.findIndex((column) => column.field === 'country')
    const countries = buildTemplateSheet().rows.map((row) => row[countryIndex])

    expect(new Set(countries).size).toBeGreaterThan(1)
  })

  it('las instrucciones explican todas las columnas', () => {
    const sheet = buildInstructionsSheet()
    const explained = sheet.rows.map((row) => row[0])

    for (const column of TEMPLATE_COLUMNS) {
      expect(explained).toContain(column.header)
    }
  })

  it('las filas de instrucciones encajan con sus cabeceras', () => {
    const sheet = buildInstructionsSheet()
    for (const row of sheet.rows) {
      expect(row).toHaveLength(sheet.headers.length)
    }
  })

  it('marca como clave los campos que identifican el sitio', () => {
    const clave = TEMPLATE_COLUMNS.filter((column) => column.importance === 'clave').map(
      (column) => column.field,
    )

    expect(clave).toContain('location_name')
    expect(clave).toContain('address')
    expect(clave).toContain('city')
  })

  it('el libro trae la plantilla y las instrucciones, en ese orden', () => {
    const sheets = buildTemplateWorkbook()

    expect(sheets.map((entry) => entry.name)).toEqual(['Plantilla', 'Instrucciones'])
  })
})
