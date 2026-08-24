import { FIELD_LABELS, type NormalizedField } from '../models/fields'

import type { ExportSheet } from './exportBuilder'

/**
 * Plantilla de carga: el Excel de ejemplo que se descarga desde la aplicacion.
 *
 * Los encabezados no son decorativos. Estan elegidos para que coincidan de
 * forma exacta con los sinonimos que reconoce la deteccion automatica de
 * columnas, de modo que quien use la plantilla no tenga que mapear nada a mano.
 * Hay un test que lo comprueba: si alguien toca los sinonimos, salta.
 */

export const TEMPLATE_SHEET_NAME = 'Plantilla'
export const INSTRUCTIONS_SHEET_NAME = 'Instrucciones'

interface TemplateColumn {
  /** Encabezado tal cual aparece en el Excel. */
  readonly header: string
  /** Campo normalizado al que debe corresponder. */
  readonly field: NormalizedField
  /**
   * Un campo no es obligatorio en si mismo, pero sin ninguno de los que
   * identifican el sitio no hay busqueda posible.
   */
  readonly importance: 'clave' | 'muy util' | 'opcional'
  readonly guidance: string
}

/** Columnas de la plantilla, en el orden en que aparecen. */
export const TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  {
    header: 'CLIENTE',
    field: 'client',
    importance: 'muy util',
    guidance:
      'La cadena o marca a la que pertenece el local. NO es el nombre de la sucursal: "Olimpica", no "Olimpica Prado".',
  },
  {
    header: 'TIPO',
    field: 'business_type',
    importance: 'opcional',
    guidance:
      'Que clase de negocio es: Tienda, Supermercado, Farmacia, Restaurante, Cafeteria, Banco, Hotel, Gasolinera.',
  },
  {
    header: 'NOMBRE DEL LOCAL',
    field: 'location_name',
    importance: 'clave',
    guidance:
      'El nombre concreto de la sucursal, como se conoce: "Olimpica Prado", "Toks Plaza Universidad".',
  },
  {
    header: 'DIRECCION',
    field: 'address',
    importance: 'clave',
    guidance:
      'Calle y numero. Es el dato que mas cambia el resultado: sin direccion no se puede distinguir una sucursal de otra de la misma cadena.',
  },
  {
    header: 'CIUDAD',
    field: 'city',
    importance: 'clave',
    guidance: 'Ciudad o municipio. Sin esto la busqueda se vuelve muy ambigua.',
  },
  {
    header: 'DEPARTAMENTO',
    field: 'region',
    importance: 'muy util',
    guidance:
      'Departamento, estado, provincia o region, segun el pais. Ayuda cuando hay ciudades con el mismo nombre.',
  },
  {
    header: 'CODIGO POSTAL',
    field: 'postal_code',
    importance: 'muy util',
    guidance: 'Codigo postal o ZIP. Muy util para afinar entre locales cercanos.',
  },
  {
    header: 'PAIS',
    field: 'country',
    importance: 'muy util',
    guidance: 'Pais del local. Si lo dejas vacio se usara el pais que elijas en la aplicacion.',
  },
]

/**
 * Filas de ejemplo. Se borran antes de cargar los datos propios.
 *
 * Son casos reales de distintos paises para que se vea que la plantilla no
 * asume un unico formato de direccion.
 */
const EXAMPLE_ROWS: readonly (readonly string[])[] = [
  [
    'Olimpica',
    'Supermercado',
    'Olimpica Prado',
    'Carrera 54 #70-25',
    'Barranquilla',
    'Atlantico',
    '080001',
    'Colombia',
  ],
  [
    'Toks',
    'Restaurante',
    'Toks Plaza Universidad',
    'Av. Universidad 1000',
    'Ciudad de Mexico',
    'CDMX',
    '03330',
    'Mexico',
  ],
  [
    'Farmatodo',
    'Farmacia',
    'Farmatodo Calle 85',
    'Calle 85 #11-53',
    'Bogota',
    'Cundinamarca',
    '110221',
    'Colombia',
  ],
]

/** Hoja principal: encabezados y filas de ejemplo. */
export function buildTemplateSheet(): ExportSheet {
  return {
    headers: TEMPLATE_COLUMNS.map((column) => column.header),
    rows: EXAMPLE_ROWS,
  }
}

/** Consejos generales, al final de la hoja de instrucciones. */
const GENERAL_NOTES: readonly (readonly string[])[] = [
  ['', '', '', ''],
  ['COMO USAR ESTA PLANTILLA', '', '', ''],
  [
    '1',
    '',
    'Borra las tres filas de ejemplo de la hoja "Plantilla" y pon tus datos debajo de los encabezados.',
    '',
  ],
  [
    '2',
    '',
    'No hace falta rellenar todas las columnas. Deja vacio lo que no tengas: la aplicacion avisa de lo que falta, no lo inventa.',
    '',
  ],
  [
    '3',
    '',
    'Puedes anadir tus propias columnas (codigo interno, telefono, ventas...). Se conservan intactas y vuelven en el archivo exportado.',
    '',
  ],
  [
    '4',
    '',
    'Puedes cambiar los nombres de los encabezados, pero entonces tendras que asignarlos a mano en el paso de mapeo.',
    '',
  ],
  [
    '5',
    '',
    'Si tu Excel tiene un titulo encima de los encabezados, no pasa nada: la aplicacion lo detecta y te deja corregir la fila.',
    '',
  ],
  ['', '', '', ''],
  ['QUE ESPERAR DEL RESULTADO', '', '', ''],
  ['', '', 'Con direccion y ciudad, la mayoria de los registros se resuelven solos.', ''],
  [
    '',
    '',
    'Sin direccion, la aplicacion marca el resultado para revision en vez de arriesgarse: cualquier sucursal de la cadena en esa ciudad puntuaria igual de bien.',
    '',
  ],
  [
    '',
    '',
    'Se consulta un servicio gratuito limitado a 1 busqueda por segundo. Mil registros son del orden de media hora.',
    '',
  ],
]

/** Hoja de instrucciones: que va en cada columna y como se usa la plantilla. */
export function buildInstructionsSheet(): ExportSheet {
  const columnRows = TEMPLATE_COLUMNS.map((column) => [
    column.header,
    column.importance,
    column.guidance,
    FIELD_LABELS[column.field],
  ])

  return {
    headers: ['COLUMNA', 'IMPORTANCIA', 'QUE PONER', 'CAMPO INTERNO'],
    rows: [...columnRows, ...GENERAL_NOTES],
  }
}

export interface NamedSheet {
  readonly name: string
  readonly sheet: ExportSheet
}

/** Las dos hojas de la plantilla, listas para escribirse. */
export function buildTemplateWorkbook(): NamedSheet[] {
  return [
    { name: TEMPLATE_SHEET_NAME, sheet: buildTemplateSheet() },
    { name: INSTRUCTIONS_SHEET_NAME, sheet: buildInstructionsSheet() },
  ]
}
