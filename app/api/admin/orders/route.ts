import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, number, positiveInt } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['placed', 'accepted', 'ready', 'picked', 'delivered', 'cancelled'])

export async function GET(request: Request) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  const page = positiveInt(url.searchParams.get('page'), 1, 10_000)
  const limit = positiveInt(url.searchParams.get('limit'), 25, 100)

  const where: string[] = []
  const params: unknown[] = []

  if (status === 'active') where.push(`o.status IN ('placed', 'accepted', 'ready', 'picked')`)
  else if (STATUSES.has(status)) { params.push(status); where.push(`o.status = $${params.length}`) }

  if (q) {
    params.push(`%${q}%`)
    const at = params.length
    where.push(`(o.id ILIKE $${at} OR o.customer_name ILIKE $${at} OR o.address ILIKE $${at} OR s.shop_name ILIKE $${at} OR c.phone ILIKE $${at} OR r.phone ILIKE $${at})`)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { params.push(from); where.push(`(o.placed_at AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}::date`) }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { params.push(to); where.push(`(o.placed_at AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}::date`) }

  params.push(limit, (page - 1) * limit)

  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.customer_name, o.address, o.total, o.item_total, o.delivery_fee,
              o.platform_fee, o.rider_payout, o.seller_commission, o.seller_payout, o.payment, o.placed_at, o.updated_at,
              o.delivered_at, o.cancelled_at, o.picked_up_at, o.route_distance_km,
              o.user_id, o.shop_id, o.rider_id,
              c.phone AS customer_phone, c.name AS customer_profile_name,
              s.shop_name, s.phone AS shop_phone,
              r.name AS rider_name, r.phone AS rider_phone,
              CASE WHEN jsonb_typeof(o.lines) = 'array'
                THEN (SELECT COALESCE(sum(COALESCE((line->>'qty')::int, (line->>'quantity')::int, 1)), 0) FROM jsonb_array_elements(o.lines) AS line)
                ELSE 0 END AS item_count,
              count(*) OVER() AS total_count
       FROM orders o
       LEFT JOIN profiles c ON c.id = o.user_id
       LEFT JOIN profiles s ON s.id = o.shop_id
       LEFT JOIN profiles r ON r.id = o.rider_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY o.placed_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    const total = rows.length ? number(rows[0].total_count) : 0
    return NextResponse.json({
      orders: rows.map(row => ({
        id: row.id,
        status: row.status,
        customerName: row.customer_name || row.customer_profile_name || '',
        customerPhone: row.customer_phone ?? null,
        address: row.address,
        shopName: row.shop_name ?? '',
        shopPhone: row.shop_phone ?? null,
        riderName: row.rider_name ?? null,
        riderPhone: row.rider_phone ?? null,
        riderId: row.rider_id ?? null,
        total: number(row.total),
        itemTotal: number(row.item_total),
        deliveryFee: number(row.delivery_fee),
        platformFee: number(row.platform_fee),
        riderPayout: number(row.rider_payout),
        sellerCommission: number(row.seller_commission),
        sellerPayout: number(row.seller_payout),
        payment: row.payment,
        itemCount: number(row.item_count),
        routeDistanceKm: row.route_distance_km == null ? null : number(row.route_distance_km),
        placedAt: row.placed_at,
        pickedUpAt: row.picked_up_at,
        deliveredAt: row.delivered_at,
        cancelledAt: row.cancelled_at,
        updatedAt: row.updated_at,
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      generatedAt: new Date().toISOString(),
    }, { headers: adminHeaders })
  } catch (error) {
    console.error('[admin/orders] Query failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Orders could not be loaded.' }, { status: 500, headers: adminHeaders })
  }
}
