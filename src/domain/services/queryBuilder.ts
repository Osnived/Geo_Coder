import type { Country } from '../models/country'
import type { NormalizedField } from '../models/fields'
import type { GeocodeQuery } from '../models/geocode'
import type { EstablishmentRecord } from '../models/record'
import { canonicalize, collapseWhitespace } from '../rules/text'

/**
 * Construccion de consultas geograficas (spec seccion 6).
 *
 * El sistema debe funcionar con informacion incompleta, asi que en lugar de
 * una unica consulta se genera una cascada de estrategias, de la mas
 * especifica a la mas generica. El motor de geocodificacion las prueba en
 * orden hasta obtener un resultado satisfactorio.
 */

interface QueryTemplate {
  readonly id: string
  /** Todos estos campos deben tener valor para que la plantilla aplique. */
  readonly requires: readonly NormalizedField[]
  /** Campos que se incluyen, en orden. Los vacios se omiten. */
  readonly fields: readonly NormalizedField[]
}

/**
 * Plantillas ordenadas de mas a menos especifica.
 *
 * El orden importa: una direccion completa identifica un punto exacto, y un
 * nombre de cadena suelto puede devolver cientos de sucursales. Las plantillas
 * que combinan nombre y direccion van primero porque aportan las dos senales.
 *
 * `business_type` solo aparece cuando no hay nombre de local: sirve para
 * desambiguar ("Farmacia Olimpica" vs "Olimpica"), pero mezclado con un nombre
 * propio suele degradar la busqueda.
 */
const TEMPLATES: readonly QueryTemplate[] = [
  {
    id: 'name+address+locality',
    requires: ['location_name', 'address'],
    fields: ['location_name', 'address', 'postal_code', 'city', 'region'],
  },
  {
    id: 'address+locality',
    requires: ['address'],
    fields: ['address', 'postal_code', 'city', 'region'],
  },
  {
    id: 'client+name+locality',
    requires: ['client', 'location_name', 'city'],
    fields: ['client', 'location_name', 'city', 'region'],
  },
  {
    id: 'name+locality',
    requires: ['location_name', 'city'],
    fields: ['location_name', 'city', 'region'],
  },
  {
    id: 'name+postal',
    requires: ['location_name', 'postal_code'],
    fields: ['location_name', 'postal_code'],
  },
  {
    id: 'address+city',
    requires: ['address', 'city'],
    fields: ['address', 'city'],
  },
  {
    id: 'client+type+city',
    requires: ['client', 'business_type', 'city'],
    fields: ['business_type', 'client', 'city'],
  },
  {
    id: 'name+region',
    requires: ['location_name', 'region'],
    fields: ['location_name', 'region'],
  },
  {
    id: 'client+city',
    requires: ['client', 'city'],
    fields: ['client', 'city'],
  },
  {
    id: 'name',
    requires: ['location_name'],
    fields: ['location_name'],
  },
  {
    id: 'client+region',
    requires: ['client', 'region'],
    fields: ['client', 'region'],
  },
  {
    id: 'postal+city',
    requires: ['postal_code', 'city'],
    fields: ['postal_code', 'city'],
  },
  {
    id: 'city+region',
    requires: ['city'],
    fields: ['city', 'region'],
  },
]

export interface BuildQueriesOptions {
  /** Pais de la sesion. Se usa si el registro no trae uno propio. */
  readonly sessionCountry?: Country | null
  /** Tope de estrategias por registro. Evita cascadas interminables. */
  readonly maxQueries?: number
}

const DEFAULT_MAX_QUERIES = 4

function valueOf(record: EstablishmentRecord, field: NormalizedField): string {
  return collapseWhitespace(record.fields[field])
}

function hasAll(record: EstablishmentRecord, fields: readonly NormalizedField[]): boolean {
  return fields.every((field) => valueOf(record, field) !== '')
}

/** Pais efectivo: el del registro si lo trae, si no el de la sesion. */
export function resolveCountry(
  record: EstablishmentRecord,
  sessionCountry: Country | null | undefined,
): Country | null {
  const own = valueOf(record, 'country')
  if (own === '') return sessionCountry ?? null

  // Si el registro trae el mismo pais que la sesion, se conserva el codigo ISO.
  if (sessionCountry && canonicalize(sessionCountry.name) === canonicalize(own)) {
    return sessionCountry
  }
  if (sessionCountry && canonicalize(sessionCountry.code) === canonicalize(own)) {
    return sessionCountry
  }
  // Pais escrito a mano sin codigo conocido: sirve como texto, no como filtro.
  return { name: own, code: '' }
}

/**
 * Genera la cascada de consultas de un registro, de la mas especifica a la mas
 * generica, sin repetir textos equivalentes.
 */
export function buildQueries(
  record: EstablishmentRecord,
  options: BuildQueriesOptions = {},
): GeocodeQuery[] {
  const country = resolveCountry(record, options.sessionCountry)
  const limit = options.maxQueries ?? DEFAULT_MAX_QUERIES

  const queries: GeocodeQuery[] = []
  const seen = new Set<string>()

  for (const template of TEMPLATES) {
    if (queries.length >= limit) break
    if (!hasAll(record, template.requires)) continue

    const usedFields = template.fields.filter((field) => valueOf(record, field) !== '')
    if (usedFields.length === 0) continue

    const parts = usedFields.map((field) => valueOf(record, field))
    if (country && country.name !== '') parts.push(country.name)

    const text = parts.join(', ')
    const key = canonicalize(text)
    if (key === '' || seen.has(key)) continue
    seen.add(key)

    queries.push({
      text,
      country,
      usedFields,
      strategy: queries.length,
      templateId: template.id,
    })
  }

  return queries
}

/** True si el registro tiene datos suficientes para intentar una busqueda. */
export function isSearchable(
  record: EstablishmentRecord,
  options: BuildQueriesOptions = {},
): boolean {
  return buildQueries(record, { ...options, maxQueries: 1 }).length > 0
}
