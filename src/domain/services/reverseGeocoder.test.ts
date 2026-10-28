import { describe, expect, it } from 'vitest'

import { emptyComponents, type AddressComponents } from '../models/geocode'

import { completeComponents, hasMissingAddress } from './reverseGeocoder'

const FULL: AddressComponents = {
  street: 'Juárez',
  houseNumber: '5',
  city: 'Puebla',
  region: 'Puebla',
  postalCode: '72000',
  country: 'México',
  countryCode: 'MX',
}

describe('hasMissingAddress', () => {
  it('es verdadero si falta la calle, la ciudad, el estado o el codigo postal', () => {
    expect(hasMissingAddress({ ...FULL, street: '' })).toBe(true)
    expect(hasMissingAddress({ ...FULL, city: '' })).toBe(true)
    expect(hasMissingAddress({ ...FULL, region: '' })).toBe(true)
    expect(hasMissingAddress({ ...FULL, postalCode: '' })).toBe(true)
  })

  it('es falso con la direccion completa, aunque falte el numero', () => {
    expect(hasMissingAddress({ ...FULL, houseNumber: '' })).toBe(false)
  })

  it('es verdadero sin ningun dato', () => {
    expect(hasMissingAddress(emptyComponents())).toBe(true)
  })
})

describe('completeComponents', () => {
  it('rellena solo los campos vacios', () => {
    const current = { ...emptyComponents(), city: 'Zapopan' }

    const result = completeComponents(current, FULL)

    expect(result.city).toBe('Zapopan')
    expect(result.street).toBe('Juárez')
    expect(result.postalCode).toBe('72000')
  })

  it('no cambia el objeto original', () => {
    const current = emptyComponents()
    completeComponents(current, FULL)

    expect(current.street).toBe('')
  })
})
