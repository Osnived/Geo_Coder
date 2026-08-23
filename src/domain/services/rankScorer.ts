import type { CandidateScorer } from './geocoderService'

/**
 * Puntuacion de referencia: solo mira la posicion que el proveedor asigno.
 *
 * Existe por dos motivos:
 * - Sirve de linea base contra la que comparar el scoring real (MVP 4).
 * - Deja los tests del orquestador independientes del algoritmo de scoring.
 *
 * Su techo esta deliberadamente por debajo del umbral de aceptacion: el primer
 * resultado de un geocoder NO es automaticamente correcto (spec seccion 13),
 * asi que esta puntuacion nunca acepta nada sin revision humana.
 */
const CEILING = 0.6
const STEP = 0.1

export const rankScorer: CandidateScorer = (_record, candidate) => {
  const confidence = Math.max(0, CEILING - candidate.rank * STEP)
  return { confidence, signals: { rank: confidence } }
}
