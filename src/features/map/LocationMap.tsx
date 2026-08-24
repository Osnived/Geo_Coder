import L from 'leaflet'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'

import { clusterPoints, isDegenerate, type Cluster } from './clustering'

/**
 * Mapa sobre OpenStreetMap (spec seccion 16).
 *
 * Se usan iconos SVG en linea (`divIcon`) en lugar de los PNG por defecto de
 * Leaflet: evita el problema clasico de rutas de assets con bundlers y permite
 * distinguir por color el punto elegido de los demas.
 */

export interface MapPoint {
  readonly id: string
  readonly latitude: number
  readonly longitude: number
  readonly label: string
  readonly selected: boolean
  /** Segunda linea del globo informativo. */
  readonly detail?: string
}

/**
 * Orden de acercarse a un punto concreto.
 *
 * `nonce` es lo que dispara el movimiento: permite volver al mismo punto dos
 * veces seguidas, cosa que no se podria si el efecto dependiera solo de las
 * coordenadas.
 */
export interface FlyTarget {
  readonly latitude: number
  readonly longitude: number
  readonly zoom?: number
  readonly nonce: number
}

const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Zoom al que se acerca el mapa cuando solo hay un punto que encuadrar. */
const SINGLE_POINT_ZOOM = 16
/** Zoom al acercarse a un registro concreto: suficiente para ver la manzana. */
const FLY_ZOOM = 17
const FLY_DURATION_S = 0.8
/** Margen sobre la duracion antes de comprobar si el vuelo llego. */
const ARRIVAL_MARGIN_MS = 300
/** Distancia por debajo de la cual se considera que ya se llego. */
const ARRIVAL_TOLERANCE_M = 5
/** Por debajo de esto el contenedor no tiene tamano util para encuadrar. */
const MIN_USABLE_PX = 50

function pinIcon(selected: boolean): L.DivIcon {
  const fill = selected ? 'var(--color-accent, #2563eb)' : 'var(--color-warn, #b45309)'
  const size: [number, number] = selected ? [30, 40] : [22, 30]

  return L.divIcon({
    className: '',
    html: `<svg width="${String(size[0])}" height="${String(size[1])}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"
        fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="12" cy="12" r="4.5" fill="white"/>
    </svg>`,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1]],
    popupAnchor: [0, -size[1]],
  })
}

/** Globo con el numero de puntos que esconde. Crece con la cantidad. */
function clusterIcon(count: number, hasSelected: boolean): L.DivIcon {
  const size = count < 10 ? 34 : count < 100 ? 42 : 52
  const fill = hasSelected ? 'var(--color-accent, #2563eb)' : 'var(--color-warn, #b45309)'

  return L.divIcon({
    className: '',
    html: `<div style="
      width:${String(size)}px;height:${String(size)}px;
      display:flex;align-items:center;justify-content:center;
      border-radius:9999px;background:${fill};color:white;
      border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);
      font-size:${String(count < 100 ? 13 : 12)}px;font-weight:600;
      font-family:system-ui,sans-serif;
    ">${String(count)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Dibuja los puntos agrupados por cercania en pantalla.
 *
 * El zoom se sigue con `zoomend` porque la agrupacion se calcula en pixeles:
 * al acercarse, los grupos se abren solos.
 */
function ClusteredMarkers({
  points,
  onSelectPoint,
}: {
  points: readonly MapPoint[]
  onSelectPoint?: ((id: string) => void) | undefined
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())

  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom())
    },
  })

  const clusters = useMemo(() => clusterPoints(points, { zoom }), [points, zoom])

  /**
   * Abre el grupo encuadrando a sus miembros.
   *
   * Sin animacion a proposito: al pinchar un grupo lo que se quiere es ver que
   * hay dentro, y la animacion de Leaflet depende de `requestAnimationFrame`,
   * que el navegador pausa si la pestana no esta pintando. Ahi el grupo no
   * llegaria a abrirse nunca.
   */
  const openCluster = (cluster: Cluster) => {
    if (isDegenerate(cluster)) {
      // Todos en el mismo sitio: acercarse no los separaria.
      map.setView([cluster.latitude, cluster.longitude], Math.min(map.getZoom() + 3, 19), {
        animate: false,
      })
      return
    }

    map.fitBounds(
      [
        [cluster.bounds.south, cluster.bounds.west],
        [cluster.bounds.north, cluster.bounds.east],
      ],
      { padding: [50, 50], animate: false },
    )
  }

  return (
    <>
      {clusters.map((cluster) => {
        const single = cluster.count === 1 ? cluster.members[0] : null

        if (single) {
          return (
            <Marker
              key={single.id}
              position={[single.latitude, single.longitude]}
              icon={pinIcon(single.selected)}
              zIndexOffset={single.selected ? 1000 : 0}
              title={single.label}
              eventHandlers={
                onSelectPoint
                  ? {
                      click: () => {
                        onSelectPoint(single.id)
                      },
                    }
                  : {}
              }
            >
              <Popup>
                <span className="block text-sm font-medium">{single.label}</span>
                {single.detail ? (
                  <span className="mt-0.5 block text-xs opacity-80">{single.detail}</span>
                ) : null}
              </Popup>
            </Marker>
          )
        }

        return (
          <Marker
            key={cluster.id}
            position={[cluster.latitude, cluster.longitude]}
            icon={clusterIcon(cluster.count, cluster.hasSelected)}
            title={`${String(cluster.count)} registros. Pincha para abrir el grupo.`}
            eventHandlers={{
              click: () => {
                openCluster(cluster)
              },
            }}
          />
        )
      })}
    </>
  )
}

/** Recentra el mapa cuando cambia el punto principal, sin tocar el zoom. */
function Recenter({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom())
  }, [map, latitude, longitude])
  return null
}

/**
 * Encuadra todos los puntos.
 *
 * Depende del conjunto de coordenadas, no de cual esta seleccionada: si
 * dependiera de la seleccion, el mapa se movería bajo el raton cada vez que el
 * usuario recorre la lista. Para acercarse a uno concreto esta `FlyTo`.
 *
 * `fitNonce` permite volver a encuadrar a peticion, tras haberse acercado.
 */
function FitBounds({ points, fitNonce }: { points: readonly MapPoint[]; fitNonce: number }) {
  const map = useMap()
  const boundsKey = points
    .map((point) => `${String(point.latitude)},${String(point.longitude)}`)
    .join('|')

  const fit = useCallback(() => {
    if (points.length === 0) return

    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]))
    if (points.length === 1) {
      map.setView(bounds.getCenter(), SINGLE_POINT_ZOOM)
    } else {
      map.fitBounds(bounds, { padding: [40, 40] })
    }
    // `boundsKey` resume el conjunto: `points` cambia de identidad en cada
    // render aunque su contenido sea el mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsKey])

  useEffect(fit, [fit, fitNonce])

  return null
}

/**
 * Mantiene a Leaflet al dia del tamano de su contenedor.
 *
 * Con altura fija esto no hacia falta, pero desde que el mapa ocupa el espacio
 * disponible su contenedor cambia con la ventana, y Leaflet no se entera solo:
 * dibuja con las medidas viejas y deja zonas grises.
 *
 * Ademas, si el mapa se monto con el contenedor sin tamano util (una pestana
 * oculta, un panel plegado), el encuadre inicial salio mal y hay que rehacerlo
 * en cuanto haya sitio de verdad. Fuera de ese caso no se toca la vista, para
 * no deshacer el zoom que haya puesto el usuario.
 */
function InvalidateOnResize({ onFirstRealSize }: { onFirstRealSize?: (() => void) | undefined }) {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    let hadRealSize =
      container.clientWidth > MIN_USABLE_PX && container.clientHeight > MIN_USABLE_PX

    const observer = new ResizeObserver(() => {
      map.invalidateSize()

      const usable = container.clientWidth > MIN_USABLE_PX && container.clientHeight > MIN_USABLE_PX
      if (usable && !hadRealSize) {
        hadRealSize = true
        onFirstRealSize?.()
      }
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [map, onFirstRealSize])

  return null
}

/**
 * Se acerca al punto indicado.
 *
 * `flyTo` anima el desplazamiento con `requestAnimationFrame`, que el
 * navegador pausa cuando la pestana no esta pintando (segundo plano, ventana
 * minimizada, algunos contenedores embebidos). En ese caso la animacion nunca
 * termina y el mapa se queda donde estaba.
 *
 * Por eso se comprueba despues: si no llego, se coloca sin animacion. La
 * animacion es un adorno; llegar al punto es el requisito.
 */
function FlyTo({ target }: { target: FlyTarget }) {
  const map = useMap()

  useEffect(() => {
    const destination = L.latLng(target.latitude, target.longitude)
    const zoom = target.zoom ?? FLY_ZOOM

    map.flyTo(destination, zoom, { duration: FLY_DURATION_S })

    const timer = setTimeout(
      () => {
        const arrived =
          map.getZoom() === zoom && map.getCenter().distanceTo(destination) < ARRIVAL_TOLERANCE_M
        if (!arrived) map.setView(destination, zoom, { animate: false })
      },
      FLY_DURATION_S * 1000 + ARRIVAL_MARGIN_MS,
    )

    return () => {
      clearTimeout(timer)
    }
    // El disparador es `nonce`: permite repetir el vuelo al mismo punto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, target.nonce])

  return null
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

export interface LocationMapProps {
  readonly points: readonly MapPoint[]
  readonly center: { latitude: number; longitude: number }
  readonly zoom?: number
  /** Encuadra automaticamente todos los puntos en lugar de centrar en uno. */
  readonly fitToPoints?: boolean
  /** Cambiar este numero fuerza un reencuadre de todos los puntos. */
  readonly fitNonce?: number
  /** Punto al que acercarse. Cada `nonce` nuevo dispara el movimiento. */
  readonly flyTo?: FlyTarget | null
  /** Agrupa los puntos cercanos en globos con su recuento. */
  readonly cluster?: boolean
  /** Ocupa el alto que le deje su contenedor en lugar de una altura fija. */
  readonly fill?: boolean
  readonly heightClass?: string
  readonly onPickPoint?: (latitude: number, longitude: number) => void
  readonly onSelectPoint?: (id: string) => void
}

export function LocationMap({
  points,
  center,
  zoom = 15,
  fitToPoints = false,
  fitNonce = 0,
  flyTo = null,
  cluster = false,
  fill = false,
  heightClass = 'h-80',
  onPickPoint,
  onSelectPoint,
}: LocationMapProps) {
  /** Fuerza un reencuadre cuando el contenedor por fin tiene tamano util. */
  const [resizeFit, setResizeFit] = useState(0)

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={zoom}
      scrollWheelZoom
      className={`border-border-subtle w-full rounded-md border ${fill ? 'min-h-0 flex-1' : heightClass}`}
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />

      <InvalidateOnResize
        onFirstRealSize={
          fitToPoints
            ? () => {
                setResizeFit((current) => current + 1)
              }
            : undefined
        }
      />

      {fitToPoints ? (
        <FitBounds points={points} fitNonce={fitNonce + resizeFit} />
      ) : (
        <Recenter latitude={center.latitude} longitude={center.longitude} />
      )}

      {flyTo ? <FlyTo target={flyTo} /> : null}

      {onPickPoint ? <ClickHandler onPick={onPickPoint} /> : null}

      {cluster ? (
        <ClusteredMarkers points={points} onSelectPoint={onSelectPoint} />
      ) : (
        points.map((point) => (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={pinIcon(point.selected)}
            // Los seleccionados se dibujan encima del resto.
            zIndexOffset={point.selected ? 1000 : 0}
            title={point.label}
            eventHandlers={
              onSelectPoint
                ? {
                    click: () => {
                      onSelectPoint(point.id)
                    },
                  }
                : {}
            }
          >
            <Popup>
              <span className="block text-sm font-medium">{point.label}</span>
              {point.detail ? (
                <span className="mt-0.5 block text-xs opacity-80">{point.detail}</span>
              ) : null}
            </Popup>
          </Marker>
        ))
      )}
    </MapContainer>
  )
}
