import type { EstablishmentRecord } from '../models/record'
import type { RecordStatus } from '../models/status'

/**
 * Politica de reintentos de la geocodificacion.
 *
 * La decision no se toma registro a registro: primero termina la pasada
 * completa, despues se mira el porcentaje global de exito y solo entonces se
 * decide si merece la pena otra vuelta. Reintentar registro por registro
 * gastaria peticiones sin saber todavia si el lote entero ha ido bien.
 *
 * Funciones puras: no conocen React, ni el store, ni los proveedores.
 */

/** Ajustes que el usuario controla desde la interfaz. */
export interface RetrySettings {
  /** Porcentaje de exito por debajo del cual se reintenta. 0..100. */
  readonly minimumSuccessPercentage: number
  /** Vueltas extra como maximo, despues de la pasada inicial. */
  readonly maxRetries: number
}

export const DEFAULT_RETRY_SETTINGS: RetrySettings = {
  minimumSuccessPercentage: 40,
  maxRetries: 3,
}

export const MIN_SUCCESS_PERCENTAGE = 0
export const MAX_SUCCESS_PERCENTAGE = 100
/** Tope al numero de reintentos: mas alla no aporta y castiga al proveedor. */
export const MAX_ALLOWED_RETRIES = 10

/**
 * Estados que cuentan como exito.
 *
 * `LOW_CONFIDENCE` y `NEEDS_REVIEW` no cuentan: tienen coordenadas, pero la
 * aplicacion no las da por buenas, y el porcentaje debe medir lo resuelto, no
 * lo que aun espera a una persona.
 */
export const SUCCESS_STATUSES: readonly RecordStatus[] = ['FOUND', 'MANUALLY_VERIFIED']

/**
 * Estados que justifican otra vuelta.
 *
 * Se reintenta lo que no encontro nada o fallo. Lo que si obtuvo un candidato
 * —aunque sea flojo— no se vuelve a pedir: la consulta seria identica y el
 * proveedor devolveria lo mismo, asi que solo se gastaria cupo. Esos casos se
 * resuelven en la pantalla de revision.
 */
export const RETRYABLE_STATUSES: readonly RecordStatus[] = ['NOT_FOUND', 'ERROR', 'PENDING']

export function isSuccess(record: EstablishmentRecord): boolean {
  return SUCCESS_STATUSES.includes(record.status)
}

/** True si reintentar este registro puede cambiar algo. */
export function isRetryable(record: EstablishmentRecord): boolean {
  if (isSuccess(record)) return false
  // Sin coordenadas no hay nada que perder; con ellas, decide la persona.
  if (record.result !== null) return false
  return RETRYABLE_STATUSES.includes(record.status)
}

export interface AttemptSummary {
  readonly total: number
  readonly success: number
  /** 0..100, redondeado a un decimal. */
  readonly percentage: number
}

/** Porcentaje de exito sobre el conjunto indicado. */
export function summarizeAttempt(records: readonly EstablishmentRecord[]): AttemptSummary {
  const total = records.length
  const success = records.filter(isSuccess).length
  const percentage = total === 0 ? 0 : Math.round((success / total) * 1000) / 10
  return { total, success, percentage }
}

/** Registros que entrarian en la siguiente vuelta. */
export function selectRetryTargets(records: readonly EstablishmentRecord[]): EstablishmentRecord[] {
  return records.filter(isRetryable)
}

export type RetryDecision =
  | { readonly retry: true; readonly targetIds: readonly string[] }
  | {
      readonly retry: false
      readonly reason: 'threshold-met' | 'no-retries-left' | 'nothing-to-retry'
    }

/**
 * Decide si hay otra vuelta, y sobre que registros.
 *
 * Orden de las comprobaciones: primero el porcentaje (si se alcanzo, se acabo),
 * luego los reintentos disponibles y por ultimo si queda algo reintentable. Asi
 * el motivo que se muestra al usuario es el que de verdad detuvo el proceso.
 */
export function decideRetry(input: {
  readonly records: readonly EstablishmentRecord[]
  readonly percentage: number
  readonly settings: RetrySettings
  /** Reintentos ya consumidos. La pasada inicial no cuenta. */
  readonly retriesUsed: number
}): RetryDecision {
  if (input.percentage >= input.settings.minimumSuccessPercentage) {
    return { retry: false, reason: 'threshold-met' }
  }
  if (input.retriesUsed >= input.settings.maxRetries) {
    return { retry: false, reason: 'no-retries-left' }
  }

  const targets = selectRetryTargets(input.records)
  if (targets.length === 0) return { retry: false, reason: 'nothing-to-retry' }

  return { retry: true, targetIds: targets.map((record) => record.id) }
}

/** Deja un porcentaje dentro de rango. Cadena vacia o basura cae en el default. */
export function clampSuccessPercentage(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RETRY_SETTINGS.minimumSuccessPercentage
  return Math.min(MAX_SUCCESS_PERCENTAGE, Math.max(MIN_SUCCESS_PERCENTAGE, Math.round(value)))
}

export function clampMaxRetries(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RETRY_SETTINGS.maxRetries
  return Math.min(MAX_ALLOWED_RETRIES, Math.max(0, Math.round(value)))
}
