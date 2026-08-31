import { describe, expect, it } from 'vitest'

import { makeRecord, makeResult } from '@/test/factories'

import type { EstablishmentRecord } from '../models/record'
import type { RecordStatus } from '../models/status'

import {
  clampMaxRetries,
  clampSuccessPercentage,
  decideRetry,
  DEFAULT_RETRY_SETTINGS,
  isRetryable,
  isSuccess,
  selectRetryTargets,
  summarizeAttempt,
  type RetrySettings,
} from './retryPolicy'

function record(id: string, status: RecordStatus, withResult = false): EstablishmentRecord {
  return {
    ...makeRecord({ location_name: id }),
    id,
    status,
    result: withResult ? makeResult() : null,
  }
}

/** Un conjunto con el porcentaje de exito que se pida. */
function pool(success: number, failures: number): EstablishmentRecord[] {
  return [
    ...Array.from({ length: success }, (_, index) => record(`ok-${String(index)}`, 'FOUND', true)),
    ...Array.from({ length: failures }, (_, index) => record(`ko-${String(index)}`, 'NOT_FOUND')),
  ]
}

const settings = (overrides: Partial<RetrySettings> = {}): RetrySettings => ({
  ...DEFAULT_RETRY_SETTINGS,
  ...overrides,
})

describe('valores por defecto', () => {
  it('el porcentaje minimo por defecto es 40', () => {
    expect(DEFAULT_RETRY_SETTINGS.minimumSuccessPercentage).toBe(40)
  })

  it('el maximo de reintentos por defecto es 3', () => {
    expect(DEFAULT_RETRY_SETTINGS.maxRetries).toBe(3)
  })
})

describe('isSuccess', () => {
  it('cuenta como exito lo encontrado y lo verificado a mano', () => {
    expect(isSuccess(record('a', 'FOUND', true))).toBe(true)
    expect(isSuccess(record('b', 'MANUALLY_VERIFIED', true))).toBe(true)
  })

  it('no cuenta lo que aun espera a una persona', () => {
    expect(isSuccess(record('a', 'LOW_CONFIDENCE', true))).toBe(false)
    expect(isSuccess(record('b', 'NEEDS_REVIEW', true))).toBe(false)
  })

  it('no cuenta lo que fallo ni lo pendiente', () => {
    for (const status of ['NOT_FOUND', 'ERROR', 'PENDING'] as const) {
      expect(isSuccess(record('a', status)), status).toBe(false)
    }
  })
})

describe('isRetryable', () => {
  it('reintenta lo no encontrado, lo que dio error y lo pendiente', () => {
    for (const status of ['NOT_FOUND', 'ERROR', 'PENDING'] as const) {
      expect(isRetryable(record('a', status)), status).toBe(true)
    }
  })

  it('no reintenta lo que ya se resolvio', () => {
    expect(isRetryable(record('a', 'FOUND', true))).toBe(false)
    expect(isRetryable(record('b', 'MANUALLY_VERIFIED', true))).toBe(false)
  })

  /**
   * La razon de ser del filtro: repetir una consulta identica contra el mismo
   * proveedor devuelve el mismo candidato flojo y gasta cupo para nada.
   */
  it('no reintenta lo que ya obtuvo coordenadas, aunque necesite revision', () => {
    expect(isRetryable(record('a', 'LOW_CONFIDENCE', true))).toBe(false)
    expect(isRetryable(record('b', 'NEEDS_REVIEW', true))).toBe(false)
  })

  it('si un registro perdio su resultado vuelve a ser reintentable', () => {
    expect(isRetryable(record('a', 'NOT_FOUND', false))).toBe(true)
  })
})

describe('summarizeAttempt', () => {
  it('calcula el porcentaje sobre el total', () => {
    expect(summarizeAttempt(pool(350, 650))).toEqual({
      total: 1000,
      success: 350,
      percentage: 35,
    })
  })

  it('redondea a un decimal', () => {
    expect(summarizeAttempt(pool(742, 258)).percentage).toBe(74.2)
  })

  it('un conjunto vacio es 0% y no divide por cero', () => {
    expect(summarizeAttempt([])).toEqual({ total: 0, success: 0, percentage: 0 })
  })

  it('todo resuelto es 100%', () => {
    expect(summarizeAttempt(pool(5, 0)).percentage).toBe(100)
  })
})

describe('selectRetryTargets', () => {
  it('devuelve solo los registros que lo necesitan', () => {
    const records = [
      record('a', 'FOUND', true),
      record('b', 'NOT_FOUND'),
      record('c', 'ERROR'),
      record('d', 'LOW_CONFIDENCE', true),
    ]

    expect(selectRetryTargets(records).map((entry) => entry.id)).toEqual(['b', 'c'])
  })

  it('devuelve lista vacia si todo esta resuelto', () => {
    expect(selectRetryTargets(pool(3, 0))).toEqual([])
  })
})

describe('decideRetry', () => {
  it('no reintenta si se alcanzo el porcentaje minimo', () => {
    const decision = decideRetry({
      records: pool(50, 50),
      percentage: 50,
      settings: settings({ minimumSuccessPercentage: 40 }),
      retriesUsed: 0,
    })

    expect(decision).toEqual({ retry: false, reason: 'threshold-met' })
  })

  it('el porcentaje exacto cuenta como alcanzado', () => {
    const decision = decideRetry({
      records: pool(40, 60),
      percentage: 40,
      settings: settings({ minimumSuccessPercentage: 40 }),
      retriesUsed: 0,
    })

    expect(decision.retry).toBe(false)
  })

  it('reintenta si el porcentaje esta por debajo del minimo', () => {
    const decision = decideRetry({
      records: pool(35, 65),
      percentage: 35,
      settings: settings({ minimumSuccessPercentage: 40 }),
      retriesUsed: 0,
    })

    expect(decision.retry).toBe(true)
  })

  it('reintenta solo los registros que lo necesitan', () => {
    const records = [
      record('ok', 'FOUND', true),
      record('flojo', 'LOW_CONFIDENCE', true),
      record('vacio', 'NOT_FOUND'),
      record('roto', 'ERROR'),
    ]

    const decision = decideRetry({
      records,
      percentage: 25,
      settings: settings(),
      retriesUsed: 0,
    })

    expect(decision).toEqual({ retry: true, targetIds: ['vacio', 'roto'] })
  })

  it('respeta el maximo de reintentos', () => {
    const input = {
      records: pool(10, 90),
      percentage: 10,
      settings: settings({ maxRetries: 3 }),
    }

    expect(decideRetry({ ...input, retriesUsed: 2 }).retry).toBe(true)
    expect(decideRetry({ ...input, retriesUsed: 3 })).toEqual({
      retry: false,
      reason: 'no-retries-left',
    })
    expect(decideRetry({ ...input, retriesUsed: 4 })).toEqual({
      retry: false,
      reason: 'no-retries-left',
    })
  })

  it('con cero reintentos configurados nunca reintenta', () => {
    expect(
      decideRetry({
        records: pool(0, 10),
        percentage: 0,
        settings: settings({ maxRetries: 0 }),
        retriesUsed: 0,
      }),
    ).toEqual({ retry: false, reason: 'no-retries-left' })
  })

  it('no reintenta si no queda nada reintentable, aunque falte porcentaje', () => {
    // Todos tienen coordenadas pero ninguno se acepto: reintentar no cambiaria
    // nada, la decision es de la persona.
    const records = [record('a', 'LOW_CONFIDENCE', true), record('b', 'NEEDS_REVIEW', true)]

    expect(decideRetry({ records, percentage: 0, settings: settings(), retriesUsed: 0 })).toEqual({
      retry: false,
      reason: 'nothing-to-retry',
    })
  })

  it('el porcentaje manda sobre los reintentos agotados', () => {
    const decision = decideRetry({
      records: pool(90, 10),
      percentage: 90,
      settings: settings(),
      retriesUsed: 99,
    })

    expect(decision).toEqual({ retry: false, reason: 'threshold-met' })
  })
})

describe('validacion de los ajustes', () => {
  it('acota el porcentaje a 0..100', () => {
    expect(clampSuccessPercentage(-10)).toBe(0)
    expect(clampSuccessPercentage(150)).toBe(100)
    expect(clampSuccessPercentage(70)).toBe(70)
  })

  it('acepta cualquier valor valido del rango', () => {
    for (const value of [0, 20, 40, 50, 70, 80, 100]) {
      expect(clampSuccessPercentage(value)).toBe(value)
    }
  })

  it('redondea los decimales del porcentaje', () => {
    expect(clampSuccessPercentage(40.6)).toBe(41)
  })

  it('un porcentaje no numerico cae en el valor por defecto', () => {
    expect(clampSuccessPercentage(Number.NaN)).toBe(40)
  })

  it('acota los reintentos y no admite negativos', () => {
    expect(clampMaxRetries(-1)).toBe(0)
    expect(clampMaxRetries(3)).toBe(3)
    expect(clampMaxRetries(999)).toBe(10)
  })

  it('un numero de reintentos no numerico cae en el valor por defecto', () => {
    expect(clampMaxRetries(Number.NaN)).toBe(3)
  })
})
