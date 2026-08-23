import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'

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

const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Zoom al que se acerca el mapa cuando solo hay un punto que encuadrar. */
const SINGLE_POINT_ZOOM = 16

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

/** Recentra el mapa cuando cambia el punto principal. */
function Recenter({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom())
  }, [map, latitude, longitude])
  return null
}

/**
 * Encuadra todos los puntos. Se reejecuta solo cuando cambia el conjunto, no
 * cuando cambia cual esta seleccionado: mover el mapa bajo el raton mientras
 * el usuario navega la lista resulta molesto.
 */
function FitBounds({ points }: { points: readonly MapPoint[] }) {
  const map = useMap()
  const key = points
    .map((point) => `${String(point.latitude)},${String(point.longitude)}`)
    .join('|')

  useEffect(() => {
    if (points.length === 0) return

    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]))
    if (points.length === 1) {
      map.setView(bounds.getCenter(), SINGLE_POINT_ZOOM)
    } else {
      map.fitBounds(bounds, { padding: [40, 40] })
    }
    // `key` resume el conjunto de coordenadas; `points` cambia de identidad
    // en cada render aunque su contenido sea el mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])

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
  readonly heightClass?: string
  readonly onPickPoint?: (latitude: number, longitude: number) => void
  readonly onSelectPoint?: (id: string) => void
}

export function LocationMap({
  points,
  center,
  zoom = 15,
  fitToPoints = false,
  heightClass = 'h-80',
  onPickPoint,
  onSelectPoint,
}: LocationMapProps) {
  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={zoom}
      scrollWheelZoom
      className={`border-border-subtle w-full rounded-md border ${heightClass}`}
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />

      {fitToPoints ? (
        <FitBounds points={points} />
      ) : (
        <Recenter latitude={center.latitude} longitude={center.longitude} />
      )}

      {onPickPoint ? <ClickHandler onPick={onPickPoint} /> : null}

      {points.map((point) => (
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
      ))}
    </MapContainer>
  )
}
