import { NORMALIZED_FIELDS, type NormalizedField } from '../models/fields'
import { canonicalize, containsWord } from './text'

/**
 * Deteccion automatica del significado de una columna a partir de su nombre
 * (spec seccion 5).
 *
 * SIEMPRE es una sugerencia. El nombre de una columna no garantiza su
 * significado, asi que cada sugerencia viaja con un nivel de certeza para que
 * la interfaz pueda mostrar cuales conviene revisar.
 */

export type MatchStrength = 'exact' | 'strong' | 'weak'

const SCORE_BY_STRENGTH: Record<MatchStrength, number> = {
  exact: 100,
  strong: 70,
  weak: 40,
}

/** Umbral minimo para proponer un campo. Por debajo, no se sugiere nada. */
const MIN_SCORE = SCORE_BY_STRENGTH.weak

interface FieldSynonyms {
  /** Coincidencia exacta del encabezado completo. Maxima certeza. */
  readonly exact: readonly string[]
  /** Aparece como palabra dentro del encabezado. Certeza media. */
  readonly strong: readonly string[]
  /**
   * Terminos ambiguos que apuntan al campo pero tambien podrian ser otra cosa.
   * Solo ganan si nada mejor compite.
   */
  readonly weak: readonly string[]
}

/**
 * Sinonimos por campo. Se comparan en forma canonica (minusculas, sin acentos,
 * sin puntuacion), asi que "CODIGO POSTAL" y "codigo_postal" son equivalentes.
 */
const SYNONYMS: Record<NormalizedField, FieldSynonyms> = {
  client: {
    exact: [
      'cliente',
      'customer',
      'chain',
      'brand',
      'marca',
      'cadena',
      'nombre cliente',
      'nombre del cliente',
      'razon social',
      'account',
      'cuenta',
    ],
    strong: ['cliente', 'customer', 'cadena', 'marca', 'brand', 'chain'],
    weak: ['empresa', 'compania', 'company', 'grupo', 'banner'],
  },
  business_type: {
    exact: [
      'tipo',
      'tipo establecimiento',
      'tipo de establecimiento',
      'tipo de negocio',
      'tipo negocio',
      'business type',
      'store type',
      'categoria',
      'category',
      'formato',
      'canal',
      'giro',
      'rubro',
    ],
    strong: ['tipo', 'business type', 'store type', 'categoria', 'category', 'formato'],
    weak: ['clase', 'segmento', 'canal'],
  },
  location_name: {
    exact: [
      'nombre',
      'local',
      'nombre local',
      'nombre del local',
      'store name',
      'business name',
      'location name',
      'sucursal',
      'nombre sucursal',
      'nombre de la sucursal',
      'punto de venta',
      'pdv',
      'establecimiento',
      'nombre establecimiento',
      'site',
      'site name',
      'store',
      'tienda',
      'nombre comercial',
    ],
    strong: [
      'nombre local',
      'nombre del local',
      'store name',
      'business name',
      'location name',
      'sucursal',
      'punto de venta',
      'nombre comercial',
      'establecimiento',
    ],
    weak: ['nombre', 'local', 'tienda', 'store', 'site', 'descripcion'],
  },
  address: {
    exact: [
      'address',
      'direccion',
      'street',
      'domicilio',
      'calle',
      'dir',
      'address 1',
      'address line 1',
      'direccion completa',
      'street address',
    ],
    strong: ['address', 'direccion', 'street', 'domicilio', 'calle'],
    weak: ['ubicacion', 'location', 'via'],
  },
  city: {
    exact: ['city', 'ciudad', 'municipio', 'localidad', 'poblacion', 'town', 'comuna'],
    strong: ['city', 'ciudad', 'municipio', 'localidad'],
    weak: ['poblacion', 'town', 'plaza'],
  },
  region: {
    exact: [
      'state',
      'estado',
      'departamento',
      'provincia',
      'region',
      'dpto',
      'depto',
      'entidad',
      'entidad federativa',
      'comunidad autonoma',
    ],
    strong: ['state', 'estado', 'departamento', 'provincia', 'region'],
    weak: ['zona', 'territorio', 'entidad'],
  },
  postal_code: {
    exact: [
      'zip',
      'zipcode',
      'zip code',
      'postal code',
      'postcode',
      'cp',
      'c p',
      'codigo postal',
      'cod postal',
    ],
    strong: ['zip', 'postal code', 'codigo postal', 'postcode', 'zipcode'],
    weak: ['cp', 'codigo'],
  },
  country: {
    exact: ['country', 'pais', 'nacion', 'country code', 'codigo pais', 'iso', 'iso2'],
    strong: ['country', 'pais', 'nacion'],
    weak: ['iso'],
  },
}

export interface ColumnSuggestion {
  /** Campo propuesto, o null si ninguno alcanza el umbral. */
  readonly field: NormalizedField | null
  readonly strength: MatchStrength | null
  readonly score: number
}

const NO_SUGGESTION: ColumnSuggestion = { field: null, strength: null, score: 0 }

function scoreField(canonicalHeader: string, field: NormalizedField): ColumnSuggestion {
  const synonyms = SYNONYMS[field]

  if (synonyms.exact.some((synonym) => synonym === canonicalHeader)) {
    return { field, strength: 'exact', score: SCORE_BY_STRENGTH.exact }
  }
  if (synonyms.strong.some((synonym) => containsWord(canonicalHeader, synonym))) {
    return { field, strength: 'strong', score: SCORE_BY_STRENGTH.strong }
  }
  if (synonyms.weak.some((synonym) => containsWord(canonicalHeader, synonym))) {
    return { field, strength: 'weak', score: SCORE_BY_STRENGTH.weak }
  }
  return NO_SUGGESTION
}

/** Sugerencia para un unico encabezado, sin considerar el resto de columnas. */
export function suggestFieldForHeader(header: string): ColumnSuggestion {
  const canonical = canonicalize(header)
  if (canonical === '') return NO_SUGGESTION

  let best = NO_SUGGESTION
  for (const field of NORMALIZED_FIELDS) {
    const candidate = scoreField(canonical, field)
    if (candidate.score > best.score) best = candidate
  }
  return best.score >= MIN_SCORE ? best : NO_SUGGESTION
}

export interface ColumnMappingEntry {
  /** Indice de la columna en la hoja original (0-based). */
  readonly columnIndex: number
  readonly header: string
  readonly field: NormalizedField | null
  readonly strength: MatchStrength | null
  readonly score: number
  /**
   * Indice de la columna que gano este mismo campo. La sugerencia se retira
   * pero se informa, para que el usuario sepa por que quedo sin mapear.
   */
  readonly displacedBy: number | null
}

/**
 * Sugiere el mapeo del conjunto completo de encabezados.
 *
 * Dos columnas no pueden proponer el mismo campo: gana la de mayor score y,
 * a igualdad, la que aparece primero. Las demas quedan sin sugerencia,
 * indicando quien las desplazo.
 */
export function suggestColumnMapping(headers: readonly string[]): ColumnMappingEntry[] {
  const scored = headers.map((header, columnIndex) => {
    const suggestion = suggestFieldForHeader(header)
    return { columnIndex, header, ...suggestion }
  })

  const winnerByField = new Map<NormalizedField, number>()
  for (const entry of scored) {
    if (entry.field === null) continue
    const currentWinnerIndex = winnerByField.get(entry.field)
    if (currentWinnerIndex === undefined) {
      winnerByField.set(entry.field, entry.columnIndex)
      continue
    }
    const currentWinner = scored[currentWinnerIndex]
    if (currentWinner !== undefined && entry.score > currentWinner.score) {
      winnerByField.set(entry.field, entry.columnIndex)
    }
  }

  return scored.map((entry) => {
    if (entry.field === null) {
      return { ...entry, displacedBy: null }
    }
    const winner = winnerByField.get(entry.field)
    if (winner === entry.columnIndex) {
      return { ...entry, displacedBy: null }
    }
    return {
      columnIndex: entry.columnIndex,
      header: entry.header,
      field: null,
      strength: null,
      score: 0,
      displacedBy: winner ?? null,
    }
  })
}
