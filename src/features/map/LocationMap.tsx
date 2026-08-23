import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'

/**
 * Mapa de revision sobre OpenStreetMap (spec seccion 16).
 *
 * Se usan iconos SVG en linea (`divIcon`) en lugar de los PNG por defecto de
 * Leaflet: evita el problema clasico de rutas de assets con bundlers y permite
 * distinguir por color el punto elegido de los candidatos.
 */

export interface MapPoint {
  readonly id: string
  readonly latitude: number
  readonly longitude: number
  readonly label: string
  readonly selected: boolean
}

const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function pinIcon(selected: boolean): L.DivIcon {
  const fill = selected ? 'var(--color-accent, #2563eb)' : 'var(--color-warn, #b45309)'
  return L.divIcon({
    className: '',
    html: `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"
        fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="12" cy="12" r="4.5" fill="white"/>
    </svg>`,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
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
  readonly onPickPoint?: (latitude: number, longitude: number) => void
  readonly onSelectPoint?: (id: string) => void
}

export function LocationMap({
  points,
  center,
  zoom = 15,
  onPickPoint,
  onSelectPoint,
}: LocationMapProps) {
  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={zoom}
      scrollWheelZoom
      className="border-border-subtle h-80 w-full rounded-md border"
      // Leaflet necesita que el contenedor tenga altura antes de montarse.
      style={{ minHeight: '20rem' }}
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
      <Recenter latitude={center.latitude} longitude={center.longitude} />
      {onPickPoint ? <ClickHandler onPick={onPickPoint} /> : null}

      {points.map((point) => (
        <Marker
          key={point.id}
          position={[point.latitude, point.longitude]}
          icon={pinIcon(point.selected)}
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
        />
      ))}
    </MapContainer>
  )
}
