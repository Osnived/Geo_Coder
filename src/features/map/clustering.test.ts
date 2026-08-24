import { describe, expect, it } from 'vitest'

import { clusterPoints, isDegenerate, project } from './clustering'
import type { MapPoint } from './LocationMap'

function point(id: string, latitude: number, longitude: number, selected = false): MapPoint {
  return { id, latitude, longitude, label: id, selected }
}

describe('project', () => {
  it('coloca el meridiano cero y el ecuador en el centro del mundo', () => {
    const scale = 256 * 2 ** 3
    const { x, y } = project(0, 0, 3)

    expect(x).toBeCloseTo(scale / 2)
    expect(y).toBeCloseTo(scale / 2)
  })

  it('crece con el zoom', () => {
    expect(project(10, 20, 5).x).toBeGreaterThan(project(10, 20, 3).x)
  })

  it('no se va a infinito en los polos', () => {
    expect(Number.isFinite(project(90, 0, 5).y)).toBe(true)
    expect(Number.isFinite(project(-90, 0, 5).y)).toBe(true)
  })
})

describe('clusterPoints', () => {
  it('junta los puntos que caen en la misma celda', () => {
    const clusters = clusterPoints(
      [point('a', 19.4326, -99.1332), point('b', 19.4327, -99.1333), point('c', 19.4325, -99.1331)],
      { zoom: 5 },
    )

    expect(clusters).toHaveLength(1)
    expect(clusters[0]?.count).toBe(3)
  })

  it('los separa al acercarse', () => {
    const lejos = clusterPoints([point('a', 19.4326, -99.1332), point('b', 19.44, -99.14)], {
      zoom: 5,
    })
    const cerca = clusterPoints([point('a', 19.4326, -99.1332), point('b', 19.44, -99.14)], {
      zoom: 16,
    })

    expect(lejos).toHaveLength(1)
    expect(cerca).toHaveLength(2)
  })

  it('separa puntos de paises distintos', () => {
    const clusters = clusterPoints([point('mx', 19.4326, -99.1332), point('co', 4.711, -74.0721)], {
      zoom: 5,
    })

    expect(clusters).toHaveLength(2)
  })

  it('el centro del grupo es el promedio de sus miembros', () => {
    const clusters = clusterPoints([point('a', 10, 20), point('b', 12, 24)], { zoom: 1 })

    expect(clusters[0]?.latitude).toBeCloseTo(11)
    expect(clusters[0]?.longitude).toBeCloseTo(22)
  })

  it('calcula los limites que abarca el grupo', () => {
    const clusters = clusterPoints([point('a', 10, 20), point('b', 12, 24)], { zoom: 1 })

    expect(clusters[0]?.bounds).toEqual({ north: 12, south: 10, east: 24, west: 20 })
  })

  /** Lo que el usuario esta mirando no puede quedar escondido en un globo. */
  it('nunca agrupa el punto seleccionado', () => {
    const clusters = clusterPoints(
      [
        point('a', 19.4326, -99.1332),
        point('b', 19.4327, -99.1333),
        point('c', 19.4325, -99.1331, true),
      ],
      { zoom: 5 },
    )

    const solo = clusters.find((cluster) => cluster.hasSelected)
    expect(solo?.count).toBe(1)
    expect(solo?.members[0]?.id).toBe('c')
  })

  it('conserva todos los puntos, sin perder ni duplicar', () => {
    const points = Array.from({ length: 40 }, (_, index) =>
      point(`p-${String(index)}`, 19 + index * 0.4, -99 + index * 0.4),
    )
    const clusters = clusterPoints(points, { zoom: 6 })

    const ids = clusters.flatMap((cluster) => cluster.members.map((member) => member.id))
    expect(ids).toHaveLength(points.length)
    expect(new Set(ids).size).toBe(points.length)
  })

  it('respeta el tamano de celda indicado', () => {
    const points = [point('a', 19.4326, -99.1332), point('b', 19.6, -99.3)]

    expect(clusterPoints(points, { zoom: 8, cellSizePx: 8 }).length).toBeGreaterThan(
      clusterPoints(points, { zoom: 8, cellSizePx: 512 }).length,
    )
  })

  it('devuelve los grupos grandes primero, de forma estable', () => {
    const points = [
      point('a', 19.4326, -99.1332),
      point('b', 19.4327, -99.1333),
      point('lejos', 4.711, -74.0721),
    ]

    const primera = clusterPoints(points, { zoom: 5 })
    const segunda = clusterPoints(points, { zoom: 5 })

    expect(primera[0]?.count).toBe(2)
    expect(primera.map((cluster) => cluster.id)).toEqual(segunda.map((cluster) => cluster.id))
  })

  it('devuelve lista vacia sin puntos', () => {
    expect(clusterPoints([], { zoom: 5 })).toEqual([])
  })
})

describe('isDegenerate', () => {
  it('reconoce un grupo cuyos miembros estan todos en el mismo sitio', () => {
    const [cluster] = clusterPoints([point('a', 10, 20), point('b', 10, 20)], { zoom: 5 })
    expect(cluster && isDegenerate(cluster)).toBe(true)
  })

  it('un grupo con extension no es degenerado', () => {
    const [cluster] = clusterPoints([point('a', 10, 20), point('b', 10.001, 20.001)], { zoom: 5 })
    expect(cluster && isDegenerate(cluster)).toBe(false)
  })
})
