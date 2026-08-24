import type { EstablishmentRecord } from '@/domain/models/record'
import { needsReview } from '@/domain/services/reviewService'

/**
 * Cola de la pantalla de revision.
 *
 * El registro que se esta revisando permanece en la cola aunque deje de
 * necesitar revision. Sin esto, decidir sobre un registro lo hacia desaparecer
 * al instante: la vista saltaba al siguiente y no habia forma de comprobar el
 * resultado ni de rectificar, asi que parecia que el boton no funcionaba.
 */
export function buildReviewQueue(
  records: readonly EstablishmentRecord[],
  options: { onlyPending: boolean; selectedId: string | null },
): EstablishmentRecord[] {
  const matches = (record: EstablishmentRecord) =>
    options.onlyPending ? needsReview(record) : record.result !== null || needsReview(record)

  return records.filter((record) => matches(record) || record.id === options.selectedId)
}

/** Siguiente registro que aun espera una decision, distinto del actual. */
export function findNextPending(
  records: readonly EstablishmentRecord[],
  selectedId: string | null,
): EstablishmentRecord | null {
  return records.find((record) => record.id !== selectedId && needsReview(record)) ?? null
}
