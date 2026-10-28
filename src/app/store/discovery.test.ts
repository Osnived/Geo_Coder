import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyComponents, type AddressComponents } from '@/domain/models/geocode'
import { ProviderError } from '@/domain/services/geocoderProvider'
import type { DiscoveredPlace, PlaceDiscoveryProvider } from '@/domain/services/placeDiscovery'
import type { ReverseGeocoder, ReversePoint } from '@/domain/services/reverseGeocoder'
import { DEFAULT_RETRY_SETTINGS } from '@/domain/services/retryPolicy'
import { createInMemoryRepository } from '@/infrastructure/storage'

import { setDiscoveryProvider, setReverseGeocoder } from './discovery'
import { getRepository, setRepository } from './repository'
import { useAppStore } from './useAppStore'

/** Locales con ciudad y estado ausentes: son los que la geocodificacion inversa completa. */
function place(
  osmId: string,
  name: string,
  components: Partial<AddressComponents> = {},
): DiscoveredPlace {
  return {
    osmId,
    name,
    brand: 'Soriana',
    businessType: 'Supermercado',
    latitude: 19.5,
    longitude: -99.1,
    components: { ...emptyComponents(), ...components },
    enrichedAddress: false,
    tags: { name },
  }
}

const FULL_ADDRESS: AddressComponents = {
  street: 'Juárez',
  houseNumber: '5',
  city: 'Puebla',
  region: 'Puebla',
  postalCode: '72000',
  country: 'México',
  countryCode: 'MX',
}

function fakeProvider(places: DiscoveredPlace[] = []) {
  const discover = vi.fn(() => Promise.resolve(places))
  const provider: PlaceDiscoveryProvider = { name: 'fake', discover }
  setDiscoveryProvider(provider)
  return discover
}

/** Servicio de geocodificacion inversa simulado, sin pausa entre peticiones. */
function fakeReverse(
  reverse: (point: ReversePoint, signal?: AbortSignal) => Promise<AddressComponents | null>,
) {
  const spy = vi.fn((point: ReversePoint, options?: { signal?: AbortSignal }) =>
    reverse(point, options?.signal),
  )
  const service: ReverseGeocoder = { name: 'fake-reverse', minIntervalMs: 0, reverse: spy }
  setReverseGeocoder(service)
  return spy
}

const INITIAL = useAppStore.getState()

beforeEach(() => {
  setRepository(createInMemoryRepository())
  useAppStore.setState({
    ...INITIAL,
    records: [],
    batches: [],
    activeManualBatchId: null,
    retry: DEFAULT_RETRY_SETTINGS,
    discoveryStatus: 'idle',
    discoveryQuery: null,
    discoveredPlaces: [],
    discoveryError: null,
    discoveryProgress: { done: 0, total: 0 },
  })
  fakeReverse(() => Promise.resolve(FULL_ADDRESS))
})

afterEach(() => {
  setDiscoveryProvider(null)
  setReverseGeocoder(null)
  vi.restoreAllMocks()
})

describe('busqueda de locales', () => {
  it('rechaza una marca no valida sin llamar al proveedor', async () => {
    const discover = fakeProvider()

    await useAppStore.getState().searchPlaces('Soriana"; out;', 'MX')

    expect(discover).not.toHaveBeenCalled()
    expect(useAppStore.getState().discoveryStatus).toBe('error')
    expect(useAppStore.getState().discoveryError).toContain('La marca debe tener')
  })

  it('rechaza un pais que no existe', async () => {
    const discover = fakeProvider()

    await useAppStore.getState().searchPlaces('Soriana', 'XX')

    expect(discover).not.toHaveBeenCalled()
    expect(useAppStore.getState().discoveryError).toBe('Elige un país válido.')
  })

  it('guarda los locales encontrados sin crear registros todavia', async () => {
    fakeProvider([place('node/1', 'Soriana Tepeyac'), place('node/2', 'Soriana Sur')])

    await useAppStore.getState().searchPlaces('  Soriana ', 'MX')

    const state = useAppStore.getState()
    expect(state.discoveryStatus).toBe('ready')
    expect(state.discoveredPlaces).toHaveLength(2)
    expect(state.discoveryQuery?.brand).toBe('Soriana')
    expect(state.discoveryQuery?.country.name).toBe('México')
    expect(state.records).toEqual([])
    expect(state.batches).toEqual([])
  })

  it('muestra el error del proveedor sin dejar resultados viejos', async () => {
    setDiscoveryProvider({
      name: 'fake',
      discover: () =>
        Promise.reject(new ProviderError('overpass', 'RATE_LIMITED', 'Demasiadas peticiones.')),
    })

    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    expect(useAppStore.getState().discoveryStatus).toBe('error')
    expect(useAppStore.getState().discoveryError).toBe('Demasiadas peticiones.')
    expect(useAppStore.getState().discoveredPlaces).toEqual([])
  })
})

describe('completar la direccion de los locales', () => {
  it('rellena calle, ciudad, estado y codigo postal de los locales incompletos', async () => {
    fakeProvider([place('node/1', 'Soriana Tepeyac')])

    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    const [found] = useAppStore.getState().discoveredPlaces
    expect(found?.enrichedAddress).toBe(true)
    expect(found?.components).toMatchObject({
      street: 'Juárez',
      city: 'Puebla',
      region: 'Puebla',
      postalCode: '72000',
    })
  })

  it('no pisa la ciudad que ya trae la fuente', async () => {
    fakeProvider([place('node/1', 'Soriana', { city: 'Zapopan' })])
    fakeReverse(() => Promise.resolve({ ...FULL_ADDRESS, city: 'Puebla' }))

    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    expect(useAppStore.getState().discoveredPlaces[0]?.components.city).toBe('Zapopan')
  })

  it('no consulta el servicio para locales que ya traen la direccion completa', async () => {
    fakeProvider([
      place('node/1', 'Soriana', {
        street: 'Juárez',
        city: 'Puebla',
        region: 'Puebla',
        postalCode: '72000',
      }),
    ])
    const reverse = fakeReverse(() => Promise.resolve(FULL_ADDRESS))

    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    expect(reverse).not.toHaveBeenCalled()
    expect(useAppStore.getState().discoveryStatus).toBe('ready')
  })

  it('deja el local sin completar si el servicio no conoce el punto', async () => {
    fakeProvider([place('node/1', 'Soriana')])
    fakeReverse(() => Promise.resolve(null))

    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    expect(useAppStore.getState().discoveredPlaces[0]?.enrichedAddress).toBe(false)
  })

  it('un fallo puntual omite ese local y sigue con el resto', async () => {
    fakeProvider([place('node/1', 'Uno'), place('node/2', 'Dos')])
    fakeReverse((point) =>
      point.latitude === 19.5 && point.longitude === -99.1
        ? Promise.reject(new ProviderError('nominatim-reverse', 'TIMEOUT', 'lento', true))
        : Promise.resolve(FULL_ADDRESS),
    )

    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    const state = useAppStore.getState()
    expect(state.discoveryStatus).toBe('ready')
    expect(state.discoveryError).toBeNull()
  })

  it('si el servicio prohibe las peticiones, se detiene y conserva lo completado', async () => {
    fakeProvider([place('node/1', 'Uno'), place('node/2', 'Dos'), place('node/3', 'Tres')])
    let calls = 0
    const reverse = fakeReverse(() => {
      calls += 1
      return calls === 1
        ? Promise.resolve(FULL_ADDRESS)
        : Promise.reject(new ProviderError('nominatim-reverse', 'FORBIDDEN', 'Bloqueado.'))
    })

    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    const state = useAppStore.getState()
    expect(reverse).toHaveBeenCalledTimes(2)
    expect(state.discoveredPlaces.filter((p) => p.enrichedAddress)).toHaveLength(1)
    expect(state.discoveryStatus).toBe('ready')
    expect(state.discoveryError).toContain('Se conservan las direcciones ya completadas.')
  })

  it('detener la geocodificacion conserva los locales ya tratados', async () => {
    fakeProvider([place('node/1', 'Uno'), place('node/2', 'Dos')])
    fakeReverse((_point, signal) => {
      // Se queda esperando hasta que alguien cancela.
      return new Promise((resolve) => {
        signal?.addEventListener('abort', () => {
          resolve(null)
        })
      })
    })

    const search = useAppStore.getState().searchPlaces('Soriana', 'MX')
    await vi.waitFor(() => {
      expect(useAppStore.getState().discoveryStatus).toBe('enriching')
    })

    useAppStore.getState().stopEnrichment()
    await search

    const state = useAppStore.getState()
    expect(state.discoveryStatus).toBe('ready')
    expect(state.discoveredPlaces).toHaveLength(2)
  })
})

describe('guardar los locales encontrados', () => {
  it('crea un grupo de OpenStreetMap con todos los locales como registros FOUND', async () => {
    fakeProvider([place('node/1', 'Soriana Tepeyac'), place('node/2', 'Soriana Sur')])
    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    const count = await useAppStore.getState().importDiscoveredPlaces()

    const state = useAppStore.getState()
    expect(count).toBe(2)
    expect(state.batches).toHaveLength(1)
    expect(state.batches[0]).toMatchObject({
      source: 'osm',
      label: 'Soriana · México',
      importedCount: 2,
    })
    expect(state.records).toHaveLength(2)
    expect(state.records.every((record) => record.status === 'FOUND')).toBe(true)
    expect(state.records.every((record) => record.batchId === state.batches[0]?.id)).toBe(true)
  })

  it('el grupo guarda la direccion completada por la geocodificacion inversa', async () => {
    fakeProvider([place('node/1', 'Soriana Tepeyac')])
    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    await useAppStore.getState().importDiscoveredPlaces()

    const [record] = useAppStore.getState().records
    expect(record?.fields).toMatchObject({ address: 'Juárez 5', city: 'Puebla', region: 'Puebla' })
    expect(record?.result?.notes).toContain(
      'Dirección completada por geocodificación inversa (Nominatim).',
    )
  })

  it('persiste el grupo y sus registros en el repositorio', async () => {
    fakeProvider([place('node/1', 'Soriana Tepeyac')])
    await useAppStore.getState().searchPlaces('Soriana', 'MX')

    await useAppStore.getState().importDiscoveredPlaces()

    const repository = getRepository()
    expect(await repository.loadBatches()).toHaveLength(1)
    expect(await repository.loadAll()).toHaveLength(1)
  })

  it('limpia la vista previa al guardar, para no repetir el grupo', async () => {
    fakeProvider([place('node/1', 'Soriana Tepeyac')])
    await useAppStore.getState().searchPlaces('Soriana', 'MX')
    await useAppStore.getState().importDiscoveredPlaces()

    const state = useAppStore.getState()
    expect(state.discoveryStatus).toBe('idle')
    expect(state.discoveredPlaces).toEqual([])
    expect(await useAppStore.getState().importDiscoveredPlaces()).toBe(0)
  })

  it('no guarda nada si no hay una busqueda con resultados', async () => {
    const count = await useAppStore.getState().importDiscoveredPlaces()

    expect(count).toBe(0)
    expect(useAppStore.getState().batches).toEqual([])
  })

  it('descartar la busqueda no toca los datos ya guardados', async () => {
    fakeProvider([place('node/1', 'Soriana Tepeyac')])
    await useAppStore.getState().searchPlaces('Soriana', 'MX')
    await useAppStore.getState().importDiscoveredPlaces()

    fakeProvider([place('node/9', 'Soriana Norte')])
    await useAppStore.getState().searchPlaces('Soriana', 'MX')
    useAppStore.getState().clearDiscovery()

    expect(useAppStore.getState().discoveredPlaces).toEqual([])
    expect(useAppStore.getState().records).toHaveLength(1)
  })
})
