import type { Country } from '@/domain/models/country'
import { canonicalize } from '@/domain/rules/text'

/**
 * Catalogo de paises para el selector (spec seccion 8).
 *
 * Se guardan solo los codigos ISO 3166-1 alpha-2 y los nombres se derivan con
 * `Intl.DisplayNames`, que ya viene en el navegador. Asi no se mantiene a mano
 * una lista de nombres traducidos ni se agrega una dependencia.
 */

const ISO_ALPHA2 =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR ' +
  'BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ ' +
  'EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW ' +
  'GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY ' +
  'KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV ' +
  'MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
  'QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG ' +
  'TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

/** Paises que aparecen primero por ser los casos de uso habituales. */
export const PRIORITY_COUNTRY_CODES = ['CO', 'MX', 'US', 'ES', 'AR', 'CL', 'PE', 'BR'] as const

function regionNames(): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' })
  } catch {
    return null
  }
}

function buildCatalog(): Country[] {
  const display = regionNames()
  const codes = ISO_ALPHA2.split(' ')

  return codes.map((code) => ({
    code,
    name: display?.of(code) ?? code,
  }))
}

const CATALOG = buildCatalog()

const BY_CODE = new Map(CATALOG.map((country) => [country.code, country]))

/** Catalogo ordenado: primero los paises frecuentes, luego el resto por nombre. */
export const COUNTRIES: readonly Country[] = (() => {
  const priority = PRIORITY_COUNTRY_CODES.map((code) => BY_CODE.get(code)).filter(
    (country): country is Country => country !== undefined,
  )
  const prioritySet = new Set(priority.map((country) => country.code))
  const rest = CATALOG.filter((country) => !prioritySet.has(country.code)).sort((a, b) =>
    a.name.localeCompare(b.name, 'es'),
  )
  return [...priority, ...rest]
})()

export function findCountryByCode(code: string): Country | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null
}

/** Busqueda por nombre, sin acentos ni mayusculas. */
const BY_CANONICAL_NAME = new Map(CATALOG.map((country) => [canonicalize(country.name), country]))

/**
 * Pais escrito a mano, o `null` si no se reconoce.
 *
 * Sirve para que un "colombia" escrito en el formulario acote las sugerencias
 * igual que si se hubiera elegido en el selector. Acepta tambien el codigo ISO,
 * porque hay quien escribe "CO".
 */
export function findCountryByName(name: string): Country | null {
  const text = name.trim()
  if (text === '') return null

  const byName = BY_CANONICAL_NAME.get(canonicalize(text))
  if (byName) return byName

  return text.length === 2 ? findCountryByCode(text) : null
}
