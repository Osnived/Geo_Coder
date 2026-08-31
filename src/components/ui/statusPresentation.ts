import { STATUS_LABELS, type RecordStatus } from '@/domain/models/status'

/**
 * Como se presenta cada estado: tono y simbolo.
 *
 * El simbolo no es decoracion: el color solo no basta, porque quien no distingue
 * rojo de verde veria dos etiquetas iguales. Y en una tabla de mil filas el
 * estado se lee de reojo por la forma del icono, antes que por el texto.
 */

export type StatusTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'

interface Presentation {
  readonly tone: StatusTone
  readonly icon: string
}

export const STATUS_PRESENTATION: Record<RecordStatus, Presentation> = {
  PENDING: { tone: 'neutral', icon: '○' },
  SEARCHING: { tone: 'accent', icon: '◌' },
  FOUND: { tone: 'ok', icon: '✓' },
  MANUALLY_VERIFIED: { tone: 'ok', icon: '✓' },
  LOW_CONFIDENCE: { tone: 'warn', icon: '⚠' },
  NEEDS_REVIEW: { tone: 'warn', icon: '⚠' },
  NOT_FOUND: { tone: 'danger', icon: '✕' },
  ERROR: { tone: 'danger', icon: '✕' },
}

export function statusTone(status: RecordStatus): StatusTone {
  return STATUS_PRESENTATION[status].tone
}

export function statusIcon(status: RecordStatus): string {
  return STATUS_PRESENTATION[status].icon
}

/** Texto plano del estado, con simbolo. Para titulos y celdas comprimidas. */
export function statusText(status: RecordStatus): string {
  return `${statusIcon(status)} ${STATUS_LABELS[status]}`
}
