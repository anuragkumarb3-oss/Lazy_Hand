import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, number } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin

  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.phone, p.vehicle, p.is_suspended,
              (SELECT max(l.updated_at) FROM order_locations l WHERE l.rider_id = p.id) AS last_ping,
              (SELECT count(*) FROM orders o WHERE o.rider_id = p.id AND o.status = 'delivered') AS deliveries,
              (SELECT COALESCE(sum(o.rider_payout), 0) FROM orders o WHERE o.rider_id = p.id AND o.status = 'delivered') AS earnings,
              a.id AS active_order_id, a.status AS active_status, a.customer_name, a.address,
              a.total AS active_total, a.placed_at AS active_placed_at
       FROM profiles p
       LEFT JOIN LATERAL (
         SELECT o.id, o.status, o.customer_name, o.address, o.total, o.placed_at
         FROM orders o WHERE o.rider_id = p.id AND o.status IN ('ready', 'picked')
         ORDER BY o.placed_at DESC LIMIT 1
       ) a ON TRUE
       WHERE p.role = 'rider'
       ORDER BY (a.id IS NOT NULL) DESC, p.name`,
    )

    const now = Date.now()
    return NextResponse.json({
      riders: rows.map(row => {
        const ageSeconds = row.last_ping ? Math.max(0, Math.round((now - new Date(row.last_ping).getTime()) / 1000)) : null
        return {
          id: row.id,
          name: row.name || 'Rider',
          phone: row.phone,
          vehicle: row.vehicle || null,
          suspended: row.is_suspended,
          deliveries: number(row.deliveries),
          earnings: number(row.earnings),
          lastPing: row.last_ping,
          ageSeconds,
          online: ageSeconds != null && ageSeconds <= 90,
          activeOrder: row.active_order_id
            ? {
                id: row.active_order_id,
                status: row.active_status,
                customerName: row.customer_name,
                address: row.address,
                total: number(row.active_total),
                placedAt: row.active_placed_at,
              }
            : null,
        }
      }),
      generatedAt: new Date().toISOString(),
    }, { headers: adminHeaders })
  } catch (error) {
    console.error('[admin/riders] Query failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Riders could not be loaded.' }, { status: 500, headers: adminHeaders })
  }
}
