/**
 * Configuracion centralizada del motor de geocodificacion (spec secciones 11 y 13).
 *
 * Se define ya en el MVP 1 para que estos valores no acaben dispersos por
 * componentes React cuando lleguen los MVP 3-5. Todavia no los consume nadie.
 *
 * Los pesos son un punto de partida y deben validarse con datos reales antes
 * de darlos por buenos (spec seccion 13).
 */

export interface RequestPolicy {
  readonly requestsPerSecond: number
  readonly maxRetries: number
  readonly timeoutMs: number
  readonly batchSize: number
}

/** Nominatim exige como maximo 1 peticion por segundo. No subir este valor. */
export const NOMINATIM_POLICY: RequestPolicy = {
  requestsPerSecond: 1,
  maxRetries: 3,
  timeoutMs: 10_000,
  batchSize: 25,
}

export const PHOTON_POLICY: RequestPolicy = {
  requestsPerSecond: 2,
  maxRetries: 3,
  timeoutMs: 10_000,
  batchSize: 25,
}

/** Peso de cada senal al puntuar un candidato. Configurable y provisional. */
export const SCORING_WEIGHTS = {
  client: 0.2,
  location_name: 0.25,
  address: 0.2,
  postal_code: 0.15,
  city: 0.1,
  region: 0.05,
  business_type: 0.05,
} as const

/** Umbrales que separan FOUND / LOW_CONFIDENCE / NEEDS_REVIEW. */
export const CONFIDENCE_THRESHOLDS = {
  accept: 0.8,
  review: 0.5,
} as const
