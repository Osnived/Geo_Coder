import { describe, expect, it } from 'vitest'

import {
  estimateRemainingMs,
  formatApprox,
  formatClock,
  MIN_SAMPLES_FOR_ESTIMATE,
  recordsPerMinute,
} from './timing'

describe('formatClock', () => {
  it('escribe minutos y segundos', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(7_000)).toBe('0:07')
    expect(formatClock(83_000)).toBe('1:23')
  })

  it('rellena los segundos con cero a la izquierda', () => {
    expect(formatClock(65_000)).toBe('1:05')
  })

  it('anade las horas solo cuando hacen falta', () => {
    expect(formatClock(3_599_000)).toBe('59:59')
    expect(formatClock(3_723_000)).toBe('1:02:03')
  })

  it('redondea al segundo mas cercano', () => {
    expect(formatClock(1_400)).toBe('0:01')
    expect(formatClock(1_600)).toBe('0:02')
  })

  /** Un reloj en negativo no significa nada: se muestra a cero. */
  it('no muestra tiempos negativos', () => {
    expect(formatClock(-5_000)).toBe('0:00')
  })
})

describe('formatApprox', () => {
  it('usa segundos por debajo del minuto', () => {
    expect(formatApprox(6_000)).toBe('6 s')
  })

  it('usa minutos hasta la hora', () => {
    expect(formatApprox(120_000)).toBe('2 min')
    expect(formatApprox(3_540_000)).toBe('59 min')
  })

  it('usa horas con un decimal', () => {
    expect(formatApprox(5_400_000)).toBe('1.5 h')
  })
})

describe('estimateRemainingMs', () => {
  /**
   * La razon de ser del umbral: el primer registro suele ser el mas lento
   * (arranque del limitador, cache vacia). Estimar con una sola medida daria un
   * numero que se corrige al segundo siguiente.
   */
  it('no estima hasta tener suficientes muestras', () => {
    for (let processed = 0; processed < MIN_SAMPLES_FOR_ESTIMATE; processed += 1) {
      expect(
        estimateRemainingMs({ processed, total: 100, elapsedMs: 10_000 }),
        `con ${String(processed)} muestras`,
      ).toBeNull()
    }
  })

  it('estima con el ritmo observado', () => {
    // 3 registros en 6 s = 2 s cada uno. Faltan 7 → 14 s.
    expect(estimateRemainingMs({ processed: 3, total: 10, elapsedMs: 6_000 })).toBe(14_000)
  })

  it('devuelve cero cuando ya no queda nada', () => {
    expect(estimateRemainingMs({ processed: 10, total: 10, elapsedMs: 20_000 })).toBe(0)
  })

  it('no revienta si procesados supera el total', () => {
    expect(estimateRemainingMs({ processed: 12, total: 10, elapsedMs: 20_000 })).toBe(0)
  })

  it('sin tiempo medido no estima', () => {
    expect(estimateRemainingMs({ processed: 5, total: 10, elapsedMs: 0 })).toBeNull()
  })

  it('se ajusta al ritmo: mas lento, mas restante', () => {
    const rapido = estimateRemainingMs({ processed: 5, total: 100, elapsedMs: 5_000 })
    const lento = estimateRemainingMs({ processed: 5, total: 100, elapsedMs: 50_000 })

    expect(rapido).toBe(95_000)
    expect(lento).toBe(950_000)
  })
})

describe('recordsPerMinute', () => {
  it('calcula el ritmo con un decimal', () => {
    // 30 registros en 60 s = 30 por minuto.
    expect(recordsPerMinute(30, 60_000)).toBe(30)
    // 1 registro en 2 s = 30 por minuto.
    expect(recordsPerMinute(1, 2_000)).toBe(30)
  })

  it('redondea a un decimal', () => {
    expect(recordsPerMinute(7, 60_000)).toBe(7)
    expect(recordsPerMinute(1, 7_000)).toBe(8.6)
  })

  it('sin datos devuelve null en lugar de cero', () => {
    expect(recordsPerMinute(0, 10_000)).toBeNull()
    expect(recordsPerMinute(5, 0)).toBeNull()
  })
})
