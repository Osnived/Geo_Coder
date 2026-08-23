import { canonicalize } from './text'

/**
 * Comparacion de textos para el scoring (spec seccion 13).
 *
 * Deliberadamente simple y determinista: no hay modelos ni servicios externos.
 * Todo se apoya en la forma canonica (minusculas, sin acentos, sin puntuacion).
 */

/** Conectores que no aportan informacion al comparar. */
const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'en',
  'a',
  'the',
  'of',
  'and',
])

/**
 * Abreviaturas de via frecuentes en Espana y Latinoamerica. Sin esto,
 * "Cra. 53" y "Carrera 53" no se parecerian en nada.
 */
const ABBREVIATIONS: Record<string, string> = {
  cra: 'carrera',
  kra: 'carrera',
  kr: 'carrera',
  cr: 'carrera',
  cl: 'calle',
  cll: 'calle',
  c: 'calle',
  av: 'avenida',
  avda: 'avenida',
  ave: 'avenida',
  blvd: 'boulevard',
  bulevar: 'boulevard',
  dg: 'diagonal',
  tv: 'transversal',
  trans: 'transversal',
  no: 'numero',
  num: 'numero',
  nro: 'numero',
  col: 'colonia',
  int: 'interior',
  ext: 'exterior',
  st: 'street',
  rd: 'road',
}

function expand(token: string): string {
  return ABBREVIATIONS[token] ?? token
}

/** Palabras significativas de un texto, ya canonizadas y expandidas. */
export function tokens(value: string): string[] {
  return canonicalize(value)
    .split(' ')
    .filter((token) => token !== '' && !STOPWORDS.has(token))
    .map(expand)
}

/** Coeficiente de Dice sobre conjuntos de palabras. 0..1 */
export function diceCoefficient(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let shared = 0
  for (const token of setA) {
    if (setB.has(token)) shared += 1
  }
  return (2 * shared) / (setA.size + setB.size)
}

/** Proporcion de palabras de `needle` presentes en `haystack`. 0..1 */
export function containment(needle: readonly string[], haystack: readonly string[]): number {
  if (needle.length === 0) return 0
  const set = new Set(haystack)
  const found = needle.filter((token) => set.has(token)).length
  return found / needle.length
}

/**
 * Similitud general entre dos textos. 0..1
 *
 * Se queda con el mayor entre Dice y contencion: "Olimpica" dentro de
 * "Supermercado Olimpica Prado Barranquilla" debe puntuar alto aunque el
 * segundo texto sea mucho mas largo.
 */
export function similarity(a: string, b: string): number {
  const left = tokens(a)
  const right = tokens(b)
  if (left.length === 0 || right.length === 0) return 0

  const dice = diceCoefficient(left, right)
  const contained = Math.max(containment(left, right), containment(right, left))
  return Math.max(dice, contained)
}

/**
 * Similitud de un texto corto contra uno largo, penalizando coincidencias
 * parciales. Se usa para el nombre del local contra la direccion completa.
 */
export function coverage(needle: string, haystack: string): number {
  return containment(tokens(needle), tokens(haystack))
}

/** Compara codigos postales ignorando espacios y guiones. 1, 0.5 o 0. */
export function postalCodeSimilarity(a: string, b: string): number {
  const left = a.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
  const right = b.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
  if (left === '' || right === '') return 0
  if (left === right) return 1
  // Prefijo comun largo: misma zona, distinto reparto.
  const shared = Math.min(left.length, right.length)
  let common = 0
  while (common < shared && left[common] === right[common]) common += 1
  return common >= 3 ? 0.5 : 0
}

/** Numeros presentes en un texto, utiles para comparar direcciones. */
export function numbersIn(value: string): string[] {
  return (value.match(/\d+/g) ?? []).filter((digits) => digits.length <= 6)
}
