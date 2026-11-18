import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/authz'
import { pool } from '@/lib/db'
import { parsePoint } from '@/lib/geo'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

function optionalNumber(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers })

  const { rows: riderRows } = await pool.query<{ role: string }>('SELECT role FROM profiles WHERE id = $1', [user.id])
  if (riderRows[0]?.role !== 'rider') return NextResponse.json({ error: 'Rider access required.' }, { status: 403, headers })

  let body: { orderId?: unknown; latitude?: unknown; longitude?: unknown; accuracy?: unknown; heading?: unknown; speed?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid location.' }, { status: 400, headers }) }

  const orderId = typeof body.orderId === 'string' ? body.orderId : ''
  const point = parsePoint(body.latitude, body.longitude)
  if (!orderId || !point) return NextResponse.json({ error: 'Valid coordinates are required.' }, { status: 400, headers })

  const accuracy = optionalNumber(body.accuracy, 0, 100000)
  const heading = optionalNumber(body.heading, 0, 360)
  const speed = optionalNumber(body.speed, 0, 100)
  if (accuracy === undefined || heading === undefined || speed === undefined) {
    return NextResponse.json({ error: 'Invalid location metadata.' }, { status: 400, headers })
  }

  const { rows: orders } = await pool.query<{ rider_id: string | null; status: string }>(
    'SELECT rider_id, status FROM orders WHERE id = $1', [orderId],
  )
  const order = orders[0]
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })
  if (order.rider_id !== user.id) return NextResponse.json({ error: 'This trip is assigned to another rider.' }, { status: 403, headers })
  if (!['ready', 'picked'].includes(order.status)) {
    return NextResponse.json({ error: 'Location sharing is only active during an assigned trip.' }, { status: 409, headers })
  }

  const { rowCount } = await pool.query(
    `INSERT INTO order_locations (order_id, rider_id, latitude, longitude, accuracy_m, heading_deg, speed_mps, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (order_id) DO UPDATE SET
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       accuracy_m = EXCLUDED.accuracy_m,
       heading_deg = EXCLUDED.heading_deg,
       speed_mps = EXCLUDED.speed_mps,
       updated_at = now()
     WHERE order_locations.rider_id = EXCLUDED.rider_id`,
    [orderId, user.id, point.latitude, point.longitude, accuracy, heading, speed],
  )
  if (!rowCount) return NextResponse.json({ error: 'Location could not be saved.' }, { status: 409, headers })

  return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() }, { headers })
}
