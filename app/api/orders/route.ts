import { NextResponse } from 'next/server'
import { billFor, DELIVERY_SLABS, type Order, type OrderLine } from '@/components/lazyhand/data'
import { pool } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

type OrderRow = {
  id: string
  checkout_id: string
  shop_id: string
  lines: OrderLine[]
  item_total: number | string
  delivery_fee: number | string
  platform_fee: number | string
  delivery_distance_km: number | string
  rider_payout: number | string
  seller_delivery_deduction: number | string
  seller_payout: number | string
  total: number | string
  payment: 'cod'
  status: Order['status']
  customer_name: string
  address: string
  rider_name: string | null
  placed_at: string
}

const orderColumns = `id, checkout_id, shop_id, lines, item_total, delivery_fee,
  platform_fee, delivery_distance_km, rider_payout, seller_delivery_deduction,
  seller_payout, total, payment, status, customer_name, address, rider_name, placed_at`

function toOrder(row: OrderRow): Order {
  const placedDate = new Date(row.placed_at)
  const isToday = placedDate.toDateString() === new Date().toDateString()
  return {
    id: row.id,
    shopId: row.shop_id,
    lines: row.lines,
    itemTotal: Number(row.item_total),
    deliveryFee: Number(row.delivery_fee),
    platformFee: Number(row.platform_fee),
    deliveryDistanceKm: Number(row.delivery_distance_km),
    riderPayout: Number(row.rider_payout),
    sellerDeliveryDeduction: Number(row.seller_delivery_deduction),
    sellerPayout: Number(row.seller_payout),
    total: Number(row.total),
    multiStoreSurcharge: Math.max(0, Number(row.total) - Number(row.item_total) - Number(row.delivery_fee) - Number(row.platform_fee)),
    payment: row.payment,
    status: row.status,
    placedAt: isToday ? 'Today' : placedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    customerName: row.customer_name,
    address: row.address,
    riderName: row.rider_name ?? undefined,
  }
}

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error ? null : user
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

async function getVerifiedDeliveryDistanceKm(_stores: unknown, _address: string): Promise<number | null> {
  return null
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view your orders.' }, { status: 401 })

  const { rows } = await pool.query<OrderRow>(
    `SELECT ${orderColumns} FROM orders WHERE user_id = $1 ORDER BY placed_at DESC`,
    [user.id],
  )
  return NextResponse.json({ orders: rows.map(toOrder) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin order requests are not allowed.' }, { status: 403 })
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Sign in before placing an order.' }, { status: 401 })
  const idempotencyKey = request.headers.get('Idempotency-Key') ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return NextResponse.json({ error: 'A valid checkout request key is required.' }, { status: 400 })
  }

  let body: { stores?: unknown; address?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'The order details are invalid.' }, { status: 400 }) }

  const address = typeof body.address === 'string' ? body.address.trim() : ''
  if (address.length < 3 || address.length > 500) return NextResponse.json({ error: 'Add a valid delivery address.' }, { status: 400 })
  if (!Array.isArray(body.stores) || !body.stores.length || body.stores.length > 10) return NextResponse.json({ error: 'Add items from at least one available store.' }, { status: 400 })

  const deliveryDistanceKm = await getVerifiedDeliveryDistanceKm(body.stores, address)
  if (deliveryDistanceKm === null) {
    return NextResponse.json(
      { error: 'Delivery route distance cannot be confirmed yet. Checkout is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  if (!Number.isFinite(deliveryDistanceKm) || deliveryDistanceKm < 0 || !DELIVERY_SLABS.some(slab => deliveryDistanceKm <= slab.maxDistanceKm)) {
    return NextResponse.json({ error: 'The delivery route is outside the supported area.' }, { status: 400 })
  }

  const normalizedStores: { shopId: string; quantities: Map<string, number> }[] = []
  const storeIds = new Set<string>()
  for (const rawStore of body.stores) {
    if (!rawStore || typeof rawStore !== 'object') return NextResponse.json({ error: 'The store selection is invalid.' }, { status: 400 })
    const store = rawStore as { shopId?: unknown; lines?: unknown }
    const shopId = typeof store.shopId === 'string' ? store.shopId : ''
    if (!/^[0-9a-f-]{36}$/i.test(shopId) || storeIds.has(shopId)) return NextResponse.json({ error: 'A selected store is unavailable or duplicated.' }, { status: 409 })
    storeIds.add(shopId)
    if (!Array.isArray(store.lines) || store.lines.length === 0 || store.lines.length > 100) return NextResponse.json({ error: 'Add at least one available item per store.' }, { status: 400 })
    const quantities = new Map<string, number>()
    for (const rawLine of store.lines) {
      if (!rawLine || typeof rawLine !== 'object') return NextResponse.json({ error: 'The order items are invalid.' }, { status: 400 })
      const line = rawLine as { productId?: unknown; qty?: unknown }
      if (typeof line.productId !== 'string' || !/^[0-9a-f-]{36}$/i.test(line.productId) || typeof line.qty !== 'number' || !Number.isInteger(line.qty) || line.qty <= 0) return NextResponse.json({ error: 'The order items are invalid.' }, { status: 400 })
      const nextQty = (quantities.get(line.productId) ?? 0) + line.qty
      if (nextQty > 20) return NextResponse.json({ error: 'The quantity limit is 20 per item.' }, { status: 400 })
      quantities.set(line.productId, nextQty)
    }
    normalizedStores.push({ shopId, quantities })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const checkoutId = crypto.randomUUID()
    const claim = await client.query(
      `INSERT INTO checkout_idempotency(idempotency_key, user_id, checkout_id)
       VALUES ($1,$2,$3) ON CONFLICT (idempotency_key) DO NOTHING RETURNING checkout_id`,
      [idempotencyKey, user.id, checkoutId],
    )
    if (!claim.rowCount) {
      const { rows: previousRequest } = await client.query<{ checkout_id: string }>(
        'SELECT checkout_id FROM checkout_idempotency WHERE idempotency_key=$1 AND user_id=$2 FOR SHARE',
        [idempotencyKey, user.id],
      )
      if (!previousRequest[0]) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This checkout key belongs to another request.' }, { status: 409 })
      }
      const { rows: previousOrders } = await client.query<OrderRow>(
        `SELECT ${orderColumns} FROM orders WHERE checkout_id=$1 AND user_id=$2 ORDER BY placed_at`,
        [previousRequest[0].checkout_id, user.id],
      )
      await client.query('COMMIT')
      return NextResponse.json({ orders: previousOrders.map(toOrder) }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    const { rows: profileRows } = await client.query<{ name: string; role: string }>(
      'SELECT name, role FROM profiles WHERE id = $1 FOR SHARE', [user.id],
    )
    if (!profileRows[0]) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Complete your profile before placing an order.' }, { status: 409 })
    }

    const normalized: { shopId: string; lines: OrderLine[]; itemTotal: number }[] = []
    for (const store of normalizedStores) {
      const { rows: products } = await client.query<{
        id: string; owner_id: string; name: string; price: string; stock: number; is_available: boolean
      }>(
        `SELECT id, owner_id, name, price, stock, is_available
         FROM catalog_products
         WHERE owner_id = $1 AND id = ANY($2::uuid[])
         FOR UPDATE`,
        [store.shopId, [...store.quantities.keys()]],
      )
      const byId = new Map(products.map(product => [product.id, product]))
      const lines: OrderLine[] = []
      for (const [productId, qty] of store.quantities) {
        const product = byId.get(productId)
        if (!product || !product.is_available || product.stock < qty) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'An item is unavailable. Refresh and try again.' }, { status: 409 })
        }
        lines.push({ productId, name: product.name, price: Number(product.price), qty })
      }
      normalized.push({ shopId: store.shopId, lines, itemTotal: lines.reduce((sum, line) => sum + line.price * line.qty, 0) })
    }

    const multiStore = normalized.length > 1
    const checkoutTotal = normalized.reduce((sum, group) => sum + billFor(group.itemTotal, deliveryDistanceKm, false, { multiStore }).total, 0)
    if (checkoutTotal > 499) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Cash-on-delivery orders are limited to ₹499. Reduce your cart or choose another payment method when available.' }, { status: 400 })
    }

    const inserted: OrderRow[] = []
    for (const group of normalized) {
      for (const line of group.lines) {
        const result = await client.query(
          `UPDATE catalog_products SET stock = stock - $1, updated_at = now()
           WHERE id = $2 AND owner_id = $3 AND is_available = TRUE AND stock >= $1`,
          [line.qty, line.productId, group.shopId],
        )
        if (result.rowCount !== 1) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'An item is unavailable. Refresh and try again.' }, { status: 409 })
        }
      }
      const bill = billFor(group.itemTotal, deliveryDistanceKm, false, { multiStore })
      const id = `LH${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
      const { rows } = await client.query<OrderRow>(
        `INSERT INTO orders (
          id, checkout_id, user_id, shop_id, lines, item_total, delivery_fee, platform_fee,
          delivery_distance_km, rider_payout, seller_delivery_deduction, seller_payout,
          total, payment, status, customer_name, address
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,'cod','placed',$14,$15)
        RETURNING ${orderColumns}`,
        [id, checkoutId, user.id, group.shopId, JSON.stringify(group.lines), bill.itemTotal,
          bill.deliveryFee, bill.platformFee, bill.deliveryDistanceKm, bill.riderPayout,
          bill.sellerDeliveryDeduction, bill.sellerPayout, bill.total,
          profileRows[0].name, address],
      )
      inserted.push(rows[0])
    }
    await client.query('COMMIT')
    return NextResponse.json({ orders: inserted.map(toOrder) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'Your order could not be saved. Please try again.' }, { status: 500 })
  } finally {
    client.release()
  }
}
