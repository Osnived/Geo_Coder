/**
 * Pais usado como restriccion geografica de las busquedas (spec seccion 8).
 * `code` es ISO 3166-1 alpha-2 en mayusculas.
 */
export interface Country {
  readonly name: string
  readonly code: string
}

export function isCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value)
}
