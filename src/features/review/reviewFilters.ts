import type { EstablishmentRecord } from '@/domain/models/record'
import { canonicalize } from '@/domain/rules/text'
import { needsReview } from '@/domain/services/reviewService'

/**
 * Filtros de la vista de revision. Funciones puras, sin React ni estado.
 *
 * Se separan del componente porque son la logica que decide que se ve: probarla
 * aqui es directo, y dentro de un panel con mapa no lo es.
 */

/** Estado de la geocodificacion, en los terminos en que lo piensa el usuario. */
export type GeocodeFilter = 'all' | 'located' | 'missing' | 'failed'

/** Que hacer con el resultado: lo que cumple, lo que espera decision. */
export type OutcomeFilter = 'all' | 'accepted' | 'pending' | 'verified'

export interface ReviewFilters {
  /** Id de grupo, o 'all'. */
  readonly groupId: string
  readonly geocode: GeocodeFilter
  readonly outcome: OutcomeFilter
  readonly text: string
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  groupId: 'all',
  geocode: 'all',
  outcome: 'pending',
  text: '',
}

export const GEOCODE_LABELS: Record<GeocodeFilter, string> = {
  all: 'Todos',
  located: 'Con coordenadas',
  missing: 'Sin coordenadas',
  failed: 'Con error o no encontrados',
}

export const OUTCOME_LABELS: Record<OutcomeFilter, string> = {
  all: 'Todos',
  accepted: 'Cumple',
  pending: 'Pendiente de decision',
  verified: 'Verificado a mano',
}

function matchesGeocode(record: EstablishmentRecord, filter: GeocodeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'located') return record.result !== null
  if (filter === 'missing') return record.result === null
  return record.status === 'ERROR' || record.status === 'NOT_FOUND'
}

function matchesOutcome(record: EstablishmentRecord, filter: OutcomeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'verified') return record.result?.manuallyVerified === true
  if (filter === 'pending') return needsReview(record)
  // "Cumple": resuelto y sin nada que decidir.
  return !needsReview(record) && record.result !== null
}

export function filterForReview(
  records: readonly EstablishmentRecord[],
  filters: ReviewFilters,
): EstablishmentRecord[] {
  const needle = canonicalize(filters.text)

  return records.filter((record) => {
    if (filters.groupId !== 'all' && record.batchId !== filters.groupId) return false
    if (!matchesGeocode(record, filters.geocode)) return false
    if (!matchesOutcome(record, filters.outcome)) return false
    if (needle !== '' && !canonicalize(Object.values(record.fields).join(' ')).includes(needle)) {
      return false
    }
    return true
  })
}

export interface ReviewSummary {
  readonly total: number
  readonly located: number
  readonly pending: number
  readonly groups: number
  /** Porcentaje de registros con coordenadas, redondeado. */
  readonly locatedPercentage: number
}

/** Resumen compacto de la cabecera: lo que cabe en una linea. */
export function summarizeReview(records: readonly EstablishmentRecord[]): ReviewSummary {
  const total = records.length
  const located = records.filter((record) => record.result !== null).length
  const pending = records.filter((record) => needsReview(record)).length
  const groups = new Set(records.map((record) => record.batchId)).size

  return {
    total,
    located,
    pending,
    groups,
    locatedPercentage: total === 0 ? 0 : Math.round((located / total) * 100),
  }
}
