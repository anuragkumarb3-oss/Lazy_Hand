import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, number, positiveInt } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const ROLES = new Set(['customer', 'shopkeeper', 'rider'])

export async function GET(request: Request) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const role = url.searchParams.get('role') ?? ''
  const page = positiveInt(url.searchParams.get('page'), 1, 10_000)
  const limit = positiveInt(url.searchParams.get('limit'), 25, 100)

  const where: string[] = []
  const params: unknown[] = []
  if (ROLES.has(role)) { params.push(role); where.push(`p.role = $${params.length}`) }
  if (role === 'suspended') where.push('p.is_suspended = TRUE')
  if (q) {
    params.push(`%${q}%`)
    const at = params.length
    where.push(`(p.phone ILIKE $${at} OR p.name ILIKE $${at} OR p.shop_name ILIKE $${at} OR p.village ILIKE $${at})`)
  }
  params.push(limit, (page - 1) * limit)

  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.phone, p.name, p.role, p.shop_name, p.shop_type, p.vehicle, p.village,
              p.is_suspended, p.suspended_at, p.updated_at,
              (SELECT count(*) FROM orders o WHERE o.user_id = p.id) AS orders_as_customer,
              (SELECT COALESCE(sum(o.total), 0) FROM orders o WHERE o.user_id = p.id AND o.status <> 'cancelled') AS spent,
              (SELECT count(*) FROM orders o WHERE o.shop_id = p.id) AS shop_orders,
              (SELECT count(*) FROM orders o WHERE o.shop_id = p.id AND o.status = 'delivered') AS shop_delivered,
              (SELECT count(*) FROM orders o WHERE o.rider_id = p.id AND o.status = 'delivered') AS deliveries,
              (SELECT COALESCE(sum(o.rider_payout), 0) FROM orders o WHERE o.rider_id = p.id AND o.status = 'delivered') AS rider_earnings,
              (SELECT max(l.updated_at) FROM order_locations l WHERE l.rider_id = p.id) AS last_ping,
              sa.status AS seller_status,
              EXISTS (SELECT 1 FROM admins a WHERE a.phone = p.phone AND a.is_active) AS is_admin,
              count(*) OVER() AS total_count
       FROM profiles p
       LEFT JOIN seller_applications sa ON sa.user_id = p.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY p.is_suspended DESC, p.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    const total = rows.length ? number(rows[0].total_count) : 0
    return NextResponse.json({
      users: rows.map(row => ({
        id: row.id,
        phone: row.phone,
        name: row.name,
        role: row.role,
        shopName: row.shop_name || null,
        shopType: row.shop_type || null,
        vehicle: row.vehicle || null,
        village: row.village || null,
        suspended: row.is_suspended,
        suspendedAt: row.suspended_at,
        updatedAt: row.updated_at,
        ordersAsCustomer: number(row.orders_as_customer),
        spent: number(row.spent),
        shopOrders: number(row.shop_orders),
        shopDelivered: number(row.shop_delivered),
        deliveries: number(row.deliveries),
        riderEarnings: number(row.rider_earnings),
        lastPing: row.last_ping,
        sellerStatus: row.seller_status,
        isAdmin: row.is_admin,
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      generatedAt: new Date().toISOString(),
    }, { headers: adminHeaders })
  } catch (error) {
    console.error('[admin/users] Query failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Users could not be loaded.' }, { status: 500, headers: adminHeaders })
  }
}
