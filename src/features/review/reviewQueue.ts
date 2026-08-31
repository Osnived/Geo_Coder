import type { EstablishmentRecord } from '@/domain/models/record'
import { needsReview } from '@/domain/services/reviewService'

/**
 * Cola de la pantalla de revision.
 *
 * El filtrado lo hace `reviewFilters`; aqui vive la unica regla que no es un
 * filtro: el registro que se esta revisando permanece en la cola aunque deje de
 * cumplir el filtro. Sin esto, decidir sobre un registro lo hacia desaparecer
 * al instante: la vista saltaba al siguiente y no habia forma de comprobar el
 * resultado ni de rectificar, asi que parecia que el boton no funcionaba.
 */
export function buildReviewQueue(
  /** Registros que ya pasaron los filtros de la vista. */
  matching: readonly EstablishmentRecord[],
  /** Todos los registros, para poder recuperar el seleccionado si se filtro. */
  all: readonly EstablishmentRecord[],
  selectedId: string | null,
): EstablishmentRecord[] {
  if (selectedId === null || matching.some((record) => record.id === selectedId)) {
    return [...matching]
  }

  const kept = all.find((record) => record.id === selectedId)
  // Al final y no al principio: se anade a la cola, no se reordena.
  return kept ? [...matching, kept] : [...matching]
}

/** Siguiente registro que aun espera una decision, distinto del actual. */
export function findNextPending(
  records: readonly EstablishmentRecord[],
  selectedId: string | null,
): EstablishmentRecord | null {
  return records.find((record) => record.id !== selectedId && needsReview(record)) ?? null
}
