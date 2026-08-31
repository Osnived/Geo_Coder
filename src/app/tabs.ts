/**
 * Secciones de la aplicacion, en el orden en que aparecen en la barra lateral.
 *
 * La navegacion sigue el flujo de trabajo real —datos, procesamiento, revision,
 * exportacion— y no la estructura interna del codigo. Antes habia una seccion
 * por pantalla (importar, entrada manual, registros...), lo que obligaba a
 * saltar entre tres sitios para meter datos.
 */

export type Tab = 'data' | 'search' | 'review' | 'mapa' | 'export' | 'settings' | 'records'

export interface TabEntry {
  readonly id: Tab
  readonly label: string
  /** Agrupa las secciones por etapa del trabajo. */
  readonly group: string
  /** Una frase que dice para que sirve la seccion. */
  readonly hint: string
}

export const TABS: readonly TabEntry[] = [
  { id: 'data', label: 'Datos', group: 'Flujo', hint: 'Cargar un Excel o escribir registros' },
  {
    id: 'search',
    label: 'Procesamiento',
    group: 'Flujo',
    hint: 'Geocodificar y reintentar lo que falle',
  },
  { id: 'review', label: 'Revision', group: 'Flujo', hint: 'Comprobar y corregir resultados' },
  { id: 'export', label: 'Exportar', group: 'Flujo', hint: 'Generar el Excel final' },
  { id: 'mapa', label: 'Mapa', group: 'Herramientas', hint: 'Todos los puntos localizados' },
  { id: 'settings', label: 'Ajustes', group: 'Herramientas', hint: 'Asistente de IA opcional' },
]

/**
 * Secciones que existen pero no se ofrecen en la navegacion.
 *
 * `records` es la tabla completa de registros. Se llega a ella desde una tarjeta
 * de grupo en Datos ("Ver registros"), no como destino independiente: tenerla en
 * la barra la convertia en una cuarta parada del ingreso de datos.
 */
export const HIDDEN_TABS: ReadonlySet<Tab> = new Set<Tab>(['records'])

/** Seccion a la que se vuelve al salir de una vista sin entrada propia. */
export const PARENT_TAB: Partial<Record<Tab, Tab>> = { records: 'data' }

/** Secciones agrupadas, conservando el orden de `TABS`. */
export const TAB_GROUPS = TABS.reduce<{ name: string; tabs: TabEntry[] }[]>((groups, entry) => {
  const last = groups[groups.length - 1]
  if (last && last.name === entry.group) last.tabs.push(entry)
  else groups.push({ name: entry.group, tabs: [entry] })
  return groups
}, [])

/** Etiqueta visible de una seccion, incluidas las que no estan en la barra. */
export const TAB_LABELS: Record<Tab, string> = {
  data: 'Datos',
  search: 'Procesamiento',
  review: 'Revision',
  mapa: 'Mapa',
  export: 'Exportar',
  settings: 'Ajustes',
  records: 'Registros',
}

/**
 * Vistas que ocupan exactamente la pantalla y gestionan su propio
 * desplazamiento por dentro.
 *
 * Son vistas de trabajo —listas largas, tablas anchas, mapas— donde, con scroll
 * de pagina, los filtros y la cabecera se perdian de vista al bajar.
 *
 * Solo se aplica desde `lg`. Por debajo, estas vistas apilan sus columnas en
 * una sola, y repartir un alto fijo entre cuatro bloques apilados deja a todos
 * inservibles: la cola de revision quedaba en 60 px y el mapa en 0. En pantalla
 * estrecha lo correcto es que la pagina se desplace.
 */
export const FULL_HEIGHT_TABS: ReadonlySet<Tab> = new Set<Tab>([
  'data',
  'records',
  'search',
  'review',
  'mapa',
  'export',
])
