import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { emptyComponents } from '@/domain/models/geocode'
import type { GeocoderProvider, ProviderCandidate } from '@/domain/services/geocoderProvider'
import { DEFAULT_RETRY_SETTINGS } from '@/domain/services/retryPolicy'
import { createInMemoryRepository } from '@/infrastructure/storage'

import { setProviders } from './geocoder'
import { setRepository } from './repository'
import { getScorer, setScorer, useAppStore } from './useAppStore'

/** Puntuador real de la aplicacion, para restaurarlo tras cada test. */
const REAL_SCORER = getScorer()

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
    batches: [],
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
    activeManualBatchId: null,
    importDefaults: {},
    retry: DEFAULT_RETRY_SETTINGS,
    filters: { text: '', source: 'all', status: 'all', onlyWithIssues: false, batchId: 'all' },
  })
  setProviders(null)
  setScorer(REAL_SCORER)
})

afterEach(() => {
  setProviders(null)
  setScorer(REAL_SCORER)
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

describe('grupos', () => {
  it('cada importacion crea su lote con archivo, hoja y fecha', async () => {
    const file = await xlsxFile('tiendas.xlsx', {
      Tiendas: [
        ['CLIENTE', 'CIUDAD'],
        ['Olimpica', 'Barranquilla'],
      ],
    })
    await useAppStore.getState().openFile(file)
    await useAppStore.getState().confirmImport()

    const { batches, records } = useAppStore.getState()
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({
      label: 'tiendas.xlsx',
      sheetName: 'Tiendas',
      source: 'excel',
      importedCount: 1,
    })
    expect(batches[0]?.createdAt).not.toBe('')
    expect(records[0]?.batchId).toBe(batches[0]?.id)
  })

  it('importar dos veces el mismo archivo genera dos lotes distintos', async () => {
    const make = () =>
      xlsxFile('tiendas.xlsx', {
        Tiendas: [
          ['CLIENTE', 'CIUDAD'],
          ['Olimpica', 'Barranquilla'],
        ],
      })

    await useAppStore.getState().openFile(await make())
    await useAppStore.getState().confirmImport()
    await useAppStore.getState().openFile(await make())
    await useAppStore.getState().confirmImport()

    const { batches, records } = useAppStore.getState()
    expect(batches).toHaveLength(2)
    expect(batches[0]?.id).not.toBe(batches[1]?.id)
    expect(new Set(records.map((record) => record.batchId)).size).toBe(2)
  })

  it('no crea lote si la hoja no genera ningun registro', async () => {
    const file = csvFile('vacio.csv', 'CLIENTE\n')
    await useAppStore.getState().openFile(file)
    await useAppStore.getState().confirmImport()

    expect(useAppStore.getState().batches).toEqual([])
  })

  it('los registros de una sesion manual comparten un solo grupo', async () => {
    await useAppStore.getState().addManualRecord({ client: 'Toks' })
    await useAppStore.getState().addManualRecord({ client: 'Starbucks' })
    await useAppStore.getState().addManualRecord({ client: 'Chedraui' })

    const { batches, records } = useAppStore.getState()
    expect(batches).toHaveLength(1)
    expect(batches[0]?.source).toBe('manual')
    expect(batches[0]?.label).toMatch(/^Manual — /)
    expect(new Set(records.map((record) => record.batchId)).size).toBe(1)
  })

  it('cerrar el grupo manual abre otro con el siguiente registro', async () => {
    await useAppStore.getState().addManualRecord({ client: 'Toks' })
    const first = useAppStore.getState().activeManualBatchId

    useAppStore.getState().closeManualGroup()
    expect(useAppStore.getState().activeManualBatchId).toBeNull()

    await useAppStore.getState().addManualRecord({ client: 'Starbucks' })
    const second = useAppStore.getState().activeManualBatchId

    expect(second).not.toBeNull()
    expect(second).not.toBe(first)

    const { batches, records } = useAppStore.getState()
    expect(batches).toHaveLength(2)
    expect(records[0]?.batchId).toBe(first)
    expect(records[1]?.batchId).toBe(second)
  })

  it('un Excel no se mezcla con la sesion manual abierta', async () => {
    await useAppStore.getState().addManualRecord({ client: 'Toks' })
    const manualId = useAppStore.getState().activeManualBatchId

    const file = csvFile('tiendas.csv', 'CLIENTE\nOlimpica\n')
    await useAppStore.getState().openFile(file)
    await useAppStore.getState().confirmImport()

    const { records, batches } = useAppStore.getState()
    expect(batches).toHaveLength(2)
    const excel = records.find((record) => record.source === 'excel')
    expect(excel?.batchId).not.toBe(manualId)
  })

  it('dos Excel distintos generan dos grupos con su propio nombre', async () => {
    const barranquilla = csvFile('clientes_barranquilla.csv', 'CLIENTE\nOlimpica\nExito\n')
    const cartagena = csvFile('clientes_cartagena.csv', 'CLIENTE\nOlimpica\n')

    await useAppStore.getState().openFile(barranquilla)
    await useAppStore.getState().confirmImport()
    await useAppStore.getState().openFile(cartagena)
    await useAppStore.getState().confirmImport()

    const { batches, records } = useAppStore.getState()
    expect(batches.map((batch) => batch.label)).toEqual([
      'clientes_barranquilla.csv',
      'clientes_cartagena.csv',
    ])
    expect(batches.map((batch) => batch.importedCount)).toEqual([2, 1])

    const first = batches[0]
    const second = batches[1]
    expect(records.filter((record) => record.batchId === first?.id)).toHaveLength(2)
    expect(records.filter((record) => record.batchId === second?.id)).toHaveLength(1)
  })

  it('borrar el grupo manual abierto no deja apuntando a un grupo inexistente', async () => {
    await useAppStore.getState().addManualRecord({ client: 'Toks' })
    const id = useAppStore.getState().activeManualBatchId
    if (id === null) throw new Error('se esperaba un grupo manual abierto')

    await useAppStore.getState().deleteBatch(id)

    expect(useAppStore.getState().activeManualBatchId).toBeNull()

    await useAppStore.getState().addManualRecord({ client: 'Starbucks' })
    const next = useAppStore.getState().activeManualBatchId
    expect(useAppStore.getState().batches.some((batch) => batch.id === next)).toBe(true)
  })

  it('cada registro guarda su fecha y hora de creacion', async () => {
    await useAppStore.getState().addManualRecord({ client: 'Toks' })
    const record = useAppStore.getState().records[0]

    expect(record?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(record?.updatedAt).toBe(record?.createdAt)
  })

  it('duplicar deja la copia en el mismo lote', async () => {
    const id = await useAppStore.getState().addManualRecord({ client: 'Toks' })
    await useAppStore.getState().duplicateRecord(id)

    const records = useAppStore.getState().records
    expect(records[1]?.batchId).toBe(records[0]?.batchId)
  })

  it('borrar un lote se lleva sus registros y deja los demas', async () => {
    const file = csvFile('t.csv', 'CLIENTE\nOlimpica\n')
    await useAppStore.getState().openFile(file)
    await useAppStore.getState().confirmImport()
    await useAppStore.getState().addManualRecord({ client: 'Toks' })

    const excelBatch = useAppStore.getState().batches.find((batch) => batch.source === 'excel')
    if (!excelBatch) throw new Error('se esperaba un lote de excel')

    await useAppStore.getState().deleteBatch(excelBatch.id)

    const { records, batches } = useAppStore.getState()
    expect(batches).toHaveLength(1)
    expect(records).toHaveLength(1)
    expect(records[0]?.fields.client).toBe('Toks')
  })

  it('los lotes sobreviven a la rehidratacion', async () => {
    await useAppStore.getState().addManualRecord({ client: 'Chedraui' })

    useAppStore.setState({ records: [], batches: [], isHydrated: false })
    await useAppStore.getState().hydrate()

    expect(useAppStore.getState().batches).toHaveLength(1)
  })
})

/**
 * Reintentos de la geocodificacion.
 *
 * Se inyecta un proveedor de mentira para poder decidir exactamente que
 * encuentra y en que vuelta. Asi se prueba la logica del bucle —cuando
 * reintenta, sobre que registros y cuando se rinde— sin salir a la red.
 */
describe('reintentos de la geocodificacion', () => {
  /** Candidato con la forma que espera el dominio. */
  function candidate(name: string): ProviderCandidate {
    return {
      latitude: 11,
      longitude: -74.8,
      name,
      address: `${name}, Carrera 52, Barranquilla`,
      components: { ...emptyComponents(), city: 'Barranquilla', region: 'Atlantico' },
      category: 'supermarket',
      rank: 0,
      raw: {},
    }
  }

  /**
   * Proveedor que encuentra un registro solo a partir de la vuelta indicada.
   *
   * Responde unicamente a la estrategia 0 —la consulta mas especifica, la que
   * lleva direccion— y devuelve vacio para el resto. Dos razones: asi cada
   * vuelta cuenta exactamente un intento por registro, y un acierto llega con
   * la consulta especifica, que es la unica que no queda limitada por el tope
   * de poca especificidad y por tanto se acepta como FOUND.
   *
   * `foundFrom` mapea el nombre del local a la vuelta desde la que empieza a
   * devolver resultado (1 = la pasada inicial). Ausente = nunca encuentra.
   */
  function scriptedProvider(foundFrom: Record<string, number>) {
    /** Solo las consultas especificas: una por registro y por vuelta. */
    const probes: string[] = []
    const attempts = new Map<string, number>()

    const provider: GeocoderProvider = {
      name: 'falso',
      requestsPerSecond: 1000,
      search: (query) => {
        if (query.strategy !== 0) return Promise.resolve([])
        probes.push(query.text)

        const key = Object.keys(foundFrom).find((name) => query.text.includes(name))
        if (key === undefined) return Promise.resolve([])

        const attempt = (attempts.get(key) ?? 0) + 1
        attempts.set(key, attempt)

        const threshold = foundFrom[key]
        if (threshold === undefined || attempt < threshold) return Promise.resolve([])
        return Promise.resolve([candidate(key)])
      },
    }

    return { provider, probes }
  }

  /** Puntuador que acepta cualquier candidato: aisla el bucle del scoring. */
  const alwaysAccept = () => ({ confidence: 1, signals: { location_name: 1 } })

  /** Registros con direccion, para que la consulta cuente como especifica. */
  async function seed(names: readonly string[]): Promise<void> {
    for (const [index, name] of names.entries()) {
      await useAppStore.getState().addManualRecord({
        location_name: name,
        address: `Carrera ${String(50 + index)}`,
        city: 'Barranquilla',
      })
    }
  }

  it('no reintenta si la primera pasada alcanza el porcentaje minimo', async () => {
    await seed(['Alfa', 'Beta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 40, maxRetries: 3 })

    const { provider, probes } = scriptedProvider({ Alfa: 1, Beta: 1 })
    setProviders([provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    const { geocoding } = useAppStore.getState()
    expect(geocoding.percentage).toBe(100)
    expect(geocoding.rounds).toHaveLength(1)
    expect(geocoding.attempt).toBe(0)
    expect(geocoding.stopReason).toBe('threshold-met')
    expect(geocoding.phase).toBe('completed')
    // Dos registros, una consulta especifica cada uno: no se repitio nada.
    expect(probes).toHaveLength(2)
  })

  it('el porcentaje justo en el minimo no dispara reintento', async () => {
    await seed(['Alfa', 'Beta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 50, maxRetries: 3 })

    setProviders([scriptedProvider({ Alfa: 1 }).provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    const { geocoding } = useAppStore.getState()
    expect(geocoding.percentage).toBe(50)
    expect(geocoding.rounds).toHaveLength(1)
    expect(geocoding.stopReason).toBe('threshold-met')
  })

  it('reintenta cuando el porcentaje queda por debajo del minimo', async () => {
    await seed(['Alfa', 'Beta', 'Gamma', 'Delta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 50, maxRetries: 3 })

    // Alfa entra a la primera; Beta solo a la segunda. 25% -> 50%.
    setProviders([scriptedProvider({ Alfa: 1, Beta: 2 }).provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    const { geocoding } = useAppStore.getState()
    expect(geocoding.rounds.map((round) => round.percentage)).toEqual([25, 50])
    expect(geocoding.stopReason).toBe('threshold-met')
    expect(geocoding.phase).toBe('completed')
  })

  it('reintenta solo los registros que fallaron, no los ya resueltos', async () => {
    await seed(['Alfa', 'Beta', 'Gamma', 'Delta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 50, maxRetries: 1 })

    const { provider, probes } = scriptedProvider({ Alfa: 1 })
    setProviders([provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    // Alfa se consulto una vez en la pasada inicial y nunca mas.
    expect(probes.filter((text) => text.includes('Alfa'))).toHaveLength(1)
    // Los otros tres, una vez por vuelta: inicial + un reintento.
    expect(probes.filter((text) => text.includes('Beta'))).toHaveLength(2)
    expect(useAppStore.getState().geocoding.rounds[1]?.total).toBe(4)
  })

  it('respeta el maximo de reintentos y se rinde', async () => {
    await seed(['Alfa', 'Beta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 90, maxRetries: 2 })

    setProviders([scriptedProvider({}).provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    const { geocoding } = useAppStore.getState()
    // Pasada inicial + 2 reintentos.
    expect(geocoding.rounds).toHaveLength(3)
    expect(geocoding.attempt).toBe(2)
    expect(geocoding.stopReason).toBe('no-retries-left')
    expect(geocoding.phase).toBe('partial')
    expect(geocoding.percentage).toBe(0)
  })

  it('con cero reintentos configurados no hay segunda vuelta', async () => {
    await seed(['Alfa', 'Beta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 90, maxRetries: 0 })

    const { provider, probes } = scriptedProvider({})
    setProviders([provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    expect(useAppStore.getState().geocoding.rounds).toHaveLength(1)
    expect(useAppStore.getState().geocoding.stopReason).toBe('no-retries-left')
    expect(probes).toHaveLength(2)
  })

  /**
   * Un registro con candidato flojo no se reintenta: la consulta seria la misma
   * y el proveedor devolveria lo mismo. Lo decide una persona en revision.
   */
  it('se detiene si lo que falta ya tiene candidato y solo espera decision', async () => {
    await seed(['Alfa', 'Beta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 90, maxRetries: 3 })

    setProviders([scriptedProvider({ Alfa: 1, Beta: 1 }).provider])
    // Confianza intermedia: hay resultado, pero no se acepta solo.
    setScorer(() => ({ confidence: 0.6, signals: { location_name: 0.6 } }))

    await useAppStore.getState().runGeocoding()

    const { geocoding, records } = useAppStore.getState()
    expect(records.every((record) => record.result !== null)).toBe(true)
    expect(geocoding.rounds).toHaveLength(1)
    expect(geocoding.stopReason).toBe('nothing-to-retry')
    expect(geocoding.phase).toBe('partial')
  })

  it('el porcentaje se mide sobre el conjunto inicial, no sobre los reintentos', async () => {
    await seed(['Alfa', 'Beta', 'Gamma', 'Delta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 100, maxRetries: 1 })

    setProviders([scriptedProvider({ Alfa: 1, Beta: 2 }).provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    const rounds = useAppStore.getState().geocoding.rounds
    // La segunda vuelta procesa 3 registros pero mide sobre los 4 del inicio.
    expect(rounds[1]?.processed).toBe(3)
    expect(rounds[1]?.total).toBe(4)
    expect(rounds[1]?.percentage).toBe(50)
  })

  it('geocodificar una seleccion concreta solo mide y reintenta esa seleccion', async () => {
    await seed(['Alfa', 'Beta'])
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 90, maxRetries: 1 })

    const { provider, probes } = scriptedProvider({})
    setProviders([provider])
    setScorer(alwaysAccept)

    const target = useAppStore
      .getState()
      .records.find((record) => record.fields.location_name === 'Alfa')
    if (!target) throw new Error('se esperaba el registro Alfa')

    await useAppStore.getState().runGeocoding([target.id])

    expect(useAppStore.getState().geocoding.rounds[0]?.total).toBe(1)
    expect(probes.every((text) => text.includes('Alfa'))).toBe(true)
  })

  it('guarda los componentes geograficos del resultado', async () => {
    await seed(['Alfa'])
    setProviders([scriptedProvider({ Alfa: 1 }).provider])
    setScorer(alwaysAccept)

    await useAppStore.getState().runGeocoding()

    const result = useAppStore.getState().records[0]?.result
    expect(result?.components.city).toBe('Barranquilla')
    expect(result?.components.region).toBe('Atlantico')
  })

  it('los ajustes de reintento se acotan y sobreviven a la rehidratacion', async () => {
    useAppStore.getState().setRetrySettings({ minimumSuccessPercentage: 250, maxRetries: -5 })
    expect(useAppStore.getState().retry).toEqual({
      minimumSuccessPercentage: 100,
      maxRetries: 0,
    })

    useAppStore.setState({ retry: DEFAULT_RETRY_SETTINGS })
    await useAppStore.getState().hydrate()

    expect(useAppStore.getState().retry).toEqual({
      minimumSuccessPercentage: 100,
      maxRetries: 0,
    })
  })
})

/**
 * Valor escrito a mano para toda una carga, cuando el Excel no trae la columna.
 *
 * Es el caso real: un archivo de tiendas de una sola cadena no repite el nombre
 * de la cadena en cada fila porque quien lo hizo ya sabia de quien era.
 */
describe('completar datos que faltan en la carga', () => {
  it('aplica el cliente escrito a mano a todos los registros del archivo', async () => {
    const file = csvFile(
      'tiendas.csv',
      'NOMBRE DEL LOCAL,CIUDAD\nPrado,Barranquilla\nNorte,Bogota\n',
    )
    await useAppStore.getState().openFile(file)

    useAppStore.getState().setImportDefault('client', 'Olimpica')
    await useAppStore.getState().confirmImport()

    const { records } = useAppStore.getState()
    expect(records).toHaveLength(2)
    expect(records.map((record) => record.fields.client)).toEqual(['Olimpica', 'Olimpica'])
    // Y el nombre del local sigue siendo el de cada fila.
    expect(records.map((record) => record.fields.location_name)).toEqual(['Prado', 'Norte'])
  })

  it('no pisa el cliente de las filas que si lo traen', async () => {
    const file = csvFile('tiendas.csv', 'CLIENTE,NOMBRE DEL LOCAL\nExito,Country\n,Prado\n')
    await useAppStore.getState().openFile(file)

    useAppStore.getState().setImportDefault('client', 'Olimpica')
    await useAppStore.getState().confirmImport()

    expect(useAppStore.getState().records.map((record) => record.fields.client)).toEqual([
      'Exito',
      'Olimpica',
    ])
  })

  it('el valor se olvida al quitar el archivo', async () => {
    const file = csvFile('tiendas.csv', 'NOMBRE DEL LOCAL\nPrado\n')
    await useAppStore.getState().openFile(file)
    useAppStore.getState().setImportDefault('client', 'Olimpica')

    useAppStore.getState().clearImport()

    expect(useAppStore.getState().importDefaults).toEqual({})
  })

  /** Dos archivos distintos son de dos cadenas distintas. */
  it('cargar otro archivo no arrastra el valor del anterior', async () => {
    await useAppStore.getState().openFile(csvFile('a.csv', 'NOMBRE DEL LOCAL\nPrado\n'))
    useAppStore.getState().setImportDefault('client', 'Olimpica')
    await useAppStore.getState().confirmImport()

    await useAppStore.getState().openFile(csvFile('b.csv', 'NOMBRE DEL LOCAL\nCentro\n'))
    expect(useAppStore.getState().importDefaults).toEqual({})

    await useAppStore.getState().confirmImport()

    const { records } = useAppStore.getState()
    expect(records[0]?.fields.client).toBe('Olimpica')
    expect(records[1]?.fields.client).toBe('')
  })

  it('el valor por defecto entra en la consulta de geocodificacion', async () => {
    const file = csvFile('tiendas.csv', 'NOMBRE DEL LOCAL,CIUDAD\nPrado,Barranquilla\n')
    await useAppStore.getState().openFile(file)
    useAppStore.getState().setImportDefault('client', 'Olimpica')
    await useAppStore.getState().confirmImport()

    const record = useAppStore.getState().records[0]
    if (!record) throw new Error('se esperaba un registro')

    const { buildQueries } = await import('@/domain/services/queryBuilder')
    const queries = buildQueries(record, { sessionCountry: null })

    // Es el motivo de la funcion: sin cliente se pierde una senal del scoring.
    expect(queries[0]?.text).toContain('Olimpica')
  })
})
