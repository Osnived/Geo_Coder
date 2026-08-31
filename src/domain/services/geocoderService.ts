import type { Country } from '../models/country'
import {
  emptyComponents,
  type GeocodeAttempt,
  type GeocodeCandidate,
  type GeocodeQuery,
  type GeocodeResult,
} from '../models/geocode'
import type { EstablishmentRecord } from '../models/record'
import type { RecordStatus } from '../models/status'

import type { GeocoderProvider, ProviderCandidate } from './geocoderProvider'
import { ProviderError } from './geocoderProvider'
import { buildQueries } from './queryBuilder'

/**
 * Orquestacion de la geocodificacion (spec seccion 10).
 *
 * Recorre la cascada de consultas y la lista de proveedores hasta encontrar un
 * candidato lo bastante bueno. No conoce ningun proveedor concreto ni hace
 * peticiones: ambos se inyectan.
 *
 * Principio 1 de la spec: es preferible marcar NEEDS_REVIEW a asignar unas
 * coordenadas incorrectas. Por eso solo se acepta automaticamente por encima
 * del umbral configurado.
 */

/** Puntua un candidato contra el registro original. Devuelve 0..1 y su desglose. */
export type CandidateScorer = (
  record: EstablishmentRecord,
  candidate: ProviderCandidate,
  query: GeocodeQuery,
) => { confidence: number; signals: Record<string, number> }

export interface ConfidenceThresholds {
  /** A partir de aqui se acepta automaticamente. */
  readonly accept: number
  /** Por debajo de aqui hace falta revision humana. */
  readonly review: number
}

/** Topes que fuerzan revision aunque el score salga alto. */
export interface ConfidenceCaps {
  readonly lowSpecificity: number
  readonly ambiguous: number
}

/**
 * Limita la confianza cuando el score no es de fiar pese a ser alto.
 *
 * Dos situaciones lo justifican:
 * - La consulta no llevaba direccion ni codigo postal, asi que cualquier
 *   sucursal de la cadena en esa ciudad puntua igual de bien.
 * - Dos candidatos quedaron practicamente empatados: el proveedor no sabe
 *   cual es y la aplicacion tampoco.
 */
export function capConfidence(
  scored: readonly GeocodeCandidate[],
  query: GeocodeQuery,
  caps: ConfidenceCaps,
  ambiguityDelta: number,
): { confidence: number; notes: string[] } {
  const top = scored[0]
  if (!top) return { confidence: 0, notes: [] }

  let confidence = top.confidence
  const notes: string[] = []

  const isSpecific =
    query.usedFields.includes('address') || query.usedFields.includes('postal_code')
  if (!isSpecific && confidence > caps.lowSpecificity) {
    confidence = caps.lowSpecificity
    notes.push(
      'La busqueda no incluyo direccion ni codigo postal: no se puede distinguir una sucursal de otra.',
    )
  }

  const second = scored[1]
  if (
    second &&
    top.confidence - second.confidence < ambiguityDelta &&
    confidence > caps.ambiguous
  ) {
    confidence = caps.ambiguous
    notes.push('Hay dos candidatos casi igual de buenos: conviene elegir a mano.')
  }

  return { confidence, notes }
}

export interface GeocodeOutcome {
  readonly status: RecordStatus
  readonly result: GeocodeResult | null
  /** Todo lo que se intento, en orden. Explica el resultado. */
  readonly attempts: readonly GeocodeAttempt[]
}

export interface GeocodeOptions {
  readonly providers: readonly GeocoderProvider[]
  readonly scorer: CandidateScorer
  readonly thresholds: ConfidenceThresholds
  readonly caps: ConfidenceCaps
  readonly ambiguityDelta: number
  readonly now: () => string
  readonly sessionCountry?: Country | null
  readonly maxQueries?: number
  /**
   * Consultas a usar en lugar de las que genera el QueryBuilder. Sirve para
   * reintentar con alternativas propuestas por la capa de IA (spec seccion 22).
   */
  readonly queries?: readonly GeocodeQuery[]
  readonly signal?: AbortSignal
  /** Candidatos que se guardan para la pantalla de revision. */
  readonly maxCandidates?: number
}

const DEFAULT_MAX_CANDIDATES = 5

interface BestSoFar {
  readonly candidate: GeocodeCandidate
  readonly query: GeocodeQuery
  /** Confianza ya limitada. */
  readonly confidence: number
  readonly notes: readonly string[]
}

function toCandidate(
  candidate: ProviderCandidate,
  provider: string,
  confidence: number,
  signals: Record<string, number>,
): GeocodeCandidate {
  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    matchedName: candidate.name,
    matchedAddress: candidate.address,
    provider,
    confidence,
    signals,
    components: candidate.components,
    raw: candidate.raw,
  }
}

function buildResult(
  best: GeocodeCandidate,
  query: GeocodeQuery,
  candidates: readonly GeocodeCandidate[],
  attempts: readonly GeocodeAttempt[],
  confidence: number,
  notes: readonly string[],
  now: string,
): GeocodeResult {
  return {
    latitude: best.latitude,
    longitude: best.longitude,
    matchedName: best.matchedName,
    matchedAddress: best.matchedAddress,
    provider: best.provider,
    // La confianza del resultado es la ya limitada, no la bruta del candidato.
    confidence,
    queryUsed: query.text,
    manuallyVerified: false,
    components: best.components ?? emptyComponents(),
    candidates,
    attempts,
    notes,
    resolvedAt: now,
  }
}

function statusFor(confidence: number, thresholds: ConfidenceThresholds): RecordStatus {
  if (confidence >= thresholds.accept) return 'FOUND'
  if (confidence >= thresholds.review) return 'LOW_CONFIDENCE'
  return 'NEEDS_REVIEW'
}

/**
 * Geocodifica un registro probando estrategias y proveedores en orden.
 *
 * Se detiene en cuanto un candidato supera el umbral de aceptacion. Si ninguno
 * lo supera, se queda con el mejor de todos los intentos y marca el registro
 * para revision en lugar de descartarlo.
 */
export async function geocodeRecord(
  record: EstablishmentRecord,
  options: GeocodeOptions,
): Promise<GeocodeOutcome> {
  const queries =
    options.queries ??
    buildQueries(record, {
      sessionCountry: options.sessionCountry ?? null,
      ...(options.maxQueries === undefined ? {} : { maxQueries: options.maxQueries }),
    })

  if (queries.length === 0) {
    return { status: 'NOT_FOUND', result: null, attempts: [] }
  }

  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
  const attempts: GeocodeAttempt[] = []

  let best: BestSoFar | null = null
  let bestPool: GeocodeCandidate[] = []

  for (const provider of options.providers) {
    for (const query of queries) {
      if (options.signal?.aborted === true) {
        return finish(best, bestPool, attempts, options)
      }

      let raw: ProviderCandidate[] = []
      try {
        raw = await provider.search(query, {
          ...(options.signal ? { signal: options.signal } : {}),
          limit: maxCandidates,
        })
      } catch (error) {
        attempts.push({
          provider: provider.name,
          query,
          candidateCount: 0,
          bestConfidence: 0,
          error:
            error instanceof ProviderError
              ? { code: error.code, message: error.message }
              : { code: 'UNKNOWN', message: error instanceof Error ? error.message : 'Error' },
        })
        // Un fallo de una estrategia no invalida las siguientes.
        continue
      }

      const scored = raw
        .map((candidate) => {
          const { confidence, signals } = options.scorer(record, candidate, query)
          return toCandidate(candidate, provider.name, confidence, signals)
        })
        .sort((a, b) => b.confidence - a.confidence)

      const top = scored[0]
      const { confidence, notes } = capConfidence(
        scored,
        query,
        options.caps,
        options.ambiguityDelta,
      )

      attempts.push({
        provider: provider.name,
        query,
        candidateCount: scored.length,
        bestConfidence: confidence,
        error: null,
      })

      if (top && (best === null || confidence > best.confidence)) {
        best = { candidate: top, query, confidence, notes }
        bestPool = scored.slice(0, maxCandidates)
      }

      if (top && confidence >= options.thresholds.accept) {
        return {
          status: 'FOUND',
          result: buildResult(top, query, bestPool, attempts, confidence, notes, options.now()),
          attempts,
        }
      }
    }
  }

  return finish(best, bestPool, attempts, options)
}

function finish(
  best: BestSoFar | null,
  pool: readonly GeocodeCandidate[],
  attempts: readonly GeocodeAttempt[],
  options: GeocodeOptions,
): GeocodeOutcome {
  if (best === null) {
    // Sin candidatos hay que distinguir "no existe" de "no se pudo preguntar":
    // solo es ERROR si ningun intento llego a completarse.
    const allFailed = attempts.length > 0 && attempts.every((attempt) => attempt.error !== null)
    return { status: allFailed ? 'ERROR' : 'NOT_FOUND', result: null, attempts }
  }

  return {
    status: statusFor(best.confidence, options.thresholds),
    result: buildResult(
      best.candidate,
      best.query,
      pool,
      attempts,
      best.confidence,
      best.notes,
      options.now(),
    ),
    attempts,
  }
}
