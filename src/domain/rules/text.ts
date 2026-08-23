/**
 * Normalizacion de texto compartida por deteccion de columnas, comparaciones
 * y (mas adelante) scoring. Sin dependencias externas.
 */

/** Quita acentos y diacriticos: "DIRECCIÓN" -> "DIRECCION". */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Clave canonica de un texto: minusculas, sin acentos, sin puntuacion,
 * espacios colapsados. "Código_Postal / CP" -> "codigo postal cp".
 */
export function canonicalize(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Colapsa espacios internos y recorta, preservando acentos y mayusculas. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** True si `haystack` contiene `needle` como palabra completa. */
export function containsWord(haystack: string, needle: string): boolean {
  if (needle === '') return false
  const words = haystack.split(' ')
  const needleWords = needle.split(' ')
  if (needleWords.length === 1) return words.includes(needle)
  for (let i = 0; i <= words.length - needleWords.length; i += 1) {
    if (needleWords.every((word, offset) => words[i + offset] === word)) return true
  }
  return false
}

/** Convierte un valor de celda desconocido en texto limpio. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return collapseWhitespace(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    // ExcelJS devuelve objetos para celdas con formula, hipervinculo o rich text.
    const candidate = value as { result?: unknown; text?: unknown; richText?: unknown }
    if (Array.isArray(candidate.richText)) {
      return collapseWhitespace(
        candidate.richText
          .map((part) =>
            typeof part === 'object' && part !== null && 'text' in part
              ? String((part as { text: unknown }).text)
              : '',
          )
          .join(''),
      )
    }
    if (candidate.result !== undefined) return cellToString(candidate.result)
    if (candidate.text !== undefined) return cellToString(candidate.text)
    return ''
  }
  return ''
}
