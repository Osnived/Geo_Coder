/** Estados explicitos del ciclo de vida de un registro (spec seccion 14). */
export const RECORD_STATUSES = [
  'PENDING',
  'SEARCHING',
  'FOUND',
  'LOW_CONFIDENCE',
  'NEEDS_REVIEW',
  'NOT_FOUND',
  'ERROR',
  'MANUALLY_VERIFIED',
] as const

export type RecordStatus = (typeof RECORD_STATUSES)[number]

export const STATUS_LABELS: Record<RecordStatus, string> = {
  PENDING: 'Pendiente',
  SEARCHING: 'Buscando',
  FOUND: 'Encontrado',
  LOW_CONFIDENCE: 'Confianza baja',
  NEEDS_REVIEW: 'Requiere revision',
  NOT_FOUND: 'No encontrado',
  ERROR: 'Error',
  MANUALLY_VERIFIED: 'Verificado manualmente',
}

/** Estados que exigen intervencion humana antes de dar el dato por bueno. */
export const STATUSES_REQUIRING_REVIEW: readonly RecordStatus[] = [
  'LOW_CONFIDENCE',
  'NEEDS_REVIEW',
  'NOT_FOUND',
  'ERROR',
]
