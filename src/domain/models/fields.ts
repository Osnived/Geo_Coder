/**
 * Campos del modelo normalizado. Excel y entrada manual producen exactamente
 * estos mismos campos (spec seccion 3).
 *
 * `client`, `business_type` y `location_name` son conceptos distintos y no
 * deben tratarse como sinonimos (spec seccion 7).
 */
export const NORMALIZED_FIELDS = [
  'client',
  'business_type',
  'location_name',
  'address',
  'city',
  'region',
  'postal_code',
  'country',
] as const

export type NormalizedField = (typeof NORMALIZED_FIELDS)[number]

/** Etiquetas en espanol para la interfaz. */
export const FIELD_LABELS: Record<NormalizedField, string> = {
  client: 'Cliente / cadena',
  business_type: 'Tipo de establecimiento',
  location_name: 'Nombre del local',
  address: 'Direccion',
  city: 'Ciudad',
  region: 'Region / Estado / Departamento',
  postal_code: 'Codigo postal',
  country: 'Pais',
}

/** Valores de un registro: todos los campos existen, cadena vacia = sin dato. */
export type NormalizedFields = Record<NormalizedField, string>

export function emptyFields(): NormalizedFields {
  return {
    client: '',
    business_type: '',
    location_name: '',
    address: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
  }
}

export function isNormalizedField(value: string): value is NormalizedField {
  return (NORMALIZED_FIELDS as readonly string[]).includes(value)
}
