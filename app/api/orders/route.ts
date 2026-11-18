import { NextResponse } from 'next/server'
import { billFor, DELIVERY_SLABS, type Order, type OrderLine } from '@/components/lazyhand/data'
import { currentUser } from '@/lib/authz'
import { pool } from '@/lib/db'
import { resolveDeliveryPoint, resolveShopPoint, route, type GeoPoint } from '@/lib/geo'
import { isSameOriginRequest } from '@/lib/same-origin'
import { notifySellersOrderPlaced } from '@/lib/whatsapp'
import { upiConfigured } from '@/lib/upi'

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
  seller_commission: number | string
  seller_payout: number | string
  total: number | string
  payment: 'cod' | 'upi'
  status: Order['status']
  customer_name: string
  address: string
  rider_name: string | null
  placed_at: string
}

const orderColumns = `id, checkout_id, shop_id, lines, item_total, delivery_fee,
  platform_fee, delivery_distance_km, rider_payout, seller_delivery_deduction,
  seller_commission, seller_payout, total, payment, status, customer_name, address, rider_name, placed_at`

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
    sellerCommission: Number(row.seller_commission),
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

export async function GET() {
  const user = await currentUser()
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
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in before placing an order.' }, { status: 401 })
  const quoteOnly = new URL(request.url).searchParams.get('quote') === '1'
  const idempotencyKey = request.headers.get('Idempotency-Key') ?? ''
  if (!quoteOnly && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return NextResponse.json({ error: 'A valid checkout request key is required.' }, { status: 400 })
  }

  let body: { stores?: unknown; address?: unknown; deliveryDistanceKm?: unknown; deliveryLatitude?: unknown; deliveryLongitude?: unknown; payment?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'The order details are invalid.' }, { status: 400 }) }

  let payment: 'cod' | 'upi' = 'cod'
  if (body.payment !== undefined) {
    if (body.payment === 'cod' || body.payment === 'upi') payment = body.payment
    else return NextResponse.json({ error: 'Choose a valid payment method.' }, { status: 400 })
  }

  const address = typeof body.address === 'string' ? body.address.trim() : ''
  if (address.length < 3 || address.length > 500) return NextResponse.json({ error: 'Add a valid delivery address.' }, { status: 400 })
  if (!Array.isArray(body.stores) || !body.stores.length || body.stores.length > 10) return NextResponse.json({ error: 'Add items from at least one available store.' }, { status: 400 })

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

  const allowUnverified = process.env.ALLOW_UNVERIFIED_DISTANCE === '1'
  const { rows: shopRows } = await pool.query<{
    id: string; shop_name: string; village: string; latitude: number | null; longitude: number | null
  }>(
    'SELECT id, shop_name, village, latitude, longitude FROM profiles WHERE id = ANY($1::uuid[])',
    [[...storeIds]],
  )
  const shopsById = new Map(shopRows.map(shop => [shop.id, shop]))
  const dropPoint = await resolveDeliveryPoint(address, body.deliveryLatitude, body.deliveryLongitude)

  const pickupByShop = new Map<string, GeoPoint>()
  const distanceByShop = new Map<string, number>()
  const durationByShop = new Map<string, number>()
  for (const store of normalizedStores) {
    if (!shopsById.has(store.shopId)) {
      return NextResponse.json({ error: 'A selected store is unavailable.' }, { status: 409 })
    }
  }
  for (const shop of shopRows) {
    const pickup = await resolveShopPoint(shop)
    if (pickup) pickupByShop.set(shop.id, pickup)
    if (!pickup || !dropPoint) continue
    const estimate = await route(pickup, dropPoint)
    if (estimate) {
      distanceByShop.set(shop.id, estimate.distanceKm)
      durationByShop.set(shop.id, estimate.durationMinutes)
    }
  }

  if ([...storeIds].some(shopId => !distanceByShop.has(shopId))) {
    console.error('[orders] route missing', {
      shops: [...storeIds],
      dropPoint: dropPoint ? `${dropPoint.latitude},${dropPoint.longitude}` : null,
      pickupPoints: [...pickupByShop.keys()],
      allowUnverified,
    })
  }
  if (quoteOnly) {
    const missing = [...storeIds].filter(shopId => !distanceByShop.has(shopId))
    const fallback = Number(body.deliveryDistanceKm)
    if (missing.length && (!allowUnverified || !Number.isFinite(fallback) || fallback <= 0)) {
      return NextResponse.json(
        { error: 'Delivery route distance cannot be confirmed for this address. Check the address and try again.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const distances = Object.fromEntries([...storeIds].map(shopId => [shopId, distanceByShop.get(shopId) ?? fallback]))
    if (Object.values(distances).some(distance => !Number.isFinite(distance) || distance <= 0 || !DELIVERY_SLABS.some(slab => distance <= slab.maxDistanceKm))) {
      return NextResponse.json({ error: 'The delivery route is outside the supported area.' }, { status: 400 })
    }
    return NextResponse.json({
      distances,
      distanceKm: Math.max(...Object.values(distances)),
      durationMinutes: Math.max(...[...storeIds].map(shopId => durationByShop.get(shopId) ?? 1)),
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const fallbackDistance = Number(body.deliveryDistanceKm)
  const distanceFor = (shopId: string) => distanceByShop.get(shopId) ?? fallbackDistance
  if ([...storeIds].some(shopId => !distanceByShop.has(shopId))) {
    if (!allowUnverified) {
      return NextResponse.json(
        { error: 'Delivery route distance cannot be confirmed for this address. Check the address and try again.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }
  if ([...storeIds].some(shopId => {
    const distance = distanceFor(shopId)
    return !Number.isFinite(distance) || distance <= 0 || !DELIVERY_SLABS.some(slab => distance <= slab.maxDistanceKm)
  })) {
    return NextResponse.json({ error: 'The delivery route is outside the supported area.' }, { status: 400 })
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
    const checkoutTotal = normalized.reduce((sum, group) => sum + billFor(group.itemTotal, distanceFor(group.shopId), false, { multiStore }).total, 0)
    if (payment === 'upi' && !upiConfigured()) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'UPI payments are not enabled right now. Choose cash on delivery.' }, { status: 400 })
    }
    if (payment === 'cod' && checkoutTotal > 499) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Cash-on-delivery orders are limited to ₹499. Reduce your cart or pay online.' }, { status: 400 })
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
      const distance = distanceFor(group.shopId)
      const bill = billFor(group.itemTotal, distance, false, { multiStore })
      const pickup = pickupByShop.get(group.shopId) ?? null
      const id = `LH${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
      const { rows } = await client.query<OrderRow>(
        `INSERT INTO orders (
          id, checkout_id, user_id, shop_id, lines, item_total, delivery_fee, platform_fee,
          delivery_distance_km, rider_payout, seller_delivery_deduction, seller_commission, seller_payout,
          total, payment, status, customer_name, address,
          pickup_latitude, pickup_longitude, drop_latitude, drop_longitude,
          route_distance_km, route_duration_minutes
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$23,'placed',$15,$16,$17,$18,$19,$20,$21,$22)
        RETURNING ${orderColumns}`,
        [id, checkoutId, user.id, group.shopId, JSON.stringify(group.lines), bill.itemTotal,
          bill.deliveryFee, bill.platformFee, bill.deliveryDistanceKm, bill.riderPayout,
          bill.sellerDeliveryDeduction, bill.sellerCommission, bill.sellerPayout, bill.total,
          profileRows[0].name, address,
          pickup?.latitude ?? null, pickup?.longitude ?? null,
          dropPoint?.latitude ?? null, dropPoint?.longitude ?? null,
          distanceByShop.get(group.shopId) ?? null, durationByShop.get(group.shopId) ?? null,
          payment],
      )
      await client.query(
        `INSERT INTO order_payments (order_id, method, amount, status, provider_reference)
         VALUES ($1, $2, $3, 'pending', $4)`,
        [id, payment, bill.total, payment === 'upi' ? id : null],
      )
      inserted.push(rows[0])
    }
    await client.query('COMMIT')
    void notifySellersOrderPlaced(inserted)
    return NextResponse.json({ orders: inserted.map(toOrder) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'Your order could not be saved. Please try again.' }, { status: 500 })
  } finally {
    client.release()
  }
}
