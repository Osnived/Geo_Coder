import type { Country } from '../models/country'
import type {
  GeocodeAttempt,
  GeocodeCandidate,
  GeocodeQuery,
  GeocodeResult,
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
  readonly now: () => string
  readonly sessionCountry?: Country | null
  readonly maxQueries?: number
  readonly signal?: AbortSignal
  /** Candidatos que se guardan para la pantalla de revision. */
  readonly maxCandidates?: number
}

const DEFAULT_MAX_CANDIDATES = 5

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
    raw: candidate.raw,
  }
}

function buildResult(
  best: GeocodeCandidate,
  query: GeocodeQuery,
  candidates: readonly GeocodeCandidate[],
  attempts: readonly GeocodeAttempt[],
  now: string,
): GeocodeResult {
  return {
    latitude: best.latitude,
    longitude: best.longitude,
    matchedName: best.matchedName,
    matchedAddress: best.matchedAddress,
    provider: best.provider,
    confidence: best.confidence,
    queryUsed: query.text,
    manuallyVerified: false,
    candidates,
    attempts,
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
  const queries = buildQueries(record, {
    sessionCountry: options.sessionCountry ?? null,
    ...(options.maxQueries === undefined ? {} : { maxQueries: options.maxQueries }),
  })

  if (queries.length === 0) {
    return { status: 'NOT_FOUND', result: null, attempts: [] }
  }

  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
  const attempts: GeocodeAttempt[] = []

  let best: { candidate: GeocodeCandidate; query: GeocodeQuery } | null = null
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
      attempts.push({
        provider: provider.name,
        query,
        candidateCount: scored.length,
        bestConfidence: top?.confidence ?? 0,
        error: null,
      })

      if (top && (best === null || top.confidence > best.candidate.confidence)) {
        best = { candidate: top, query }
        bestPool = scored.slice(0, maxCandidates)
      }

      if (top && top.confidence >= options.thresholds.accept) {
        return {
          status: 'FOUND',
          result: buildResult(top, query, bestPool, attempts, options.now()),
          attempts,
        }
      }
    }
  }

  return finish(best, bestPool, attempts, options)
}

function finish(
  best: { candidate: GeocodeCandidate; query: GeocodeQuery } | null,
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
    status: statusFor(best.candidate.confidence, options.thresholds),
    result: buildResult(best.candidate, best.query, pool, attempts, options.now()),
    attempts,
  }
}
