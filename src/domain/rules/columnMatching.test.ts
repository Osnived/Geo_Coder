import { describe, expect, it } from 'vitest'

import { suggestColumnMapping, suggestFieldForHeader } from './columnMatching'

describe('suggestFieldForHeader', () => {
  it('mapea los ejemplos de la especificacion', () => {
    const cases: Array<[string, string]> = [
      ['CLIENTE', 'client'],
      ['CUSTOMER', 'client'],
      ['CHAIN', 'client'],
      ['BRAND', 'client'],
      ['MARCA', 'client'],
      ['NOMBRE', 'location_name'],
      ['LOCAL', 'location_name'],
      ['STORE NAME', 'location_name'],
      ['BUSINESS NAME', 'location_name'],
      ['LOCATION NAME', 'location_name'],
      ['SUCURSAL', 'location_name'],
      ['ADDRESS', 'address'],
      ['DIRECCION', 'address'],
      ['DIRECCIÓN', 'address'],
      ['STREET', 'address'],
      ['DOMICILIO', 'address'],
      ['CITY', 'city'],
      ['CIUDAD', 'city'],
      ['MUNICIPIO', 'city'],
      ['STATE', 'region'],
      ['ESTADO', 'region'],
      ['DEPARTAMENTO', 'region'],
      ['PROVINCIA', 'region'],
      ['REGION', 'region'],
      ['ZIP', 'postal_code'],
      ['ZIPCODE', 'postal_code'],
      ['POSTAL CODE', 'postal_code'],
      ['CP', 'postal_code'],
      ['CODIGO POSTAL', 'postal_code'],
    ]

    for (const [header, expected] of cases) {
      expect(suggestFieldForHeader(header).field, `encabezado ${header}`).toBe(expected)
    }
  })

  it('distingue cliente de nombre del local', () => {
    expect(suggestFieldForHeader('NOMBRE CLIENTE').field).toBe('client')
    expect(suggestFieldForHeader('NOMBRE DEL LOCAL').field).toBe('location_name')
  })

  it('no confunde tipo de establecimiento con nombre del local', () => {
    expect(suggestFieldForHeader('TIPO DE ESTABLECIMIENTO').field).toBe('business_type')
  })

  it('marca certeza exacta frente a parcial', () => {
    expect(suggestFieldForHeader('CIUDAD').strength).toBe('exact')
    expect(suggestFieldForHeader('CIUDAD DE ENTREGA').strength).toBe('strong')
  })

  it('no sugiere nada para encabezados desconocidos o vacios', () => {
    expect(suggestFieldForHeader('TOTAL FACTURADO').field).toBeNull()
    expect(suggestFieldForHeader('').field).toBeNull()
    expect(suggestFieldForHeader('   ').field).toBeNull()
  })
})

describe('suggestColumnMapping', () => {
  it('mapea una hoja tipica completa', () => {
    const entries = suggestColumnMapping([
      'CLIENTE',
      'TIPO',
      'NOMBRE DEL LOCAL',
      'DIRECCIÓN',
      'CIUDAD',
      'DEPARTAMENTO',
      'CP',
      'PAIS',
    ])

    expect(entries.map((entry) => entry.field)).toEqual([
      'client',
      'business_type',
      'location_name',
      'address',
      'city',
      'region',
      'postal_code',
      'country',
    ])
  })

  it('no asigna el mismo campo a dos columnas', () => {
    const entries = suggestColumnMapping(['CIUDAD', 'CIUDAD'])

    expect(entries[0]?.field).toBe('city')
    expect(entries[1]?.field).toBeNull()
    expect(entries[1]?.displacedBy).toBe(0)
  })

  it('cuando compiten dos columnas gana la de mayor certeza', () => {
    const entries = suggestColumnMapping(['CIUDAD DE FACTURACION', 'CIUDAD'])

    expect(entries[0]?.field).toBeNull()
    expect(entries[0]?.displacedBy).toBe(1)
    expect(entries[1]?.field).toBe('city')
  })

  it('deja sin mapear las columnas desconocidas', () => {
    const entries = suggestColumnMapping(['CIUDAD', 'VENTAS 2025', 'OBSERVACIONES'])

    expect(entries[0]?.field).toBe('city')
    expect(entries[1]?.field).toBeNull()
    expect(entries[1]?.displacedBy).toBeNull()
    expect(entries[2]?.field).toBeNull()
  })

  it('conserva el indice y el encabezado original', () => {
    const entries = suggestColumnMapping(['  Ciudad  '])

    expect(entries[0]?.columnIndex).toBe(0)
    expect(entries[0]?.header).toBe('  Ciudad  ')
  })
})
