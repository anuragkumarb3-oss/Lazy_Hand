'use client'

import { useEffect, useRef } from 'react'
import { LocateFixed } from 'lucide-react'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export type TrackingMarker = {
  id: string
  latitude: number
  longitude: number
  label: string
  color: string
}

type Props = {
  markers: TrackingMarker[]
  route?: [number, number][] | null
  height?: number
  fitKey?: string
  className?: string
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'

export function TrackingMap({ markers, route, height = 300, fitKey, className }: Props) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, MapLibreMarker>>(new Map())
  const readyRef = useRef(false)

  const recenter = () => {
    const map = mapRef.current
    if (!map || !markers.length) return
    if (markers.length === 1) {
      map.easeTo({ center: [markers[0].longitude, markers[0].latitude], zoom: 15, duration: 400 })
      return
    }
    const lons = markers.map(marker => marker.longitude)
    const lats = markers.map(marker => marker.latitude)
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 48, maxZoom: 15, duration: 500 },
    )
  }

  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null

    void (async () => {
      const maplibregl = await import('maplibre-gl')
      if (cancelled || !container.current) return
      const instance = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: markers[0] ? [markers[0].longitude, markers[0].latitude] : [78.9629, 20.5937],
        zoom: markers.length ? 13 : 4,
        attributionControl: { compact: true },
      })
      map = instance
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      mapRef.current = instance
      instance.on('load', () => {
        instance.addSource('lazyhand-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } })
        instance.addLayer({
          id: 'lazyhand-route-line',
          type: 'line',
          source: 'lazyhand-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#B45309', 'line-width': 4, 'line-opacity': 0.85 },
        })
        readyRef.current = true
      })
    })()

    return () => {
      cancelled = true
      readyRef.current = false
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current.clear()
      map?.remove()
      mapRef.current = null
    }
    // The map instance lives for the component lifetime; prop updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const maplibregl = await import('maplibre-gl')
      if (cancelled || !mapRef.current) return
      const map = mapRef.current
      const seen = new Set<string>()

      for (const item of markers) {
        seen.add(item.id)
        const existing = markersRef.current.get(item.id)
        if (existing) {
          existing.setLngLat([item.longitude, item.latitude])
          continue
        }
        const element = document.createElement('div')
        element.title = item.label
        element.setAttribute('aria-label', item.label)
        element.style.cssText = `width:20px;height:20px;border-radius:9999px;border:3px solid #fff;background:${item.color};box-shadow:0 2px 6px rgba(0,0,0,.35)`
        markersRef.current.set(item.id, new maplibregl.Marker({ element }).setLngLat([item.longitude, item.latitude]).addTo(map))
      }

      for (const [id, marker] of markersRef.current) {
        if (!seen.has(id)) {
          marker.remove()
          markersRef.current.delete(id)
        }
      }

      const drawRoute = () => {
        const source = map.getSource('lazyhand-route') as { setData?: (data: unknown) => void } | undefined
        source?.setData?.({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: route ?? [] },
        })
      }
      // The route can arrive before the style has finished loading. Queue it on
      // load instead of dropping it, otherwise the rider sees pins but no line.
      if (map.isStyleLoaded() && map.getSource('lazyhand-route')) drawRoute()
      else map.once('load', drawRoute)
    })()
    return () => { cancelled = true }
  }, [markers, route])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !markers.length) return
    const key = fitKey ?? markers.map(marker => marker.id).join(',')
    if (!key) return

    const fit = () => {
      if (markers.length === 1) {
        map.easeTo({ center: [markers[0].longitude, markers[0].latitude], zoom: 13, duration: 400 })
        return
      }
      const lons = markers.map(marker => marker.longitude)
      const lats = markers.map(marker => marker.latitude)
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 48, maxZoom: 15, duration: 500 },
      )
    }

    if (map.isStyleLoaded()) fit()
    else map.once('load', fit)
  }, [fitKey, markers])

  return (
    <div className="relative">
      <div ref={container} className={className ?? 'w-full overflow-hidden rounded-2xl border border-line'} style={{ height }} aria-label="Delivery map" />
      <button
        type="button"
        onClick={recenter}
        aria-label="Recenter map on the delivery"
        className="absolute bottom-9 right-3 z-10 grid size-9 place-items-center rounded-full border border-line bg-white text-ink shadow-md transition active:scale-95"
      >
        <LocateFixed className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
