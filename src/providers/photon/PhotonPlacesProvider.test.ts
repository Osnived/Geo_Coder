import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProviderError } from '@/domain/services/geocoderProvider'
import type { PlaceQuery } from '@/domain/services/placeProvider'

import { createPhotonPlacesProvider } from './PhotonPlacesProvider'

const COLOMBIA = { name: 'Colombia', code: 'CO' }

const CITY_QUERY: PlaceQuery = { text: 'barran', kind: 'city', country: COLOMBIA }

function feature(properties: Record<string, unknown>) {
  return { properties }
}

function mockFetch(body: unknown, status = 200) {
  const spy = vi.fn((_input: RequestInfo | URL) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

function urlOf(spy: ReturnType<typeof mockFetch>): URL {
  return new URL(String(spy.mock.calls[0]?.[0]))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('construccion de la consulta', () => {
  /**
   * Photon no admite filtrar por pais. Se comprobo contra el servicio real que
   * meter el nombre del pais en la consulta da mejor resultado que su `bbox`.
   */
  it('mete el nombre del pais dentro de la consulta', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(urlOf(spy).searchParams.get('q')).toBe('barran Colombia')
  })

  it('sin pais envia solo lo escrito', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest({ ...CITY_QUERY, country: null })

    expect(urlOf(spy).searchParams.get('q')).toBe('barran')
  })

  it('pide el indice de nucleos de poblacion para las ciudades', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(urlOf(spy).searchParams.get('layer')).toBe('city')
  })

  it('pide el indice de regiones para los departamentos', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest({ ...CITY_QUERY, kind: 'region' })

    expect(urlOf(spy).searchParams.get('layer')).toBe('state')
  })

  /** Pedir `lang=es` devuelve un 400: solo acepta default, de, en y fr. */
  it('no envia el parametro de idioma', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(urlOf(spy).searchParams.has('lang')).toBe(false)
  })

  it('pide mas resultados de los que se van a mostrar', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(Number(urlOf(spy).searchParams.get('limit'))).toBeGreaterThan(8)
  })

  it('respeta un limite propio', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest(CITY_QUERY, { limit: 5 })

    expect(urlOf(spy).searchParams.get('limit')).toBe('5')
  })

  it('recorta los espacios de lo escrito', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider().suggest({ ...CITY_QUERY, text: '  barran  ' })

    expect(urlOf(spy).searchParams.get('q')).toBe('barran Colombia')
  })

  it('con texto vacio no hace ninguna peticion', async () => {
    const spy = mockFetch({ features: [] })
    const result = await createPhotonPlacesProvider().suggest({ ...CITY_QUERY, text: '   ' })

    expect(result).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('usa el endpoint indicado', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonPlacesProvider({ endpoint: 'https://photon.local/api/' }).suggest(CITY_QUERY)

    expect(urlOf(spy).host).toBe('photon.local')
  })
})

describe('traduccion de la respuesta', () => {
  it('convierte una ciudad con su departamento', async () => {
    mockFetch({
      features: [
        feature({
          name: 'Barranquilla',
          state: 'Atlántico',
          country: 'Colombia',
          countrycode: 'co',
          type: 'city',
        }),
      ],
    })

    const result = await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(result).toEqual([
      {
        name: 'Barranquilla',
        kind: 'city',
        region: 'Atlántico',
        countryCode: 'CO',
        countryName: 'Colombia',
      },
    ])
  })

  /** En algunos paises OSM cuelga el municipio del condado. */
  it('cae en el condado si no hay estado', async () => {
    mockFetch({
      features: [feature({ name: 'Algun sitio', county: 'Algun condado', countrycode: 'co' })],
    })

    const result = await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(result[0]?.region).toBe('Algun condado')
  })

  /** Una region no esta dentro de otra region. */
  it('deja la region vacia cuando la sugerencia ya es una region', async () => {
    mockFetch({
      features: [feature({ name: 'Atlántico', state: 'Atlántico', countrycode: 'co' })],
    })

    const result = await createPhotonPlacesProvider().suggest({
      ...CITY_QUERY,
      kind: 'region',
    })

    expect(result[0]).toMatchObject({ name: 'Atlántico', kind: 'region', region: '' })
  })

  it('pone el codigo de pais en mayusculas', async () => {
    mockFetch({ features: [feature({ name: 'Cali', countrycode: 'co' })] })

    const result = await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(result[0]?.countryCode).toBe('CO')
  })

  it('descarta las respuestas sin nombre', async () => {
    mockFetch({
      features: [
        feature({ countrycode: 'co' }),
        feature({ name: '  ' }),
        feature({ name: 'Cali' }),
      ],
    })

    const result = await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(result.map((entry) => entry.name)).toEqual(['Cali'])
  })

  it('rellena con cadena vacia lo que el proveedor no informa', async () => {
    mockFetch({ features: [feature({ name: 'Cali' })] })

    const result = await createPhotonPlacesProvider().suggest(CITY_QUERY)

    expect(result[0]).toEqual({
      name: 'Cali',
      kind: 'city',
      region: '',
      countryCode: '',
      countryName: '',
    })
  })

  it('una lista vacia no es un error', async () => {
    mockFetch({ features: [] })

    expect(await createPhotonPlacesProvider().suggest(CITY_QUERY)).toEqual([])
  })
})

describe('errores', () => {
  it('avisa si la respuesta no trae la lista esperada', async () => {
    mockFetch({ algo: 'raro' })

    await expect(createPhotonPlacesProvider().suggest(CITY_QUERY)).rejects.toThrow(ProviderError)
  })

  it('traduce el exceso de peticiones', async () => {
    mockFetch({}, 429)

    await expect(createPhotonPlacesProvider().suggest(CITY_QUERY)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
  })

  it('traduce un error del servidor', async () => {
    mockFetch({}, 503)

    await expect(createPhotonPlacesProvider().suggest(CITY_QUERY)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    })
  })

  /**
   * El `fetch` simulado tiene que atender la senal: si resolviera de todas
   * formas, el test comprobaria el simulacro y no la traduccion del error.
   */
  it('propaga la cancelacion', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'))
            })
          }),
      ),
    )

    const promise = createPhotonPlacesProvider().suggest(CITY_QUERY, {
      signal: controller.signal,
    })
    controller.abort()

    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' })
  })
})
