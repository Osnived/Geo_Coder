import type { GeocodeCandidate, GeocodeResult } from '../models/geocode'
import type { EstablishmentRecord } from '../models/record'

/**
 * Transiciones de la revision manual (spec seccion 15).
 *
 * Reglas:
 * - Toda correccion manual marca `manuallyVerified` y pasa el registro a
 *   MANUALLY_VERIFIED.
 * - El resultado anterior se conserva en `replaced`, encadenado, para poder
 *   reconstruir el historial (spec principio 7).
 * - Nada de esto toca `fields` ni `original`: los datos de entrada no se
 *   modifican al revisar (spec principio 2).
 */

export const MANUAL_PROVIDER = 'manual'

interface ReviewOptions {
  readonly now: () => string
}

function withPrevious(next: GeocodeResult, previous: GeocodeResult | null): GeocodeResult {
  return previous === null ? next : { ...next, replaced: previous }
}

/** Acepta el resultado actual tal cual, dandolo por verificado. */
export function acceptResult(
  record: EstablishmentRecord,
  options: ReviewOptions,
): EstablishmentRecord {
  if (record.result === null) return record

  return {
    ...record,
    status: 'MANUALLY_VERIFIED',
    result: { ...record.result, manuallyVerified: true },
    updatedAt: options.now(),
  }
}

/**
 * Rechaza el resultado actual: el registro vuelve a quedar sin ubicacion.
 *
 * El resultado descartado no se borra, se guarda como `replaced` de un
 * resultado vacio para no perder el rastro de lo que se rechazo.
 */
export function rejectResult(
  record: EstablishmentRecord,
  options: ReviewOptions,
): EstablishmentRecord {
  if (record.result === null) return record

  return {
    ...record,
    status: 'NOT_FOUND',
    result: null,
    rejected: [...(record.rejected ?? []), record.result],
    updatedAt: options.now(),
  }
}

/** Sustituye el resultado por uno de los candidatos devueltos por el proveedor. */
export function selectCandidate(
  record: EstablishmentRecord,
  candidate: GeocodeCandidate,
  options: ReviewOptions,
): EstablishmentRecord {
  const previous = record.result

  const next: GeocodeResult = {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    matchedName: candidate.matchedName,
    matchedAddress: candidate.matchedAddress,
    provider: candidate.provider,
    confidence: candidate.confidence,
    queryUsed: previous?.queryUsed ?? '',
    manuallyVerified: true,
    candidates: previous?.candidates ?? [candidate],
    attempts: previous?.attempts ?? [],
    resolvedAt: options.now(),
  }

  return {
    ...record,
    status: 'MANUALLY_VERIFIED',
    result: withPrevious(next, previous),
    updatedAt: options.now(),
  }
}

/** Fija unas coordenadas elegidas a mano sobre el mapa. */
export function setManualCoordinates(
  record: EstablishmentRecord,
  latitude: number,
  longitude: number,
  options: ReviewOptions,
): EstablishmentRecord {
  const previous = record.result

  const next: GeocodeResult = {
    latitude,
    longitude,
    matchedName: previous?.matchedName ?? record.fields.location_name,
    matchedAddress: previous?.matchedAddress ?? record.fields.address,
    provider: MANUAL_PROVIDER,
    confidence: 1,
    queryUsed: previous?.queryUsed ?? '',
    manuallyVerified: true,
    candidates: previous?.candidates ?? [],
    attempts: previous?.attempts ?? [],
    resolvedAt: options.now(),
  }

  return {
    ...record,
    status: 'MANUALLY_VERIFIED',
    result: withPrevious(next, previous),
    updatedAt: options.now(),
  }
}

/** Historial de resultados sustituidos, del mas reciente al mas antiguo. */
export function resultHistory(result: GeocodeResult | null): GeocodeResult[] {
  const history: GeocodeResult[] = []
  let current = result?.replaced
  while (current) {
    history.push(current)
    current = current.replaced
  }
  return history
}

/** True si el registro necesita que una persona lo mire. */
export function needsReview(record: EstablishmentRecord): boolean {
  return (
    record.status === 'LOW_CONFIDENCE' ||
    record.status === 'NEEDS_REVIEW' ||
    record.status === 'NOT_FOUND' ||
    record.status === 'ERROR'
  )
}
