/**
 * Tiempos del procesamiento: como se cuentan y como se escriben.
 *
 * Funciones puras, sin React ni reloj propio: reciben los milisegundos ya
 * medidos. Asi se pueden probar sin esperar.
 */

/**
 * Muestras minimas antes de estimar lo que queda.
 *
 * Con un solo registro procesado la estimacion sale de una sola medida, y el
 * primero suele ser el mas lento de todos (arranque del limitador, cache vacia).
 * Anunciar "quedan 40 minutos" y corregirlo a 3 al segundo siguiente es peor
 * que no decir nada.
 */
export const MIN_SAMPLES_FOR_ESTIMATE = 3

/**
 * Milisegundos que faltan, o `null` si todavia no hay con que estimarlo.
 *
 * Se calcula con el ritmo real de esta ejecucion, no con una constante: el
 * limitador, la cache y la cantidad de estrategias por registro hacen que el
 * ritmo cambie entre lotes y entre maquinas.
 */
export function estimateRemainingMs(input: {
  readonly processed: number
  readonly total: number
  readonly elapsedMs: number
}): number | null {
  const { processed, total, elapsedMs } = input

  if (processed < MIN_SAMPLES_FOR_ESTIMATE) return null
  if (processed >= total) return 0
  if (elapsedMs <= 0) return null

  const msPerRecord = elapsedMs / processed
  return Math.round((total - processed) * msPerRecord)
}

/** Registros por minuto del ritmo observado. `null` sin datos suficientes. */
export function recordsPerMinute(processed: number, elapsedMs: number): number | null {
  if (processed === 0 || elapsedMs <= 0) return null
  return Math.round((processed / elapsedMs) * 60_000 * 10) / 10
}

/**
 * Duracion en formato de reloj: "0:07", "1:23", "1:02:03".
 *
 * Se elige reloj y no "hace 2 minutos" porque aqui interesa el numero exacto:
 * es un cronometro, no una fecha.
 */
export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60

  const two = (value: number) => String(value).padStart(2, '0')

  return hours > 0
    ? `${String(hours)}:${two(minutes)}:${two(seconds)}`
    : `${String(minutes)}:${two(seconds)}`
}

/** Duracion aproximada en palabras, para textos donde el reloj chirria. */
export function formatApprox(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${String(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.round((minutes / 60) * 10) / 10
  return `${String(hours)} h`
}
