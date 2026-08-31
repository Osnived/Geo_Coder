import { createContext, useContext } from 'react'

import type { Tab } from './tabs'

/**
 * Contexto de navegacion entre secciones.
 *
 * Existe porque algunas acciones que viven dentro de una vista llevan a otra:
 * "Ver registros" en una tarjeta de grupo, o "Ir a Datos" cuando no hay nada
 * que procesar. Pasar el `setTab` por props hasta ahi obligaria a atravesar
 * componentes que no tienen nada que ver con la navegacion.
 *
 * Va en un archivo sin componentes para no romper la recarga en caliente.
 */

export interface Navigation {
  readonly current: Tab
  readonly go: (tab: Tab) => void
}

export const NavigationContext = createContext<Navigation | null>(null)

/**
 * Navegacion activa.
 *
 * Fuera del proveedor devuelve una navegacion inerte en lugar de lanzar: asi un
 * panel se puede montar aislado en un test sin envolverlo.
 */
export function useNavigation(): Navigation {
  return useContext(NavigationContext) ?? { current: 'data', go: () => undefined }
}
