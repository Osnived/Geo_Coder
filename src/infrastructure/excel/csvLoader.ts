import Papa from 'papaparse'

import { ExcelReadError } from './errors'
import type { RawGrid } from './types'

/** Adaptador sobre Papa Parse. Unico archivo que conoce esa libreria. */

const REPLACEMENT_CHARACTER = '�'

/** Delimitadores candidatos, en orden de preferencia ante un empate. */
const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const

/** Lineas que se inspeccionan para decidir el delimitador. */
const DETECTION_DEPTH = 10

/**
 * Decodifica el archivo. Muchos CSV exportados desde Excel en espanol vienen
 * en Windows-1252, no en UTF-8; si la decodificacion UTF-8 produce caracteres
 * de reemplazo se reintenta con Windows-1252 antes de darse por vencido.
 */
export function decodeCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes(REPLACEMENT_CHARACTER)) return utf8

  try {
    return new TextDecoder('windows-1252').decode(buffer)
  } catch {
    return utf8
  }
}

function parseWith(text: string, delimiter: string): string[][] {
  return Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
    delimiter,
  }).data
}

/**
 * Elige el delimitador del CSV.
 *
 * La deteccion automatica de Papa Parse no es fiable con los CSV que exporta
 * Excel en configuracion regional espanola (usa `;` y Papa devuelve `,`), asi
 * que se decide aqui: gana el delimitador que produce mas columnas de forma
 * consistente en las primeras lineas.
 */
export function detectDelimiter(text: string): string {
  let best: string = CANDIDATE_DELIMITERS[0]
  let bestColumns = 1
  let bestVariance = Number.POSITIVE_INFINITY

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const rows = parseWith(text, delimiter)
      .filter((row) => row.some((cell) => cell.trim() !== ''))
      .slice(0, DETECTION_DEPTH)

    if (rows.length === 0) continue

    const counts = rows.map((row) => row.length)
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length
    const variance = counts.reduce((sum, count) => sum + (count - average) ** 2, 0) / counts.length

    // Un delimitador que no parte nada deja una sola columna: no sirve.
    if (average <= 1) continue

    const isBetter = average > bestColumns || (average === bestColumns && variance < bestVariance)

    if (isBetter) {
      best = delimiter
      bestColumns = average
      bestVariance = variance
    }
  }

  return best
}

/** Lee un CSV/TSV y lo devuelve como una unica hoja. */
export function loadCsvGrid(buffer: ArrayBuffer): RawGrid {
  const text = decodeCsv(buffer)
  const delimiter = detectDelimiter(text)

  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
    delimiter,
  })

  const fatal = parsed.errors.find((error) => error.type === 'Quotes')
  if (fatal && parsed.data.length === 0) {
    throw new ExcelReadError('CORRUPT_FILE', fatal.message)
  }

  return parsed.data
}
