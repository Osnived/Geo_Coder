/** Secciones de la aplicacion, en el orden en que aparecen en la barra lateral. */

export type Tab =
  'import' | 'manual' | 'records' | 'search' | 'review' | 'mapa' | 'export' | 'settings'

export interface TabEntry {
  readonly id: Tab
  readonly label: string
  /** Agrupa las secciones por etapa del trabajo. */
  readonly group: string
}

export const TABS: readonly TabEntry[] = [
  { id: 'import', label: 'Importar Excel', group: 'Datos' },
  { id: 'manual', label: 'Entrada manual', group: 'Datos' },
  { id: 'records', label: 'Registros', group: 'Datos' },
  { id: 'search', label: 'Busqueda', group: 'Geocodificacion' },
  { id: 'review', label: 'Revision', group: 'Geocodificacion' },
  { id: 'mapa', label: 'Mapa', group: 'Geocodificacion' },
  { id: 'export', label: 'Exportar', group: 'Salida' },
  { id: 'settings', label: 'Ajustes', group: 'Salida' },
]

/** Secciones agrupadas, conservando el orden de `TABS`. */
export const TAB_GROUPS = TABS.reduce<{ name: string; tabs: TabEntry[] }[]>((groups, entry) => {
  const last = groups[groups.length - 1]
  if (last && last.name === entry.group) last.tabs.push(entry)
  else groups.push({ name: entry.group, tabs: [entry] })
  return groups
}, [])

/**
 * Vistas que ocupan exactamente la pantalla y gestionan su propio
 * desplazamiento por dentro.
 *
 * Son listas largas donde, con scroll de pagina, los filtros y la cabecera se
 * perdian de vista al bajar.
 *
 * Revision y Mapa quedan fuera a proposito: apilan varios paneles de alto
 * variable y, sin desplazamiento de pagina, el contenido de abajo se cortaria
 * sin forma de alcanzarlo.
 */
export const FULL_HEIGHT_TABS: ReadonlySet<Tab> = new Set<Tab>(['records', 'search'])
