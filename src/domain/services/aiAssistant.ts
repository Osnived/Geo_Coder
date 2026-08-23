import { isNormalizedField, type NormalizedField } from '../models/fields'
import type { EstablishmentRecord } from '../models/record'

/**
 * Capa de IA opcional (spec seccion 22).
 *
 * Reglas que la gobiernan:
 * - Nunca sustituye a una funcion determinista. Solo se invoca donde las
 *   reglas ya se rindieron: columnas que la deteccion no reconocio y registros
 *   cuyas estrategias de busqueda no dieron nada.
 * - La aplicacion funciona igual sin ella. El asistente por defecto no hace
 *   nada, y esa es la configuracion de fabrica.
 * - Todo lo que devuelve es una sugerencia. El usuario sigue mandando.
 */

/** Sugerencia de significado para una columna que las reglas no reconocieron. */
export interface ColumnSuggestionFromAi {
  readonly header: string
  readonly field: NormalizedField
  /** 0..1 segun la seguridad que declare el modelo. */
  readonly confidence: number
}

export interface AiAssistant {
  readonly name: string
  /**
   * Propone un campo para encabezados sin mapear. Recibe solo los que las
   * reglas no supieron resolver.
   */
  mapUnknownColumns: (
    headers: readonly string[],
    signal?: AbortSignal,
  ) => Promise<ColumnSuggestionFromAi[]>
  /**
   * Propone consultas alternativas para un registro cuyas estrategias
   * deterministas no encontraron nada.
   */
  suggestQueries: (
    record: EstablishmentRecord,
    triedQueries: readonly string[],
    signal?: AbortSignal,
  ) => Promise<string[]>
}

/** Asistente por defecto: no hace nada. La IA esta apagada de fabrica. */
export const noopAssistant: AiAssistant = {
  name: 'ninguno',
  mapUnknownColumns: () => Promise.resolve([]),
  suggestQueries: () => Promise.resolve([]),
}

/**
 * Valida y limpia lo que devuelve un modelo.
 *
 * Un modelo puede inventarse nombres de campo, repetir encabezados o devolver
 * confianzas fuera de rango. Nada de eso debe llegar al resto del sistema.
 */
export function sanitizeColumnSuggestions(
  raw: unknown,
  allowedHeaders: readonly string[],
): ColumnSuggestionFromAi[] {
  if (!Array.isArray(raw)) return []

  const allowed = new Set(allowedHeaders)
  const usedHeaders = new Set<string>()
  const usedFields = new Set<NormalizedField>()
  const result: ColumnSuggestionFromAi[] = []

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { header, field, confidence } = entry as Record<string, unknown>

    if (typeof header !== 'string' || !allowed.has(header) || usedHeaders.has(header)) continue
    if (typeof field !== 'string' || !isNormalizedField(field) || usedFields.has(field)) continue

    const score = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0.5

    usedHeaders.add(header)
    usedFields.add(field)
    result.push({ header, field, confidence: Math.min(Math.max(score, 0), 1) })
  }

  return result
}

/** Valida las consultas propuestas: texto util, sin repetir lo ya intentado. */
export function sanitizeQuerySuggestions(
  raw: unknown,
  triedQueries: readonly string[],
  limit = 3,
): string[] {
  if (!Array.isArray(raw)) return []

  const tried = new Set(triedQueries.map((query) => query.trim().toLowerCase()))
  const seen = new Set<string>()
  const result: string[] = []

  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const text = entry.trim().replace(/\s+/g, ' ')
    const key = text.toLowerCase()

    if (text.length < 3 || text.length > 300) continue
    if (tried.has(key) || seen.has(key)) continue

    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }

  return result
}
