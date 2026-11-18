import 'server-only'

import https from 'node:https'
import { pool } from './db'

export type GeoPoint = { latitude: number; longitude: number }
export type RouteEstimate = { distanceKm: number; durationMinutes: number; geometry: [number, number][] | null }

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OSRM = 'https://router.project-osrm.org/route/v1/driving'
const TOMTOM_SEARCH = 'https://api.tomtom.com/search/2/geocode'
const TOMTOM_ROUTE = 'https://api.tomtom.com/routing/1/calculateRoute'
const USER_AGENT = 'LazyHand/1.0 (delivery routing; contact support@lazyhand.app)'

/** Server-only TomTom key. Never expose this through a NEXT_PUBLIC_ variable. */
function tomtomKey() {
  return process.env.TOMTOM_API_KEY?.trim() || ''
}

const geocodeCache = new Map<string, { value: GeoPoint | null; expiresAt: number }>()
const routeCache = new Map<string, { value: RouteEstimate | null; expiresAt: number }>()

export function parsePoint(latitude: unknown, longitude: unknown): GeoPoint | null {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { latitude: lat, longitude: lon }
}

/**
 * OSRM is reached with an IPv4-pinned request: this host resolves the demo
 * router over IPv6 first and Node's fetch stalls there, and the public server
 * rejects Node's default User-Agent.
 */
function httpsJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      family: 4,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      timeout: 8000,
    }, response => {
      const status = response.statusCode ?? 0
      if (status < 200 || status >= 300) {
        response.resume()
        reject(new Error(`HTTP ${status}`))
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
        if (body.length > 2_000_000) request.destroy(new Error('response too large'))
      })
      response.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { reject(new Error('invalid JSON')) }
      })
    })
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', reject)
  })
}

// Nominatim asks for at most one request per second. Serialize calls from this process.
let geocodeChain: Promise<unknown> = Promise.resolve()
let lastGeocodeAt = 0

export async function geocode(query: string): Promise<GeoPoint | null> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return null

  const cached = geocodeCache.get(normalized)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const run = async (): Promise<GeoPoint | null> => {
    const wait = 1100 - (Date.now() - lastGeocodeAt)
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    lastGeocodeAt = Date.now()
    try {
      const key = tomtomKey()
      if (key) {
        try {
          const searchUrl = `${TOMTOM_SEARCH}/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&countrySet=IN&limit=1&language=en-GB`
          const search = await httpsJson(searchUrl) as { results?: Array<{ position?: { lat?: number; lon?: number } }> }
          const position = search.results?.[0]?.position
          const point = parsePoint(position?.lat, position?.lon)
          if (point) {
            geocodeCache.set(normalized, { value: point, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
            return point
          }
        } catch (error) {
          console.error('[geo] TomTom geocode failed; trying Nominatim', error instanceof Error ? error.message : error)
        }
      }

      const url = `${NOMINATIM}?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
      })
      if (!response.ok) return null
      const results = await response.json() as Array<{ lat?: string; lon?: string }>
      const point = results[0] ? parsePoint(results[0].lat, results[0].lon) : null
      geocodeCache.set(normalized, { value: point, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
      return point
    } catch (error) {
      console.error('[geo] geocode failed', error instanceof Error ? error.message : error)
      geocodeCache.set(normalized, { value: null, expiresAt: Date.now() + 10 * 60 * 1000 })
      return null
    }
  }

  const result = geocodeChain.then(run, run)
  geocodeChain = result.catch(() => null)
  return result
}

type TomTomRouteResponse = {
  routes?: Array<{
    summary?: { lengthInMeters?: number; travelTimeInSeconds?: number }
    legs?: Array<{ points?: Array<{ latitude?: number; longitude?: number }> }>
  }>
}

async function tomtomRoute(from: GeoPoint, to: GeoPoint, wantGeometry: boolean): Promise<RouteEstimate | null> {
  const key = tomtomKey()
  if (!key) return null
  const locations = `${from.latitude},${from.longitude}:${to.latitude},${to.longitude}`
  const url = `${TOMTOM_ROUTE}/${locations}/json?key=${encodeURIComponent(key)}&traffic=false&routeType=fastest&computeTravelTimeFor=all&routeRepresentation=polyline`
  const body = await httpsJson(url) as TomTomRouteResponse
  const first = body.routes?.[0]
  const length = first?.summary?.lengthInMeters
  const seconds = first?.summary?.travelTimeInSeconds
  if (typeof length !== 'number' || typeof seconds !== 'number') return null
  const geometry = wantGeometry
    ? (first?.legs ?? [])
        .flatMap(leg => leg.points ?? [])
        .map(point => [Number(point.longitude), Number(point.latitude)] as [number, number])
        .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    : null
  return {
    distanceKm: Math.round((length / 1000) * 100) / 100,
    durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
    geometry: geometry && geometry.length ? geometry : null,
  }
}

async function osrmRoute(from: GeoPoint, to: GeoPoint, wantGeometry: boolean): Promise<RouteEstimate | null> {
  const url = `${OSRM}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=${wantGeometry ? 'full' : 'false'}&geometries=geojson&steps=false`
  const body = await httpsJson(url) as {
    code?: string
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }>
  }
  const first = body.routes?.[0]
  if (body.code !== 'Ok' || !first || typeof first.distance !== 'number' || typeof first.duration !== 'number') return null
  return {
    distanceKm: Math.round((first.distance / 1000) * 100) / 100,
    durationMinutes: Math.max(1, Math.ceil(first.duration / 60)),
    geometry: wantGeometry ? first.geometry?.coordinates ?? null : null,
  }
}

/** Road route via TomTom, with public OSRM as a no-crash fallback. */
export async function route(from: GeoPoint, to: GeoPoint, options: { geometry?: boolean } = {}): Promise<RouteEstimate | null> {
  const wantGeometry = Boolean(options.geometry)
  const key = `${from.latitude.toFixed(5)},${from.longitude.toFixed(5)};${to.latitude.toFixed(5)},${to.longitude.toFixed(5)};${wantGeometry ? 1 : 0}`
  const cached = routeCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  try {
    let estimate: RouteEstimate | null = null
    try {
      estimate = await tomtomRoute(from, to, wantGeometry)
    } catch (error) {
      console.error('[geo] TomTom route failed; trying OSRM', error instanceof Error ? error.message : error)
    }
    if (!estimate) estimate = await osrmRoute(from, to, wantGeometry)
    if (!estimate) throw new Error('no route')
    routeCache.set(key, { value: estimate, expiresAt: Date.now() + 60 * 1000 })
    return estimate
  } catch (error) {
    console.error('[geo] route failed', error instanceof Error ? error.message : error)
    routeCache.set(key, { value: null, expiresAt: Date.now() + 30 * 1000 })
    return null
  }
}

type ShopRow = {
  id: string
  shop_name: string
  village: string
  latitude: number | null
  longitude: number | null
}

/** Resolves a shop's saved coordinates, geocoding its village once and caching it. */
export async function resolveShopPoint(shop: ShopRow): Promise<GeoPoint | null> {
  const saved = parsePoint(shop.latitude, shop.longitude)
  if (saved) return saved

  const queries = [
    [shop.shop_name, shop.village].filter(Boolean).join(', ') + ', India',
    [shop.village, 'India'].filter(Boolean).join(', '),
  ].filter(query => query.replace(/,/g, '').trim().length > 2)

  for (const query of queries) {
    const point = await geocode(query)
    if (point) {
      await pool.query('UPDATE profiles SET latitude = $2, longitude = $3, updated_at = now() WHERE id = $1', [shop.id, point.latitude, point.longitude])
      return point
    }
  }
  return null
}

function approximateKm(a: GeoPoint, b: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Uses the device pin when it agrees with the written address. A pin far from
 * the geocoded address is ignored so a tampered client cannot shrink the fee.
 */
export async function resolveDeliveryPoint(address: string, latitude?: unknown, longitude?: unknown): Promise<GeoPoint | null> {
  const provided = parsePoint(latitude, longitude)
  const geocoded = await geocode(`${address}, India`)
  if (provided && geocoded) return approximateKm(provided, geocoded) > 3 ? geocoded : provided
  return provided ?? geocoded
}
