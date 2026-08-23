import { beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryRepository } from '@/infrastructure/storage'

import { setRepository } from './repository'
import { useAppStore } from './useAppStore'

/**
 * Recorrido completo del MVP 1 sobre el store: archivo -> hoja -> mapeo ->
 * registros -> edicion. Usa archivos reales generados en memoria.
 */

async function xlsxFile(
  name: string,
  sheets: Record<string, (readonly unknown[])[]>,
): Promise<File> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(sheetName)
    for (const row of rows) worksheet.addRow([...row])
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return new File([buffer], name)
}

function csvFile(name: string, text: string): File {
  return new File([text], name)
}

const INITIAL = useAppStore.getState()

beforeEach(() => {
  setRepository(createInMemoryRepository())
  useAppStore.setState({
    ...INITIAL,
    records: [],
    isHydrated: false,
    country: null,
    requireCountry: true,
    workbook: null,
    fileName: null,
    sheets: [],
    selectedSheet: null,
    preview: null,
    mapping: [],
    displacedColumns: {},
    importError: null,
    filters: { text: '', source: 'all', status: 'all', onlyWithIssues: false },
  })
})

describe('flujo de importacion', () => {
  it('carga un archivo, sugiere el mapeo y crea los registros', async () => {
    const file = await xlsxFile('tiendas.xlsx', {
      Tiendas: [
        ['CLIENTE', 'NOMBRE DEL LOCAL', 'CIUDAD', 'VENTAS'],
        ['Olimpica', 'Olimpica Calle 72', 'Barranquilla', 15000],
        ['Olimpica', 'Olimpica Prado', 'Barranquilla', 22000],
      ],
    })

    await useAppStore.getState().openFile(file)

    // Con una sola hoja util se selecciona sola.
    expect(useAppStore.getState().selectedSheet).toBe('Tiendas')
    expect(useAppStore.getState().mapping).toEqual(['client', 'location_name', 'city', null])

    const imported = await useAppStore.getState().confirmImport()

    expect(imported).toBe(2)
    const { records } = useAppStore.getState()
    expect(records).toHaveLength(2)
    expect(records[0]?.fields.location_name).toBe('Olimpica Calle 72')
    expect(records[0]?.original.VENTAS).toBe(15000)
    expect(records[0]?.origin?.sheetName).toBe('Tiendas')
  })

  it('permite corregir el mapeo antes de importar', async () => {
    const file = csvFile('t.csv', 'COL A;COL B\nToks;Restaurante\n')
    await useAppStore.getState().openFile(file)

    expect(useAppStore.getState().mapping).toEqual([null, null])

    useAppStore.getState().setColumnField(0, 'client')
    useAppStore.getState().setColumnField(1, 'business_type')
    await useAppStore.getState().confirmImport()

    const record = useAppStore.getState().records[0]
    expect(record?.fields.client).toBe('Toks')
    expect(record?.fields.business_type).toBe('Restaurante')
  })

  it('libera un campo cuando se asigna a otra columna', async () => {
    const file = csvFile('t.csv', 'A,B\n1,2\n')
    await useAppStore.getState().openFile(file)

    useAppStore.getState().setColumnField(0, 'city')
    useAppStore.getState().setColumnField(1, 'city')

    expect(useAppStore.getState().mapping).toEqual([null, 'city'])
  })

  it('aplica el pais global a las filas sin pais', async () => {
    useAppStore.getState().setCountry({ name: 'Colombia', code: 'CO' })
    const file = csvFile('t.csv', 'NOMBRE DEL LOCAL\nOlimpica Prado\n')

    await useAppStore.getState().openFile(file)
    await useAppStore.getState().confirmImport()

    expect(useAppStore.getState().records[0]?.fields.country).toBe('Colombia')
  })

  it('respeta la fila de encabezados elegida a mano', async () => {
    const file = await xlsxFile('tiendas.xlsx', {
      Hoja1: [['REPORTE'], ['CLIENTE', 'CIUDAD'], ['Olimpica', 'Barranquilla']],
    })
    await useAppStore.getState().openFile(file)
    useAppStore.getState().setHeaderRow(2)

    expect(useAppStore.getState().preview?.headers).toEqual(['CLIENTE', 'CIUDAD'])
    await useAppStore.getState().confirmImport()
    expect(useAppStore.getState().records).toHaveLength(1)
  })

  it('reporta un archivo no soportado sin romper el estado', async () => {
    await useAppStore.getState().openFile(csvFile('viejo.xls', 'x'))

    expect(useAppStore.getState().importError).toContain('.xlsx')
    expect(useAppStore.getState().workbook).toBeNull()
    expect(useAppStore.getState().records).toEqual([])
  })

  it('reporta una hoja vacia', async () => {
    const file = await xlsxFile('vacio.xlsx', { Hoja1: [], Datos: [['A'], ['1']] })
    await useAppStore.getState().openFile(file)
    useAppStore.getState().selectSheet('Hoja1')

    expect(useAppStore.getState().importError).toContain('no tiene datos')
  })

  it('combina registros importados y manuales', async () => {
    const file = csvFile('t.csv', 'NOMBRE DEL LOCAL\nOlimpica Prado\n')
    await useAppStore.getState().openFile(file)
    await useAppStore.getState().confirmImport()
    await useAppStore.getState().addManualRecord({ location_name: 'Toks Plaza Universidad' })

    const { records } = useAppStore.getState()
    expect(records).toHaveLength(2)
    expect(records.map((record) => record.source)).toEqual(['excel', 'manual'])
  })
})

describe('gestion de registros', () => {
  it('crea, edita, duplica y elimina', async () => {
    const store = useAppStore.getState()
    const id = await store.addManualRecord({ client: 'Walmart', city: 'Puebla' })

    await useAppStore.getState().updateRecord(id, { city: 'Guadalajara' })
    expect(useAppStore.getState().records[0]?.fields.city).toBe('Guadalajara')

    await useAppStore.getState().duplicateRecord(id)
    const afterCopy = useAppStore.getState().records
    expect(afterCopy).toHaveLength(2)
    expect(afterCopy[1]?.fields.city).toBe('Guadalajara')
    expect(afterCopy[1]?.id).not.toBe(id)

    await useAppStore.getState().deleteRecords([id])
    expect(useAppStore.getState().records).toHaveLength(1)

    await useAppStore.getState().clearRecords()
    expect(useAppStore.getState().records).toEqual([])
  })

  it('editar no toca los datos originales importados', async () => {
    const file = csvFile('t.csv', 'CIUDAD\nBarranquilla\n')
    await useAppStore.getState().openFile(file)
    await useAppStore.getState().confirmImport()

    const id = useAppStore.getState().records[0]?.id
    if (!id) throw new Error('se esperaba un registro')

    await useAppStore.getState().updateRecord(id, { city: 'Cartagena' })
    const record = useAppStore.getState().records[0]

    expect(record?.fields.city).toBe('Cartagena')
    expect(record?.original.CIUDAD).toBe('Barranquilla')
  })
})

describe('persistencia de la sesion', () => {
  it('recupera registros y ajustes al rehidratar', async () => {
    useAppStore.getState().setCountry({ name: 'Mexico', code: 'MX' })
    await useAppStore.getState().addManualRecord({ client: 'Chedraui' })

    // Simula recargar la pagina conservando el repositorio.
    useAppStore.setState({ records: [], country: null, isHydrated: false })
    await useAppStore.getState().hydrate()

    const state = useAppStore.getState()
    expect(state.isHydrated).toBe(true)
    expect(state.records).toHaveLength(1)
    expect(state.country).toEqual({ name: 'Mexico', code: 'MX' })
  })
})
