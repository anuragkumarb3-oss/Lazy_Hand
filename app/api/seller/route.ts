import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function currentSeller() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { rows } = await pool.query<{ role: string }>('SELECT role FROM profiles WHERE id = $1', [user.id])
  return rows[0]?.role === 'shopkeeper' ? user : null
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  try { return Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin } catch { return false }
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
    pool.query(`SELECT id, checkout_id, lines, item_total, delivery_fee, platform_fee,
      seller_delivery_deduction, seller_payout, total, payment, status, customer_name,
      address, rider_name, placed_at FROM orders WHERE shop_id = $1 ORDER BY placed_at DESC LIMIT 200`, [seller.id]),
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
    const { rows: existing } = await client.query<{ status: string; lines: unknown[] }>(
      'SELECT status, lines FROM orders WHERE id = $1 AND shop_id = $2 FOR UPDATE', [body.orderId, seller.id],
    )
    if (!existing[0] || !allowedPrevious.includes(existing[0].status)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Order not found or can no longer be updated.' }, { status: 409 })
    }
    const { rows } = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND shop_id = $3 RETURNING id, status',
      [body.status, body.orderId, seller.id],
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
    return NextResponse.json({ order: rows[0] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'Order status could not be updated.' }, { status: 500 })
  } finally {
    client.release()
  }
}
