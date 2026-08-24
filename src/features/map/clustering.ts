import type { MapPoint } from './LocationMap'

/**
 * Agrupacion de puntos cercanos en el mapa.
 *
 * Con cientos de registros las chinchetas se amontonan y no se distingue si
 * una tapa a dos o a veinte. Se agrupan por celdas de una rejilla medida en
 * pixeles de pantalla, no en grados: asi el tamano visual del grupo es el
 * mismo en Bogota que en Alaska, cosa que no pasaria agrupando por latitud y
 * longitud.
 *
 * Se hace a mano en lugar de con `leaflet.markercluster` porque son treinta
 * lineas deterministas y probables, y evita una dependencia mas que arrastrar.
 */

/** Lado de la celda de agrupacion, en pixeles de pantalla. */
export const DEFAULT_CELL_SIZE_PX = 64

const TILE_SIZE = 256
/** Limite de Web Mercator: mas alla la proyeccion se va a infinito. */
const MAX_LATITUDE = 85.05112878

export interface ProjectedPoint {
  readonly x: number
  readonly y: number
}

/** Proyecta a pixeles de Web Mercator para el zoom dado. */
export function project(latitude: number, longitude: number, zoom: number): ProjectedPoint {
  const scale = TILE_SIZE * 2 ** zoom
  const clamped = Math.max(Math.min(latitude, MAX_LATITUDE), -MAX_LATITUDE)
  const sin = Math.sin((clamped * Math.PI) / 180)

  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

export interface Bounds {
  readonly north: number
  readonly south: number
  readonly east: number
  readonly west: number
}

export interface Cluster {
  /** Estable para el mismo conjunto y zoom, para que React no remonte. */
  readonly id: string
  /** Centro del grupo: promedio de sus miembros. */
  readonly latitude: number
  readonly longitude: number
  readonly count: number
  readonly members: readonly MapPoint[]
  readonly bounds: Bounds
  /** True si algun miembro esta seleccionado. */
  readonly hasSelected: boolean
}

export interface ClusterOptions {
  readonly zoom: number
  readonly cellSizePx?: number
}

function boundsOf(members: readonly MapPoint[]): Bounds {
  const lats = members.map((member) => member.latitude)
  const lngs = members.map((member) => member.longitude)

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  }
}

/**
 * Agrupa los puntos en celdas de rejilla.
 *
 * Los puntos seleccionados nunca se agrupan: lo que el usuario esta mirando
 * tiene que seguir viendose como un punto propio.
 */
export function clusterPoints(points: readonly MapPoint[], options: ClusterOptions): Cluster[] {
  const cell = options.cellSizePx ?? DEFAULT_CELL_SIZE_PX
  const buckets = new Map<string, MapPoint[]>()

  for (const point of points) {
    if (point.selected) {
      // Fuera de la rejilla: se emite como grupo de uno, siempre visible.
      buckets.set(`sel:${point.id}`, [point])
      continue
    }

    const { x, y } = project(point.latitude, point.longitude, options.zoom)
    const key = `${String(Math.floor(x / cell))}:${String(Math.floor(y / cell))}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(point)
    else buckets.set(key, [point])
  }

  return (
    [...buckets.entries()]
      .map(([key, members]) => {
        const sum = members.reduce(
          (acc, member) => ({
            lat: acc.lat + member.latitude,
            lng: acc.lng + member.longitude,
          }),
          { lat: 0, lng: 0 },
        )

        return {
          id: `cluster-${key}`,
          latitude: sum.lat / members.length,
          longitude: sum.lng / members.length,
          count: members.length,
          members,
          bounds: boundsOf(members),
          hasSelected: members.some((member) => member.selected),
        }
      })
      // Orden estable: los grupos grandes se dibujan primero y los pequenos
      // encima, para que un punto suelto no quede tapado por un globo grande.
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
  )
}

/** True si el grupo cabe en un solo punto: todos sus miembros coinciden. */
export function isDegenerate(cluster: Cluster): boolean {
  return (
    cluster.bounds.north === cluster.bounds.south && cluster.bounds.east === cluster.bounds.west
  )
}
