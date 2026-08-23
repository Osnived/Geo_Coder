import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { normalizeManualEntry } from '@/domain/services/recordNormalizer'
import { sequentialIds, testOptions } from '@/test/factories'

import { createDb } from './db'
import {
  createInMemoryRepository,
  createRecordRepository,
  type RecordRepository,
} from './recordRepository'

const options = () => testOptions({ newId: sequentialIds('r') })

function makeRepositories(): Array<[string, () => RecordRepository]> {
  return [
    [
      'IndexedDB',
      () =>
        createRecordRepository(
          createDb(`test-${String(Math.random())}`, { indexedDB: new IDBFactory(), IDBKeyRange }),
        ),
    ],
    ['memoria', () => createInMemoryRepository()],
  ]
}

describe.each(makeRepositories())('RecordRepository (%s)', (_name, make) => {
  let repository: RecordRepository

  beforeEach(() => {
    repository = make()
  })

  it('empieza vacio', async () => {
    expect(await repository.loadAll()).toEqual([])
    expect(await repository.loadSettings()).toBeNull()
  })

  it('guarda y recupera registros', async () => {
    const ids = sequentialIds('r')
    const first = normalizeManualEntry({ client: 'Olimpica' }, testOptions({ newId: ids }))
    const second = normalizeManualEntry({ client: 'Toks' }, testOptions({ newId: ids }))

    await repository.addMany([first, second])
    const loaded = await repository.loadAll()

    expect(loaded).toHaveLength(2)
    expect(loaded.map((record) => record.fields.client).sort()).toEqual(['Olimpica', 'Toks'])
  })

  it('conserva los datos originales importados', async () => {
    const record = {
      ...normalizeManualEntry({ city: 'Bogota' }, options()),
      original: { CIUDAD: 'Bogota', VENTAS: 15000 },
    }

    await repository.addMany([record])
    const [loaded] = await repository.loadAll()

    expect(loaded?.original).toEqual({ CIUDAD: 'Bogota', VENTAS: 15000 })
  })

  it('actualiza un registro existente sin duplicarlo', async () => {
    const record = normalizeManualEntry({ city: 'Bogota' }, options())
    await repository.addMany([record])
    await repository.save({ ...record, fields: { ...record.fields, city: 'Medellin' } })

    const loaded = await repository.loadAll()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.fields.city).toBe('Medellin')
  })

  it('elimina registros por id', async () => {
    const ids = sequentialIds('r')
    const first = normalizeManualEntry({ city: 'Bogota' }, testOptions({ newId: ids }))
    const second = normalizeManualEntry({ city: 'Cali' }, testOptions({ newId: ids }))
    await repository.addMany([first, second])

    await repository.remove([first.id])

    const loaded = await repository.loadAll()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.fields.city).toBe('Cali')
  })

  it('ignora operaciones con listas vacias', async () => {
    await repository.addMany([])
    await repository.remove([])
    expect(await repository.loadAll()).toEqual([])
  })

  it('vacia todo', async () => {
    await repository.addMany([normalizeManualEntry({ city: 'Bogota' }, options())])
    await repository.clear()
    expect(await repository.loadAll()).toEqual([])
  })

  it('guarda los ajustes de sesion', async () => {
    await repository.saveSettings({
      country: { name: 'Colombia', code: 'CO' },
      requireCountry: true,
      useFallbackProvider: true,
      ai: { enabled: false, endpoint: 'http://localhost:11434', model: 'llama3.1' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const settings = await repository.loadSettings()
    expect(settings?.country).toEqual({ name: 'Colombia', code: 'CO' })
    expect(settings?.requireCountry).toBe(true)
    expect(settings?.useFallbackProvider).toBe(true)
    expect(settings?.ai?.model).toBe('llama3.1')
  })
})

describe('persistencia entre sesiones', () => {
  it('recupera los registros al reabrir la misma base', async () => {
    const deps = { indexedDB: new IDBFactory(), IDBKeyRange }
    const name = 'geolocator-persistencia'

    const first = createRecordRepository(createDb(name, deps))
    await first.addMany([normalizeManualEntry({ client: 'Chedraui' }, options())])

    // Simula recargar la pagina: nueva conexion a la misma base.
    const second = createRecordRepository(createDb(name, deps))
    const loaded = await second.loadAll()

    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.fields.client).toBe('Chedraui')
  })
})
