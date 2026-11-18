import { NextResponse } from 'next/server'
import { currentUser, isAdminUser } from '@/lib/authz'
import { pool } from '@/lib/db'
import { notifyCustomerOrderStatus } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

type RiderOrderRow = {
  id: string
  shop_id: string
  shop_name: string
  shop_village: string | null
  shop_phone: string | null
  status: string
  address: string
  customer_name: string
  customer_phone: string | null
  total: number | string
  rider_payout: number | string
  rider_name: string | null
  placed_at: string
  pickup_latitude: number | null
  pickup_longitude: number | null
  drop_latitude: number | null
  drop_longitude: number | null
  route_distance_km: number | string | null
  route_duration_minutes: number | null
}

async function currentRider() {
  const user = await currentUser()
  if (!user) return null
  const { rows } = await pool.query<{ role: string; name: string }>('SELECT role, name FROM profiles WHERE id = $1', [user.id])
  if (rows[0]?.role === 'rider') return { ...user, name: rows[0].name }
  // The owner/admin account can also run the rider dashboard.
  return (await isAdminUser(user)) ? { ...user, name: rows[0]?.name || 'Owner rider' } : null
}

function toOrder(row: RiderOrderRow) {
  return {
    id: row.id,
    shopId: row.shop_id,
    shopName: row.shop_name,
    shopVillage: row.shop_village ?? '',
    shopPhone: row.shop_phone ?? '',
    status: row.status,
    address: row.address,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? '',
    total: Number(row.total),
    riderPayout: Number(row.rider_payout),
    riderName: row.rider_name ?? undefined,
    placedAt: row.placed_at,
    pickup: row.pickup_latitude != null && row.pickup_longitude != null
      ? { latitude: Number(row.pickup_latitude), longitude: Number(row.pickup_longitude) } : null,
    drop: row.drop_latitude != null && row.drop_longitude != null
      ? { latitude: Number(row.drop_latitude), longitude: Number(row.drop_longitude) } : null,
    routeDistanceKm: row.route_distance_km == null ? null : Number(row.route_distance_km),
    routeDurationMinutes: row.route_duration_minutes ?? null,
  }
}

export async function GET() {
  const rider = await currentRider()
  if (!rider) return NextResponse.json({ error: 'Rider access required.' }, { status: 403, headers })

  const { rows } = await pool.query<RiderOrderRow>(
    `SELECT o.id, o.shop_id, COALESCE(p.shop_name, 'Shop') AS shop_name, p.village AS shop_village,
            p.phone AS shop_phone, o.status, o.address, o.customer_name, c.phone AS customer_phone,
            o.total, o.rider_payout, o.rider_name, o.placed_at,
            o.pickup_latitude, o.pickup_longitude, o.drop_latitude, o.drop_longitude,
            o.route_distance_km, o.route_duration_minutes
     FROM orders o
     LEFT JOIN profiles p ON p.id = o.shop_id
     LEFT JOIN profiles c ON c.id = o.user_id
     WHERE (o.rider_id = $1 AND o.status IN ('ready', 'picked', 'delivered'))
        OR (o.rider_id IS NULL AND o.status IN ('accepted', 'ready'))
     ORDER BY o.placed_at DESC LIMIT 50`,
    [rider.id],
  )
  return NextResponse.json({ orders: rows.map(toOrder) }, { headers })
}

const ACTION_STATUS: Record<string, string> = { pickup: 'picked', deliver: 'delivered' }

export async function POST(request: Request) {
  const rider = await currentRider()
  if (!rider) return NextResponse.json({ error: 'Rider access required.' }, { status: 403, headers })

  let body: { orderId?: unknown; action?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers }) }
  const orderId = typeof body.orderId === 'string' ? body.orderId : ''
  const action = typeof body.action === 'string' ? body.action : ''
  if (!orderId || !['claim', 'pickup', 'deliver'].includes(action)) {
    return NextResponse.json({ error: 'Invalid rider action.' }, { status: 400, headers })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: current } = await client.query<{ status: string; rider_id: string | null }>(
      'SELECT status, rider_id FROM orders WHERE id = $1 FOR UPDATE', [orderId],
    )
    if (!current[0]) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })
    }
    const fromStatus = current[0].status
    let nextStatus = fromStatus
    let result

    if (action === 'claim') {
      if (current[0].rider_id) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Another rider already took this trip.' }, { status: 409, headers })
      }
      if (!['accepted', 'ready'].includes(fromStatus)) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This order is not ready for pickup yet.' }, { status: 409, headers })
      }
      result = await client.query(
        `UPDATE orders SET rider_id = $1, rider_name = $2, assigned_at = now(), updated_at = now()
         WHERE id = $3 AND rider_id IS NULL RETURNING status`,
        [rider.id, rider.name || 'Rider', orderId],
      )
    } else {
      if (current[0].rider_id !== rider.id) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This trip is assigned to another rider.' }, { status: 403, headers })
      }
      const expected = action === 'pickup' ? 'ready' : 'picked'
      if (fromStatus !== expected) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `Order must be ${expected} before this action.` }, { status: 409, headers })
      }
      nextStatus = ACTION_STATUS[action]
      result = await client.query(
        `UPDATE orders SET status = $1, updated_at = now()
         ${action === 'pickup' ? ', picked_up_at = now()' : ''}
         ${action === 'deliver' ? ', delivered_at = now()' : ''}
         WHERE id = $2 RETURNING status`,
        [nextStatus, orderId],
      )
    }

    if (!result.rows[0]) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'This trip could not be updated.' }, { status: 409, headers })
    }

    await client.query(
      `INSERT INTO order_events (order_id, actor_user_id, actor_role, from_status, to_status, note)
       VALUES ($1, $2, 'rider', $3, $4, $5)`,
      [orderId, rider.id, fromStatus, nextStatus, action],
    )
    await client.query('COMMIT')

    if (action === 'deliver') void notifyCustomerOrderStatus({ orderId, userId: await orderCustomerId(orderId), status: 'delivered' })
    return NextResponse.json({ order: { id: orderId, status: nextStatus } }, { headers })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'The trip could not be updated.' }, { status: 500, headers })
  } finally {
    client.release()
  }
}

async function orderCustomerId(orderId: string) {
  const { rows } = await pool.query<{ user_id: string }>('SELECT user_id FROM orders WHERE id = $1', [orderId])
  return rows[0]?.user_id ?? ''
}
