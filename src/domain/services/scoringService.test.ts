import { describe, expect, it } from 'vitest'

import { SCORING_WEIGHTS } from '@/shared/config/geocoding'
import { makeRecord } from '@/test/factories'

import type { GeocodeQuery } from '../models/geocode'

import { emptyComponents, type ProviderCandidate } from './geocoderProvider'
import { createScorer, isWrongCountry } from './scoringService'

const scorer = createScorer({ weights: SCORING_WEIGHTS })

const QUERY: GeocodeQuery = {
  text: 'consulta',
  country: { name: 'Colombia', code: 'CO' },
  usedFields: [],
  strategy: 0,
  templateId: 'test',
}

function candidate(overrides: Partial<ProviderCandidate> = {}): ProviderCandidate {
  return {
    latitude: 11,
    longitude: -74.8,
    name: '',
    address: '',
    components: emptyComponents(),
    category: '',
    rank: 0,
    raw: {},
    ...overrides,
  }
}

function components(overrides: Partial<ReturnType<typeof emptyComponents>>) {
  return { ...emptyComponents(), ...overrides }
}

const OLIMPICA = makeRecord({
  client: 'Olímpica',
  business_type: 'Supermercado',
  location_name: 'Olímpica Prado',
  address: 'Cra. 54 #70-25',
  city: 'Barranquilla',
  region: 'Atlántico',
  postal_code: '080001',
  country: 'Colombia',
})

describe('createScorer', () => {
  it('puntua alto una coincidencia buena en todas las senales', () => {
    const { confidence } = scorer(
      OLIMPICA,
      candidate({
        name: 'Olímpica Prado',
        address: 'Olímpica, Carrera 54 70-25, Barranquilla, Atlántico, 080001, Colombia',
        category: 'supermarket',
        components: components({
          street: 'Carrera 54',
          houseNumber: '70-25',
          city: 'Barranquilla',
          region: 'Atlántico',
          postalCode: '080001',
          countryCode: 'CO',
        }),
      }),
      QUERY,
    )

    expect(confidence).toBeGreaterThan(0.85)
  })

  it('puntua bajo un lugar que solo comparte la ciudad', () => {
    const { confidence } = scorer(
      OLIMPICA,
      candidate({
        name: 'Parque Cultural del Caribe',
        address: 'Parque Cultural del Caribe, Barranquilla, Atlántico, Colombia',
        components: components({ city: 'Barranquilla', region: 'Atlántico', countryCode: 'CO' }),
      }),
      QUERY,
    )

    expect(confidence).toBeLessThan(0.35)
  })

  it('reconoce abreviaturas de via', () => {
    const soloDireccion = makeRecord({ address: 'Cra. 54 #70-25', city: 'Barranquilla' })
    const { signals } = scorer(
      soloDireccion,
      candidate({
        address: 'Carrera 54 70-25, Barranquilla',
        components: components({ street: 'Carrera 54', houseNumber: '70-25' }),
      }),
      QUERY,
    )

    expect(signals.address).toBeGreaterThan(0.9)
  })

  it('distingue dos direcciones de la misma calle con distinto numero', () => {
    const record = makeRecord({ address: 'Carrera 54 #70-25' })
    const mismo = scorer(
      record,
      candidate({ components: components({ street: 'Carrera 54', houseNumber: '70-25' }) }),
      QUERY,
    )
    const otro = scorer(
      record,
      candidate({ components: components({ street: 'Carrera 54', houseNumber: '12-90' }) }),
      QUERY,
    )

    expect(mismo.confidence).toBeGreaterThan(otro.confidence)
  })

  it('reconoce la cadena dentro del nombre del punto', () => {
    const record = makeRecord({ client: 'Olímpica', city: 'Barranquilla' })
    const { signals } = scorer(
      record,
      candidate({
        name: 'Supermercado Olímpica',
        components: components({ city: 'Barranquilla' }),
      }),
      QUERY,
    )

    expect(signals.client).toBe(1)
  })

  it('traduce el tipo de establecimiento a la categoria del proveedor', () => {
    const record = makeRecord({ business_type: 'Farmacia', city: 'Bogotá' })
    const acierta = scorer(
      record,
      candidate({ category: 'pharmacy', components: components({ city: 'Bogotá' }) }),
      QUERY,
    )
    const falla = scorer(
      record,
      candidate({ category: 'restaurant', components: components({ city: 'Bogotá' }) }),
      QUERY,
    )

    expect(acierta.signals.business_type).toBe(1)
    expect(falla.signals.business_type).toBeLessThan(0.5)
  })

  it('valora el codigo postal exacto y el prefijo comun', () => {
    const record = makeRecord({ postal_code: '080001' })
    const exacto = scorer(
      record,
      candidate({ components: components({ postalCode: '080001' }) }),
      QUERY,
    )
    const cercano = scorer(
      record,
      candidate({ components: components({ postalCode: '080020' }) }),
      QUERY,
    )
    const lejano = scorer(
      record,
      candidate({ components: components({ postalCode: '110111' }) }),
      QUERY,
    )

    expect(exacto.signals.postal_code).toBe(1)
    expect(cercano.signals.postal_code).toBe(0.5)
    expect(lejano.signals.postal_code).toBe(0)
  })

  it('descarta un candidato en otro pais', () => {
    const enColombia = scorer(
      OLIMPICA,
      candidate({
        name: 'Olímpica Prado',
        components: components({ city: 'Barranquilla', countryCode: 'CO' }),
      }),
      QUERY,
    )
    const enMexico = scorer(
      OLIMPICA,
      candidate({
        name: 'Olímpica Prado',
        components: components({ city: 'Barranquilla', countryCode: 'MX' }),
      }),
      QUERY,
    )

    expect(enMexico.confidence).toBeLessThan(enColombia.confidence * 0.2)
    expect(enMexico.signals.country).toBe(0)
  })

  it('no descarta cuando el pais del candidato es desconocido', () => {
    const { signals } = scorer(
      OLIMPICA,
      candidate({ name: 'Olímpica Prado', components: components({ countryCode: '' }) }),
      QUERY,
    )
    expect(signals.country).toBe(1)
  })

  it('no penaliza las senales que el registro no tiene', () => {
    const soloNombre = makeRecord({ location_name: 'Toks Plaza Universidad' })
    const { confidence, signals } = scorer(
      soloNombre,
      candidate({ name: 'Toks Plaza Universidad' }),
      { ...QUERY, country: null },
    )

    expect(Object.keys(signals)).toEqual(['location_name'])
    expect(confidence).toBe(1)
  })

  it('devuelve 0 si no hay nada comparable', () => {
    const { confidence } = scorer(makeRecord({ country: 'Colombia' }), candidate(), QUERY)
    expect(confidence).toBe(0)
  })

  it('desempata por el orden del proveedor', () => {
    const record = makeRecord({ location_name: 'Olímpica Prado' })
    const primero = scorer(record, candidate({ name: 'Olímpica Prado', rank: 0 }), QUERY)
    const tercero = scorer(record, candidate({ name: 'Olímpica Prado', rank: 2 }), QUERY)

    expect(primero.confidence).toBeGreaterThan(tercero.confidence)
    expect(primero.confidence - tercero.confidence).toBeLessThan(0.05)
  })

  it('ignora acentos y mayusculas', () => {
    const record = makeRecord({ city: 'Bogotá' })
    const { signals } = scorer(
      record,
      candidate({ components: components({ city: 'BOGOTA' }) }),
      QUERY,
    )
    expect(signals.city).toBe(1)
  })

  it('expone el desglose de senales para poder explicar el score', () => {
    const { signals } = scorer(
      OLIMPICA,
      candidate({
        name: 'Olímpica Prado',
        category: 'supermarket',
        components: components({
          street: 'Carrera 54',
          houseNumber: '70-25',
          city: 'Barranquilla',
          region: 'Atlántico',
          postalCode: '080001',
          countryCode: 'CO',
        }),
      }),
      QUERY,
    )

    expect(Object.keys(signals).sort()).toEqual([
      'address',
      'business_type',
      'city',
      'client',
      'country',
      'location_name',
      'postal_code',
      'region',
    ])
  })
})

describe('isWrongCountry', () => {
  it('solo descarta cuando ambos codigos son conocidos y distintos', () => {
    expect(isWrongCountry('CO', candidate({ components: components({ countryCode: 'MX' }) }))).toBe(
      true,
    )
    expect(isWrongCountry('CO', candidate({ components: components({ countryCode: 'co' }) }))).toBe(
      false,
    )
    expect(isWrongCountry('', candidate({ components: components({ countryCode: 'MX' }) }))).toBe(
      false,
    )
    expect(isWrongCountry('CO', candidate())).toBe(false)
  })
})
