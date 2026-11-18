import { NextResponse } from 'next/server'
import { currentUser, isAdminUser } from '@/lib/authz'
import { pool } from '@/lib/db'
import { notifyCustomerOrderStatus } from '@/lib/whatsapp'
import { isSameOriginRequest as sameOrigin } from '@/lib/same-origin'

export const dynamic = 'force-dynamic'

async function currentSeller() {
  const user = await currentUser()
  if (!user) return null
  const { rows } = await pool.query<{ role: string }>('SELECT role FROM profiles WHERE id = $1', [user.id])
  if (rows[0]?.role === 'shopkeeper') return user
  // The owner/admin account can operate any dashboard, not only its saved role.
  return (await isAdminUser(user)) ? user : null
}

export async function GET() {
  const seller = await currentSeller()
  if (!seller) return NextResponse.json({ error: 'Seller access required.' }, { status: 403 })

  const [{ rows: products }, { rows: categories }, { rows: orders }] = await Promise.all([
    pool.query(`SELECT id, category_id, product_type, name, description, unit, price, stock,
      images, variants, is_vegetarian, is_available, addons, low_stock_threshold, created_at, updated_at
      FROM catalog_products WHERE owner_id = $1 ORDER BY created_at DESC`, [seller.id]),
    pool.query(`SELECT id, name, scope, parent_id, business_types FROM catalog_categories
      WHERE is_active = TRUE AND is_visible = TRUE ORDER BY display_order, name`),
    pool.query(`SELECT o.id, o.checkout_id, o.lines, o.item_total, o.delivery_fee, o.platform_fee,
      o.seller_delivery_deduction, o.seller_commission, o.seller_payout, o.total, o.payment, o.status,
      o.customer_name, o.address, o.rider_name, o.placed_at,
      r.phone AS rider_phone, c.phone AS customer_phone
      FROM orders o
      LEFT JOIN profiles r ON r.id = o.rider_id
      LEFT JOIN profiles c ON c.id = o.user_id
      WHERE o.shop_id = $1 ORDER BY o.placed_at DESC LIMIT 200`, [seller.id]),
  ])

  return NextResponse.json({ products, categories, orders }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const seller = await currentSeller()
  if (!seller) return NextResponse.json({ error: 'Seller access required.' }, { status: 403 })
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })

  let body: { orderId?: unknown; status?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (typeof body.orderId !== 'string' || !/^LH[A-Z0-9]{10}$/.test(body.orderId) || !['accepted', 'ready', 'rejected'].includes(String(body.status))) {
    return NextResponse.json({ error: 'Invalid order update.' }, { status: 400 })
  }

  const allowedPrevious = body.status === 'accepted' || body.status === 'rejected' ? ['placed'] : ['accepted']
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: existing } = await client.query<{ status: string; lines: unknown[]; user_id: string }>(
      'SELECT status, lines, user_id FROM orders WHERE id = $1 AND shop_id = $2 FOR UPDATE', [body.orderId, seller.id],
    )
    if (!existing[0] || !allowedPrevious.includes(existing[0].status)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Order not found or can no longer be updated.' }, { status: 409 })
    }
    const { rows } = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND shop_id = $3 RETURNING id, status',
      [body.status, body.orderId, seller.id],
    )
    await client.query(
      `INSERT INTO order_events (order_id, actor_user_id, actor_role, from_status, to_status, note)
       VALUES ($1, $2, 'shopkeeper', $3, $4, 'seller_update')`,
      [body.orderId, seller.id, existing[0].status, body.status],
    )
    if (body.status === 'rejected') {
      for (const rawLine of existing[0].lines) {
        if (!rawLine || typeof rawLine !== 'object') continue
        const line = rawLine as { productId?: unknown; qty?: unknown }
        if (typeof line.productId === 'string' && Number.isInteger(line.qty) && Number(line.qty) > 0) {
          await client.query('UPDATE catalog_products SET stock = stock + $1, updated_at = now() WHERE id = $2 AND owner_id = $3', [line.qty, line.productId, seller.id])
        }
      }
    }
    await client.query('COMMIT')
    void notifyCustomerOrderStatus({ orderId: body.orderId, userId: String(existing[0].user_id), status: String(body.status) })
    return NextResponse.json({ order: rows[0] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'Order status could not be updated.' }, { status: 500 })
  } finally {
    client.release()
  }
}
