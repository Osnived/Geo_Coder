import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProviderError } from '@/domain/services/geocoderProvider'

import { createNominatimReverseGeocoder } from './NominatimReverseProvider'

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

describe('geocodificacion inversa de Nominatim', () => {
  it('pide la direccion de las coordenadas al endpoint de reverse', async () => {
    const spy = mockFetch({ address: {} })
    await createNominatimReverseGeocoder().reverse({ latitude: 19.5, longitude: -99.1 })

    const url = new URL(String(spy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/reverse')
    expect(url.searchParams.get('lat')).toBe('19.5')
    expect(url.searchParams.get('lon')).toBe('-99.1')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('accept-language')).toBe('es')
  })

  it('separa la direccion en sus componentes', async () => {
    mockFetch({
      address: {
        road: 'Juárez',
        house_number: '5',
        city: 'Puebla',
        state: 'Puebla',
        postcode: '72000',
        country: 'México',
        country_code: 'mx',
      },
    })

    const components = await createNominatimReverseGeocoder().reverse({
      latitude: 19.5,
      longitude: -99.1,
    })

    expect(components).toEqual({
      street: 'Juárez',
      houseNumber: '5',
      city: 'Puebla',
      region: 'Puebla',
      postalCode: '72000',
      country: 'México',
      countryCode: 'MX',
    })
  })

  it('devuelve null cuando el servicio no conoce el punto', async () => {
    mockFetch({ error: 'Unable to geocode' })

    const components = await createNominatimReverseGeocoder().reverse({
      latitude: 0,
      longitude: 0,
    })

    expect(components).toBeNull()
  })

  it('traduce un 403 a acceso bloqueado', async () => {
    mockFetch({}, 403)

    await expect(
      createNominatimReverseGeocoder().reverse({ latitude: 19.5, longitude: -99.1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', provider: 'nominatim-reverse' })
  })

  it('respeta una peticion por segundo', () => {
    expect(createNominatimReverseGeocoder().minIntervalMs).toBe(1000)
  })

  it('el error es un ProviderError', async () => {
    mockFetch({}, 429)

    const error = await createNominatimReverseGeocoder()
      .reverse({ latitude: 19.5, longitude: -99.1 })
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ProviderError)
  })
})
