import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GeocodeQuery } from '@/domain/models/geocode'
import { ProviderError } from '@/domain/services/geocoderProvider'

import { createNominatimProvider } from './NominatimProvider'

const QUERY: GeocodeQuery = {
  text: 'Olimpica Calle 72, Barranquilla, Colombia',
  country: { name: 'Colombia', code: 'CO' },
  usedFields: ['location_name', 'city'],
  strategy: 0,
  templateId: 'name+locality',
}

const PLACE = {
  lat: '10.9930',
  lon: '-74.7920',
  name: 'Olímpica',
  display_name: 'Olímpica, Carrera 53, Barranquilla, Atlántico, Colombia',
  type: 'supermarket',
  address: {
    road: 'Carrera 53',
    house_number: '75-140',
    city: 'Barranquilla',
    state: 'Atlántico',
    postcode: '080020',
    country: 'Colombia',
    country_code: 'co',
  },
}

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn((input: RequestInfo | URL) => Promise.resolve(handler(String(input))))
  vi.stubGlobal('fetch', spy)
  return spy
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NominatimProvider', () => {
  it('construye la URL con los parametros de la politica', async () => {
    const spy = mockFetch(() => json([]))
    await createNominatimProvider().search(QUERY, { limit: 3 })

    const url = new URL(String(spy.mock.calls[0]?.[0]))
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(url.searchParams.get('q')).toBe(QUERY.text)
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('limit')).toBe('3')
    expect(url.searchParams.get('countrycodes')).toBe('co')
    expect(url.searchParams.get('accept-language')).toBe('es')
  })

  it('omite el filtro de pais si no se conoce el codigo ISO', async () => {
    const spy = mockFetch(() => json([]))
    await createNominatimProvider().search({
      ...QUERY,
      country: { name: 'Colombia', code: '' },
    })

    const url = new URL(String(spy.mock.calls[0]?.[0]))
    expect(url.searchParams.has('countrycodes')).toBe(false)
  })

  it('traduce la respuesta a candidatos', async () => {
    mockFetch(() => json([PLACE]))
    const [candidate] = await createNominatimProvider().search(QUERY)

    expect(candidate).toMatchObject({
      latitude: 10.993,
      longitude: -74.792,
      name: 'Olímpica',
      address: 'Olímpica, Carrera 53, Barranquilla, Atlántico, Colombia',
      category: 'supermarket',
      rank: 0,
    })
    expect(candidate?.components).toEqual({
      street: 'Carrera 53',
      houseNumber: '75-140',
      city: 'Barranquilla',
      region: 'Atlántico',
      postalCode: '080020',
      country: 'Colombia',
      countryCode: 'CO',
    })
  })

  it('conserva la respuesta cruda para trazabilidad', async () => {
    mockFetch(() => json([PLACE]))
    const [candidate] = await createNominatimProvider().search(QUERY)
    expect(candidate?.raw).toEqual(PLACE)
  })

  it('numera los candidatos por su posicion', async () => {
    mockFetch(() => json([PLACE, { ...PLACE, name: 'Otra' }]))
    const candidates = await createNominatimProvider().search(QUERY)
    expect(candidates.map((item) => item.rank)).toEqual([0, 1])
  })

  it('acepta las variantes de localidad de Nominatim', async () => {
    mockFetch(() => json([{ ...PLACE, address: { town: 'Soledad', county: 'Atlantico' } }]))
    const [candidate] = await createNominatimProvider().search(QUERY)

    expect(candidate?.components.city).toBe('Soledad')
    expect(candidate?.components.region).toBe('Atlantico')
  })

  it('usa el primer segmento del display_name si no hay nombre propio', async () => {
    mockFetch(() => json([{ ...PLACE, name: '' }]))
    const [candidate] = await createNominatimProvider().search(QUERY)
    expect(candidate?.name).toBe('Olímpica')
  })

  it('descarta entradas sin coordenadas validas', async () => {
    mockFetch(() => json([{ ...PLACE, lat: 'x', lon: 'y' }, PLACE]))
    const candidates = await createNominatimProvider().search(QUERY)
    expect(candidates).toHaveLength(1)
  })

  it('devuelve lista vacia cuando no hay resultados', async () => {
    mockFetch(() => json([]))
    expect(await createNominatimProvider().search(QUERY)).toEqual([])
  })

  it('convierte el 429 en un error reintentable', async () => {
    mockFetch(() => json({}, 429))
    await expect(createNominatimProvider().search(QUERY)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    })
  })

  it('convierte el 403 en un error no reintentable', async () => {
    mockFetch(() => json({}, 403))
    await expect(createNominatimProvider().search(QUERY)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      retryable: false,
    })
  })

  it('marca los 5xx como reintentables', async () => {
    mockFetch(() => json({}, 503))
    await expect(createNominatimProvider().search(QUERY)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
      retryable: true,
    })
  })

  it('convierte un fallo de red en ProviderError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    await expect(createNominatimProvider().search(QUERY)).rejects.toBeInstanceOf(ProviderError)
  })

  it('respeta la cancelacion', async () => {
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

    const promise = createNominatimProvider().search(QUERY, { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' })
  })
})
