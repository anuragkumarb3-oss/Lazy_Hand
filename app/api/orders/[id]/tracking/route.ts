import { NextResponse } from 'next/server'
import { currentUser, isAdminUser } from '@/lib/authz'
import { pool } from '@/lib/db'
import { parsePoint, route } from '@/lib/geo'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }
const STALE_AFTER_SECONDS = 75

type TrackingOrder = {
  id: string
  user_id: string
  shop_id: string
  status: string
  address: string
  customer_name: string
  rider_id: string | null
  rider_name: string | null
  rider_phone: string | null
  shop_name: string | null
  shop_phone: string | null
  customer_phone: string | null
  total: number | string
  placed_at: string
  picked_up_at: string | null
  delivered_at: string | null
  pickup_latitude: number | null
  pickup_longitude: number | null
  drop_latitude: number | null
  drop_longitude: number | null
  route_distance_km: number | string | null
  route_duration_minutes: number | null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers })

  const { id } = await params
  if (!/^LH[A-Z0-9]{10}$/.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })

  const { rows } = await pool.query<TrackingOrder>(
    `SELECT o.id, o.user_id, o.shop_id, o.status, o.address, o.customer_name,
            o.rider_id, o.rider_name, r.phone AS rider_phone,
            s.shop_name, s.phone AS shop_phone, c.phone AS customer_phone,
            o.total, o.placed_at, o.picked_up_at, o.delivered_at,
            o.pickup_latitude, o.pickup_longitude, o.drop_latitude, o.drop_longitude,
            o.route_distance_km, o.route_duration_minutes
     FROM orders o
     LEFT JOIN profiles r ON r.id = o.rider_id
     LEFT JOIN profiles s ON s.id = o.shop_id
     LEFT JOIN profiles c ON c.id = o.user_id
     WHERE o.id = $1`,
    [id],
  )
  const order = rows[0]
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })

  const isAdmin = await isAdminUser(user)
  const isCustomer = order.user_id === user.id
  const isSeller = order.shop_id === user.id
  const isRider = order.rider_id === user.id
  if (!isAdmin && !isCustomer && !isSeller && !isRider) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })
  }

  const pickup = parsePoint(order.pickup_latitude, order.pickup_longitude)
  const drop = parsePoint(order.drop_latitude, order.drop_longitude)

  let location: { latitude: number; longitude: number; accuracyM: number | null; headingDeg: number | null; speedMps: number | null; updatedAt: string } | null = null
  let ageSeconds: number | null = null
  const active = ['accepted', 'ready', 'picked'].includes(order.status)
  if (active) {
    const { rows: locations } = await pool.query<{
      latitude: number; longitude: number; accuracy_m: number | null; heading_deg: number | null; speed_mps: number | null; updated_at: string
    }>('SELECT latitude, longitude, accuracy_m, heading_deg, speed_mps, updated_at FROM order_locations WHERE order_id = $1', [id])
    if (locations[0]) {
      const updatedAt = new Date(locations[0].updated_at)
      ageSeconds = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000))
      location = {
        latitude: Number(locations[0].latitude),
        longitude: Number(locations[0].longitude),
        accuracyM: locations[0].accuracy_m == null ? null : Number(locations[0].accuracy_m),
        headingDeg: locations[0].heading_deg == null ? null : Number(locations[0].heading_deg),
        speedMps: locations[0].speed_mps == null ? null : Number(locations[0].speed_mps),
        updatedAt: updatedAt.toISOString(),
      }
    }
  }
  // Sellers only need the approaching rider before pickup. After collection they
  // see the order status, not the rider's live position.
  if (isSeller && !['accepted', 'ready'].includes(order.status)) {
    location = null
    ageSeconds = null
  }
  const stale = location ? (ageSeconds ?? 0) > STALE_AFTER_SECONDS : false

  let etaMinutes: number | null = null
  let etaTarget: 'pickup' | 'drop' | null = null
  let routeGeometry: [number, number][] | null = null
  if (active) {
    if (location) {
      const target = order.status === 'picked' ? drop : pickup
      if (target) {
        const estimate = await route({ latitude: location.latitude, longitude: location.longitude }, target, { geometry: true })
        if (estimate) {
          etaMinutes = estimate.durationMinutes
          etaTarget = order.status === 'picked' ? 'drop' : 'pickup'
          routeGeometry = estimate.geometry
        }
      }
    }
    if (!routeGeometry && pickup && drop) {
      const estimate = await route(pickup, drop, { geometry: true })
      if (estimate) {
        routeGeometry = estimate.geometry
        etaMinutes = estimate.durationMinutes
        etaTarget = 'drop'
      }
    }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      address: order.address,
      customerName: order.customer_name,
      shopName: order.shop_name ?? '',
      total: Number(order.total),
      placedAt: order.placed_at,
      pickedUpAt: order.picked_up_at,
      deliveredAt: order.delivered_at,
      routeDistanceKm: order.route_distance_km == null ? null : Number(order.route_distance_km),
      routeDurationMinutes: order.route_duration_minutes,
      pickup,
      drop,
      rider: order.rider_id ? {
        name: order.rider_name ?? 'Rider',
        phone: isRider ? null : order.rider_phone,
      } : null,
    },
    tracking: {
      active,
      location,
      stale,
      ageSeconds,
      etaMinutes,
      etaTarget,
      route: routeGeometry,
      // Contact details are scoped: the rider sees the customer, everyone else sees the rider.
      customerPhone: isRider || isAdmin ? order.customer_phone : null,
      shopPhone: isRider ? order.shop_phone : null,
      viewer: isAdmin ? 'admin' : isCustomer ? 'customer' : isSeller ? 'seller' : 'rider',
    },
  }, { headers })
}
