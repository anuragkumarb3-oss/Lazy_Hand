import { NextResponse } from 'next/server'
import { currentUser, isAdminUser } from '@/lib/authz'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }
const STALE_AFTER_SECONDS = 75

type ActiveRow = {
  id: string
  status: string
  customer_name: string
  address: string
  total: number | string
  rider_id: string | null
  rider_name: string | null
  rider_phone: string | null
  shop_name: string | null
  latitude: number | null
  longitude: number | null
  updated_at: string | null
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers })
  if (!(await isAdminUser(user))) return NextResponse.json({ error: 'Admin access required.' }, { status: 403, headers })

  const { rows } = await pool.query<ActiveRow>(
    `SELECT o.id, o.status, o.customer_name, o.address, o.total, o.rider_id, o.rider_name,
            r.phone AS rider_phone, s.shop_name,
            l.latitude, l.longitude, l.updated_at
     FROM orders o
     LEFT JOIN profiles s ON s.id = o.shop_id
     LEFT JOIN profiles r ON r.id = o.rider_id
     LEFT JOIN order_locations l ON l.order_id = o.id
     WHERE o.status IN ('accepted', 'ready', 'picked')
     ORDER BY o.placed_at DESC
     LIMIT 100`,
  )

  const orders = rows.map(row => {
    const ageSeconds = row.updated_at ? Math.max(0, Math.round((Date.now() - new Date(row.updated_at).getTime()) / 1000)) : null
    return {
      id: row.id,
      status: row.status,
      customerName: row.customer_name,
      address: row.address,
      total: Number(row.total),
      riderId: row.rider_id,
      riderName: row.rider_name,
      riderPhone: row.rider_phone,
      shopName: row.shop_name ?? '',
      location: row.latitude != null && row.longitude != null
        ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
        : null,
      updatedAt: row.updated_at,
      ageSeconds,
      stale: ageSeconds == null ? true : ageSeconds > STALE_AFTER_SECONDS,
    }
  })

  return NextResponse.json({
    orders,
    riders: orders.filter(order => order.riderId).length,
    active: orders.length,
    stale: orders.filter(order => order.riderId && order.stale).length,
  }, { headers })
}
