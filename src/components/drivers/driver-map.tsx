import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { LatLngBounds } from 'leaflet'
import { useTheme } from 'next-themes'
import 'leaflet/dist/leaflet.css'
import type { DriverMapMarker } from '@/lib/api/drivers'
import { DRIVER_STATUS } from '@/lib/driver-status'

// Polokwane, Limpopo — the depot region — as a sensible default view.
const DEFAULT_CENTER: [number, number] = [-23.9045, 29.4689]

function FitBounds({ markers }: { markers: DriverMapMarker[] }) {
  const map = useMap()
  useEffect(() => {
    if (markers.length === 0) return
    const bounds = new LatLngBounds(markers.map((m) => [m.latitude, m.longitude]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers.length])
  return null
}

function PanToSelected({ markers, selectedId }: { markers: DriverMapMarker[]; selectedId: string | null }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedId) return
    const m = markers.find((x) => x.driverId === selectedId)
    if (m) map.flyTo([m.latitude, m.longitude], Math.max(map.getZoom(), 13), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])
  return null
}

export function DriverMap({
  markers,
  selectedId,
  onSelect,
}: {
  markers: DriverMapMarker[]
  selectedId: string | null
  onSelect: (driverId: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={7}
      scrollWheelZoom
      // `isolate` gives the map its own stacking context so Leaflet's high
      // internal z-indexes (panes/controls up to 1000) stay contained and
      // don't paint over app chrome like the sticky header.
      className="size-full isolate"
      style={{ background: 'var(--muted)' }}
    >
      <TileLayer
        key={dark ? 'dark' : 'light'}
        url={tileUrl}
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <FitBounds markers={markers} />
      <PanToSelected markers={markers} selectedId={selectedId} />
      {markers.map((m) => {
        const meta = DRIVER_STATUS[m.status]
        const selected = m.driverId === selectedId
        return (
          <CircleMarker
            key={m.driverId}
            center={[m.latitude, m.longitude]}
            radius={selected ? 11 : 8}
            pathOptions={{
              color: '#ffffff',
              weight: selected ? 3 : 2,
              fillColor: meta.color,
              fillOpacity: 0.95,
            }}
            eventHandlers={{ click: () => onSelect(m.driverId) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="font-medium">{m.driverName}</span> · {meta.label}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
