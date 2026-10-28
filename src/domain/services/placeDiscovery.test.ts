import { describe, expect, it } from 'vitest'

import { emptyComponents } from '../models/geocode'

import {
  buildDiscoveryRecords,
  businessTypeFor,
  DISCOVERY_NOTE,
  DISCOVERY_PROVIDER,
  ENRICHED_NOTE,
  formatAddress,
  parseBrand,
  type DiscoveredPlace,
  type DiscoveryQuery,
} from './placeDiscovery'

const MEXICO = { name: 'México', code: 'MX' }
const QUERY: DiscoveryQuery = { brand: 'Soriana', country: MEXICO }
const NOW = '2026-10-28T12:00:00.000Z'

function place(overrides: Partial<DiscoveredPlace> = {}): DiscoveredPlace {
  return {
    osmId: 'node/1',
    name: 'Soriana Híper Tepeyac',
    brand: 'Soriana',
    businessType: 'Supermercado',
    latitude: 19.5012,
    longitude: -99.1334,
    components: {
      ...emptyComponents(),
      street: 'Calzada Tepeyac',
      houseNumber: '120',
      city: 'Gustavo A. Madero',
      region: 'Ciudad de México',
      postalCode: '07020',
    },
    enrichedAddress: false,
    tags: { shop: 'supermarket', name: 'Soriana Híper Tepeyac' },
    ...overrides,
  }
}

describe('parseBrand', () => {
  it('acepta una marca sencilla tal cual', () => {
    expect(parseBrand('Soriana')).toBe('Soriana')
  })

  it('quita espacios de los extremos y colapsa los repetidos', () => {
    expect(parseBrand('  Súper   Soriana  ')).toBe('Súper Soriana')
  })

  it('admite apostrofes y guiones', () => {
    expect(parseBrand("Sam's Club")).toBe("Sam's Club")
    expect(parseBrand('City-Club')).toBe('City-Club')
  })

  it('rechaza lo que no cabe en una consulta: comillas, parentesis, puntos', () => {
    expect(parseBrand('Soriana"; out;')).toBeNull()
    expect(parseBrand('Mega (MX)')).toBeNull()
    expect(parseBrand('S.A.')).toBeNull()
  })

  it('rechaza vacio, de una sola letra y demasiado largo', () => {
    expect(parseBrand('   ')).toBeNull()
    expect(parseBrand('a')).toBeNull()
    expect(parseBrand('x'.repeat(61))).toBeNull()
  })
})

describe('businessTypeFor', () => {
  it('traduce los tipos de tienda conocidos', () => {
    expect(businessTypeFor('supermarket')).toBe('Supermercado')
    expect(businessTypeFor('department_store')).toBe('Tienda departamental')
  })

  it('deja el valor original si no hay traduccion', () => {
    expect(businessTypeFor('bakery')).toBe('bakery')
  })

  it('devuelve cadena vacia sin etiqueta', () => {
    expect(businessTypeFor(undefined)).toBe('')
  })
})

describe('formatAddress', () => {
  it('une las partes presentes y omite las vacias', () => {
    expect(
      formatAddress({
        ...emptyComponents(),
        street: 'Juárez',
        houseNumber: '120',
        city: 'Puebla',
        country: 'México',
      }),
    ).toBe('Juárez 120, Puebla, México')
  })
})

describe('buildDiscoveryRecords', () => {
  const build = (places: DiscoveredPlace[]) =>
    buildDiscoveryRecords(places, QUERY, {
      batchId: 'grupo-1',
      newId: (() => {
        let counter = 0
        return () => {
          counter += 1
          return `osm-${String(counter)}`
        }
      })(),
      now: () => NOW,
    })

  it('marca los registros como origen OpenStreetMap dentro del grupo indicado', () => {
    const [record] = build([place()])

    expect(record?.source).toBe('osm')
    expect(record?.batchId).toBe('grupo-1')
    expect(record?.origin).toBeNull()
  })

  it('llena los campos normalizados desde el local y la consulta', () => {
    const [record] = build([place()])

    expect(record?.fields).toMatchObject({
      client: 'Soriana',
      business_type: 'Supermercado',
      location_name: 'Soriana Híper Tepeyac',
      address: 'Calzada Tepeyac 120',
      city: 'Gustavo A. Madero',
      region: 'Ciudad de México',
      postal_code: '07020',
      country: 'México',
    })
  })

  it('usa la marca de la consulta cuando el local no la trae', () => {
    const [record] = build([place({ brand: '' })])

    expect(record?.fields.client).toBe('Soriana')
  })

  it('entra ya como FOUND con sus coordenadas, sin pasar por geocodificacion', () => {
    const [record] = build([place()])

    expect(record?.status).toBe('FOUND')
    expect(record?.result).toMatchObject({
      latitude: 19.5012,
      longitude: -99.1334,
      matchedName: 'Soriana Híper Tepeyac',
      provider: DISCOVERY_PROVIDER,
      confidence: 1,
      manuallyVerified: false,
      queryUsed: 'OpenStreetMap: Soriana, México',
      candidates: [],
      attempts: [],
      notes: [DISCOVERY_NOTE],
    })
  })

  it('guarda las etiquetas originales junto con el id de OSM', () => {
    const [record] = build([place({ osmId: 'way/99', tags: { shop: 'supermarket' } })])

    expect(record?.original).toEqual({ 'OSM id': 'way/99', shop: 'supermarket' })
  })

  it('crea un registro distinto por cada local, con id propio', () => {
    const records = build([place({ osmId: 'node/1' }), place({ osmId: 'node/2' })])

    expect(records.map((record) => record.id)).toEqual(['osm-1', 'osm-2'])
  })
})

describe('nota de direccion completada', () => {
  it('se agrega cuando la direccion vino de geocodificacion inversa', () => {
    const [record] = buildDiscoveryRecords([place({ enrichedAddress: true })], QUERY, {
      batchId: 'g',
      newId: () => 'r1',
      now: () => NOW,
    })

    expect(record?.result?.notes).toContain(ENRICHED_NOTE)
  })

  it('no aparece si la direccion es la de la fuente', () => {
    const [record] = buildDiscoveryRecords([place()], QUERY, {
      batchId: 'g',
      newId: () => 'r1',
      now: () => NOW,
    })

    expect(record?.result?.notes).not.toContain(ENRICHED_NOTE)
  })
})
