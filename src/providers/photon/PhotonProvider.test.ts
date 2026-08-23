import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GeocodeQuery } from '@/domain/models/geocode'

import { createPhotonProvider } from './PhotonProvider'

const QUERY: GeocodeQuery = {
  text: 'Toks Plaza Universidad, Ciudad de Mexico, Mexico',
  country: { name: 'Mexico', code: 'MX' },
  usedFields: ['location_name', 'city'],
  strategy: 0,
  templateId: 'name+locality',
}

const FEATURE = {
  geometry: { coordinates: [-99.1655, 19.3652] },
  properties: {
    name: 'Toks',
    street: 'Avenida Universidad',
    housenumber: '1000',
    postcode: '03330',
    city: 'Ciudad de México',
    state: 'CDMX',
    country: 'México',
    countrycode: 'mx',
    osm_key: 'amenity',
    osm_value: 'restaurant',
  },
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhotonProvider', () => {
  it('construye la URL con los parametros esperados', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonProvider().search(QUERY, { limit: 4 })

    const url = new URL(String(spy.mock.calls[0]?.[0]))
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/')
    expect(url.searchParams.get('q')).toBe(QUERY.text)
    expect(url.searchParams.get('limit')).toBe('4')
    // Photon devuelve 400 con lang=es, asi que no se envia por defecto.
    expect(url.searchParams.has('lang')).toBe(false)
  })

  it('envia lang solo cuando es uno de los admitidos', async () => {
    const spy = mockFetch({ features: [] })
    await createPhotonProvider({ language: 'en' }).search(QUERY)

    const url = new URL(String(spy.mock.calls[0]?.[0]))
    expect(url.searchParams.get('lang')).toBe('en')
  })

  it('invierte el orden de GeoJSON a latitud/longitud', async () => {
    mockFetch({ features: [FEATURE] })
    const [candidate] = await createPhotonProvider().search(QUERY)

    expect(candidate?.latitude).toBe(19.3652)
    expect(candidate?.longitude).toBe(-99.1655)
  })

  it('compone una direccion legible a partir de las partes', async () => {
    mockFetch({ features: [FEATURE] })
    const [candidate] = await createPhotonProvider().search(QUERY)

    expect(candidate?.address).toBe(
      'Toks, Avenida Universidad 1000, 03330, Ciudad de México, CDMX, México',
    )
  })

  it('normaliza los componentes igual que el proveedor principal', async () => {
    mockFetch({ features: [FEATURE] })
    const [candidate] = await createPhotonProvider().search(QUERY)

    expect(candidate?.components).toEqual({
      street: 'Avenida Universidad',
      houseNumber: '1000',
      city: 'Ciudad de México',
      region: 'CDMX',
      postalCode: '03330',
      country: 'México',
      countryCode: 'MX',
    })
    expect(candidate?.category).toBe('restaurant')
  })

  it('cae en district o county si no hay ciudad', async () => {
    mockFetch({
      features: [
        {
          ...FEATURE,
          properties: { ...FEATURE.properties, city: undefined, district: 'Coyoacán' },
        },
      ],
    })
    const [candidate] = await createPhotonProvider().search(QUERY)

    expect(candidate?.components.city).toBe('Coyoacán')
  })

  it('descarta features sin coordenadas utilizables', async () => {
    mockFetch({
      features: [{ geometry: { coordinates: ['x', 'y'] }, properties: {} }, FEATURE],
    })
    const candidates = await createPhotonProvider().search(QUERY)

    expect(candidates).toHaveLength(1)
  })

  it('devuelve lista vacia si la respuesta no trae features', async () => {
    mockFetch({})
    expect(await createPhotonProvider().search(QUERY)).toEqual([])
  })

  it('numera los candidatos por posicion', async () => {
    mockFetch({ features: [FEATURE, FEATURE] })
    const candidates = await createPhotonProvider().search(QUERY)
    expect(candidates.map((item) => item.rank)).toEqual([0, 1])
  })

  it('convierte los errores HTTP en ProviderError', async () => {
    mockFetch({}, 429)
    await expect(createPhotonProvider().search(QUERY)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      provider: 'photon',
    })
  })
})
