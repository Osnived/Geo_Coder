import type { NormalizedField } from '../models/fields'
import type { EstablishmentRecord } from '../models/record'
import { canonicalize } from '../rules/text'
import {
  containment,
  coverage,
  numbersIn,
  postalCodeSimilarity,
  similarity,
  tokens,
} from '../rules/similarity'

import type { ProviderCandidate } from './geocoderProvider'
import type { CandidateScorer } from './geocoderService'

/**
 * Puntuacion de candidatos (spec seccion 13).
 *
 * El primer resultado de un geocoder NO es automaticamente correcto: aqui se
 * compara cada candidato con los datos originales del registro, senal por
 * senal, y se devuelve un score explicable.
 *
 * Reglas de diseno:
 * - Solo puntuan las senales de las que el registro tiene dato. Un registro sin
 *   codigo postal no se penaliza por no poder compararlo.
 * - El pais no suma: filtra. Un candidato en otro pais queda descartado.
 * - Los pesos son configurables y provisionales; deben validarse con datos
 *   reales antes de darlos por buenos.
 */

export type SignalName =
  'client' | 'location_name' | 'business_type' | 'address' | 'city' | 'region' | 'postal_code'

export type SignalWeights = Readonly<Record<SignalName, number>>

/** Penalizacion aplicada cuando el candidato esta en otro pais. */
const WRONG_COUNTRY_FACTOR = 0.1

/** Desempate leve por el orden que dio el proveedor. */
const RANK_PENALTY = 0.01

/**
 * Tipos de establecimiento en espanol/ingles y las categorias OSM que les
 * corresponden. Sirve para valorar la senal `business_type`.
 */
const TYPE_CATEGORIES: Record<string, readonly string[]> = {
  tienda: ['shop', 'convenience', 'supermarket', 'department_store', 'general'],
  supermercado: ['supermarket', 'grocery', 'convenience'],
  minimercado: ['convenience', 'supermarket'],
  hipermercado: ['supermarket', 'department_store'],
  farmacia: ['pharmacy', 'chemist'],
  droguerica: ['pharmacy', 'chemist'],
  restaurante: ['restaurant', 'fast_food'],
  cafeteria: ['cafe', 'coffee'],
  cafe: ['cafe', 'coffee'],
  bar: ['bar', 'pub'],
  banco: ['bank'],
  hotel: ['hotel'],
  gasolinera: ['fuel'],
  ferreteria: ['hardware', 'doityourself'],
  panaderia: ['bakery'],
  store: ['shop', 'convenience', 'supermarket', 'department_store'],
  supermarket: ['supermarket', 'grocery'],
  pharmacy: ['pharmacy', 'chemist'],
  restaurant: ['restaurant', 'fast_food'],
  coffee: ['cafe', 'coffee'],
}

function has(record: EstablishmentRecord, field: NormalizedField): boolean {
  return record.fields[field].trim() !== ''
}

/** El nombre puede aparecer en `name` o dentro de la direccion formateada. */
function scoreName(expected: string, candidate: ProviderCandidate): number {
  const againstName = similarity(expected, candidate.name)
  const againstAddress = coverage(expected, candidate.address)
  return Math.max(againstName, againstAddress)
}

/**
 * La cadena suele venir dentro del nombre del POI ("Olimpica Prado" para el
 * cliente "Olimpica"), asi que se mide contencion, no similitud simetrica.
 */
function scoreClient(expected: string, candidate: ProviderCandidate): number {
  const expectedTokens = tokens(expected)
  const inName = containment(expectedTokens, tokens(candidate.name))
  const inAddress = containment(expectedTokens, tokens(candidate.address))
  return Math.max(inName, inAddress)
}

/**
 * La direccion se compara contra los componentes estructurados si el proveedor
 * los da, y contra el texto completo si no. El numero de portal pesa: dos
 * direcciones en la misma calle con numeros distintos no son la misma.
 */
function scoreAddress(expected: string, candidate: ProviderCandidate): number {
  const { street, houseNumber } = candidate.components
  const structured = [street, houseNumber].filter((part) => part !== '').join(' ')
  const textual = structured === '' ? candidate.address : structured

  const textScore = coverage(expected, textual)

  const expectedNumbers = numbersIn(expected)
  const candidateNumbers = numbersIn(textual)
  if (expectedNumbers.length === 0 || candidateNumbers.length === 0) return textScore

  const shared = expectedNumbers.filter((number) => candidateNumbers.includes(number)).length
  const numberScore = shared / expectedNumbers.length

  // La calle importa, pero el numero es lo que distingue un local del vecino.
  return textScore * 0.6 + numberScore * 0.4
}

function scoreComponent(expected: string, actual: string, fallback: string): number {
  if (actual !== '') return similarity(expected, actual)
  // El proveedor no desglosa: se busca dentro de la direccion completa.
  return coverage(expected, fallback)
}

function scoreBusinessType(expected: string, candidate: ProviderCandidate): number {
  const category = canonicalize(candidate.category).replace(/ /g, '_')
  if (category === '') return 0

  for (const word of tokens(expected)) {
    const mapped = TYPE_CATEGORIES[word]
    if (mapped?.some((value) => category.includes(value))) return 1
  }
  // Sin traduccion conocida, se compara el texto tal cual.
  return similarity(expected, candidate.category)
}

/**
 * True si sabemos con certeza que el candidato esta en otro pais.
 *
 * Solo se descarta cuando ambos codigos ISO son conocidos: un pais escrito a
 * mano sin codigo no basta para tirar un resultado.
 */
export function isWrongCountry(expectedCode: string, candidate: ProviderCandidate): boolean {
  const actual = candidate.components.countryCode
  if (expectedCode === '' || actual === '') return false
  return expectedCode.toUpperCase() !== actual.toUpperCase()
}

export interface ScoringOptions {
  readonly weights: SignalWeights
}

export function createScorer(options: ScoringOptions): CandidateScorer {
  const { weights } = options

  return (record, candidate, query) => {
    const signals: Record<string, number> = {}
    let weighted = 0
    let totalWeight = 0

    const add = (name: SignalName, value: number) => {
      signals[name] = Number(value.toFixed(3))
      weighted += value * weights[name]
      totalWeight += weights[name]
    }

    if (has(record, 'location_name')) {
      add('location_name', scoreName(record.fields.location_name, candidate))
    }
    if (has(record, 'client')) {
      add('client', scoreClient(record.fields.client, candidate))
    }
    if (has(record, 'address')) {
      add('address', scoreAddress(record.fields.address, candidate))
    }
    if (has(record, 'postal_code')) {
      add(
        'postal_code',
        postalCodeSimilarity(record.fields.postal_code, candidate.components.postalCode),
      )
    }
    if (has(record, 'city')) {
      add('city', scoreComponent(record.fields.city, candidate.components.city, candidate.address))
    }
    if (has(record, 'region')) {
      add(
        'region',
        scoreComponent(record.fields.region, candidate.components.region, candidate.address),
      )
    }
    if (has(record, 'business_type')) {
      add('business_type', scoreBusinessType(record.fields.business_type, candidate))
    }

    if (totalWeight === 0) {
      // Nada comparable: no se puede afirmar que sea correcto.
      return { confidence: 0, signals: { sinDatos: 0 } }
    }

    let confidence = weighted / totalWeight

    const expectedCode = query.country?.code ?? ''
    if (isWrongCountry(expectedCode, candidate)) {
      confidence *= WRONG_COUNTRY_FACTOR
      signals.country = 0
    } else if (expectedCode !== '') {
      signals.country = 1
    }

    confidence = Math.max(0, confidence - candidate.rank * RANK_PENALTY)

    return { confidence: Number(confidence.toFixed(4)), signals }
  }
}
