import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProviderError } from '@/domain/services/geocoderProvider'
import type { DiscoveryQuery } from '@/domain/services/placeDiscovery'

import {
  buildOverpassQuery,
  createOverpassProvider,
  parseOverpassResponse,
} from './OverpassProvider'

const MEXICO = { name: 'México', code: 'MX' }
const QUERY: DiscoveryQuery = { brand: 'Soriana', country: MEXICO }

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

describe('buildOverpassQuery', () => {
  it('acota la busqueda al area del pais', () => {
    expect(buildOverpassQuery(QUERY)).toContain('area["ISO3166-1"="MX"][admin_level=2]->.country;')
  })

  it('busca por marca exacta, sin expresiones regulares', () => {
    expect(buildOverpassQuery(QUERY)).toContain('nwr["brand"="Soriana"](area.country);')
  })

  it('pide centros y etiquetas, con el tiempo maximo del servidor', () => {
    const query = buildOverpassQuery(QUERY)

    expect(query).toContain('[out:json][timeout:90];')
    expect(query).toContain('out center tags;')
  })

  it('se niega a construir la consulta con una marca que no es valida', () => {
    expect(() => buildOverpassQuery({ ...QUERY, brand: 'Soriana"; out;' })).toThrow(
      'caracteres no permitidos',
    )
  })
})

describe('parseOverpassResponse', () => {
  it('convierte nodos y poligonos en locales, con su posicion', () => {
    const places = parseOverpassResponse({
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 19.5,
          lon: -99.1,
          tags: { name: 'Soriana Tepeyac', shop: 'supermarket', brand: 'Soriana' },
        },
        {
          type: 'way',
          id: 2,
          center: { lat: 25.6, lon: -100.3 },
          tags: { name: 'Soriana Hiper Sur', shop: 'department_store' },
        },
      ],
    })

    // Ordenados por nombre: "Hiper Sur" va antes que "Tepeyac".
    expect(places).toEqual([
      expect.objectContaining({
        osmId: 'way/2',
        latitude: 25.6,
        longitude: -100.3,
        businessType: 'Tienda departamental',
      }),
      expect.objectContaining({
        osmId: 'node/1',
        latitude: 19.5,
        longitude: -99.1,
        businessType: 'Supermercado',
      }),
    ])
  })

  it('descarta elementos sin posicion', () => {
    const places = parseOverpassResponse({
      elements: [{ type: 'relation', id: 3, tags: { name: 'Soriana' } }],
    })

    expect(places).toEqual([])
  })

  it('no repite un mismo elemento que llega dos veces', () => {
    const element = { type: 'node', id: 7, lat: 19, lon: -99, tags: { name: 'Soriana' } }
    const places = parseOverpassResponse({ elements: [element, element] })

    expect(places).toHaveLength(1)
  })

  it('separa la direccion de las etiquetas addr:*', () => {
    const [place] = parseOverpassResponse({
      elements: [
        {
          type: 'node',
          id: 4,
          lat: 19,
          lon: -99,
          tags: {
            name: 'Soriana',
            'addr:street': 'Juárez',
            'addr:housenumber': '120',
            'addr:state': 'Puebla',
            'addr:postcode': '72000',
          },
        },
      ],
    })

    expect(place?.components).toMatchObject({
      street: 'Juárez',
      houseNumber: '120',
      region: 'Puebla',
      postalCode: '72000',
    })
  })

  it('busca la ciudad en addr:town si no hay addr:city', () => {
    const [place] = parseOverpassResponse({
      elements: [{ type: 'node', id: 5, lat: 19, lon: -99, tags: { 'addr:town': 'Tlaxcala' } }],
    })

    expect(place?.components.city).toBe('Tlaxcala')
  })

  it('usa la marca como nombre si el local no tiene nombre', () => {
    const [place] = parseOverpassResponse({
      elements: [{ type: 'node', id: 6, lat: 19, lon: -99, tags: { brand: 'Soriana' } }],
    })

    expect(place?.name).toBe('Soriana')
  })

  it('avisa cuando Overpass no pudo terminar la consulta', () => {
    expect(() =>
      parseOverpassResponse({ elements: [], remark: 'runtime error: Query timed out' }),
    ).toThrow(ProviderError)
  })

  it('rechaza una respuesta sin lista de elementos', () => {
    expect(() => parseOverpassResponse({})).toThrow('respuesta inesperada')
  })
})

describe('createOverpassProvider', () => {
  it('envia la consulta en el parametro data', async () => {
    const spy = mockFetch({ elements: [] })
    await createOverpassProvider().discover(QUERY)

    const url = new URL(String(spy.mock.calls[0]?.[0]))
    expect(url.searchParams.get('data')).toBe(buildOverpassQuery(QUERY))
  })

  it('devuelve los locales de la respuesta', async () => {
    mockFetch({
      elements: [{ type: 'node', id: 1, lat: 19, lon: -99, tags: { name: 'Soriana Tepeyac' } }],
    })

    const places = await createOverpassProvider().discover(QUERY)

    expect(places).toHaveLength(1)
    expect(places[0]?.name).toBe('Soriana Tepeyac')
  })

  it('traduce un 429 a limite de peticiones', async () => {
    mockFetch({}, 429)

    await expect(createOverpassProvider().discover(QUERY)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      provider: 'overpass',
    })
  })
})
