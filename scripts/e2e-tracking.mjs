/**
 * Live-tracking end-to-end checks against a running preview server.
 * Usage: DATABASE_URL=... node scripts/e2e-tracking.mjs [baseUrl]
 */

import crypto from 'node:crypto'
import { Pool } from 'pg'

const base = (process.argv[2] ?? 'http://localhost:3001').replace(/\/+$/, '')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const suffix = String(Date.now()).slice(-5)
const phones = {
  customer: `93000${suffix}`,
  seller: `94100${suffix}`,
  rider: `95200${suffix}`,
  rider2: `95300${suffix}`,
  other: `95400${suffix}`,
}
const ids = {}
let checks = 0
const ok = (label, extra = '') => { checks += 1; console.log(`ok ${checks} - ${label}${extra ? ` (${extra})` : ''}`) }
const assert = (condition, message) => { if (!condition) throw new Error(message) }

function agent() {
  let cookie = ''
  return async (path, init = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        origin: base,
        ...(cookie ? { cookie } : {}),
        ...(init.headers ?? {}),
      },
    })
    for (const header of response.headers.getSetCookie?.() ?? []) {
      const pair = header.split(';')[0]
      if (pair.startsWith('lh_preview_session=')) cookie = pair
    }
    return response
  }
}

async function json(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${response.status}: ${body?.error ?? 'request failed'}`)
  return body
}

async function session(who) {
  const call = agent()
  const result = await json(await call('/api/preview/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phones[who], name: `Track ${who}` }),
  }))
  ids[who] = result.id
  ok(`${who} session`)
  return call
}

const cleanup = async () => {
  try {
    for (const orderId of [ids.order, ids.cancelledOrder].filter(Boolean)) {
      await pool.query('DELETE FROM order_events WHERE order_id = $1', [orderId])
      await pool.query('DELETE FROM whatsapp_messages WHERE order_id = $1', [orderId])
      await pool.query('DELETE FROM order_locations WHERE order_id = $1', [orderId])
      await pool.query('DELETE FROM orders WHERE id = $1', [orderId])
    }
    if (ids.product) await pool.query('DELETE FROM catalog_products WHERE id = $1', [ids.product])
    await pool.query('DELETE FROM profiles WHERE id = ANY($1::uuid[])', [[ids.customer, ids.seller, ids.rider, ids.rider2, ids.other].filter(Boolean)])
  } catch (error) {
    console.error('cleanup warning:', error.message)
  }
}

try {
  const customer = await session('customer')
  const seller = await session('seller')
  const rider = await session('rider')
  const rider2 = await session('rider2')
  const other = await session('other')

  await pool.query("UPDATE profiles SET role = 'shopkeeper', shop_name = 'Track Test Shop', shop_type = 'grocery', village = 'Connaught Place, New Delhi', latitude = 28.6315, longitude = 77.2194 WHERE id = $1", [ids.seller])
  await pool.query("UPDATE profiles SET role = 'rider', name = 'Track Rider', phone = $2 WHERE id = $1", [ids.rider, phones.rider])
  await pool.query("UPDATE profiles SET role = 'rider', name = 'Other Rider', phone = $2 WHERE id = $1", [ids.rider2, phones.rider2])
  ok('roles and shop coordinates set')

  const { rows: categoryRows } = await pool.query("SELECT id FROM catalog_categories WHERE name = 'Groceries' AND scope = 'general' LIMIT 1")
  const { rows: productRows } = await pool.query(
    `INSERT INTO catalog_products (owner_id, category_id, product_type, name, unit, price, stock)
     VALUES ($1, $2, 'retail', 'Track Apples', '1 kg', 90, 10) RETURNING id`,
    [ids.seller, categoryRows[0].id],
  )
  ids.product = productRows[0].id
  ok('product created')

  const placed = await json(await customer('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      address: 'Connaught Place, New Delhi',
      deliveryLatitude: 28.6139,
      deliveryLongitude: 77.209,
      stores: [{ shopId: ids.seller, lines: [{ productId: ids.product, qty: 1 }] }],
    }),
  }))
  ids.order = placed.orders?.[0]?.id
  assert(ids.order, 'order was not created')
  ok('order created with verified route', ids.order)

  const { rows: orderRows } = await pool.query(
    'SELECT route_distance_km, route_duration_minutes, pickup_latitude, drop_latitude FROM orders WHERE id = $1', [ids.order],
  )
  const routeKm = Number(orderRows[0]?.route_distance_km)
  assert(Number.isFinite(routeKm) && routeKm > 1, `expected a routed distance, got ${orderRows[0]?.route_distance_km}`)
  assert(orderRows[0].pickup_latitude != null && orderRows[0].drop_latitude != null, 'missing pickup/drop coordinates')
  ok('route distance and coordinates stored', `${routeKm} km, ${orderRows[0].route_duration_minutes} min`)

  await json(await seller('/api/seller', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, status: 'accepted' }),
  }))
  await json(await seller('/api/seller', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, status: 'ready' }),
  }))
  ok('seller accepted and packed')

  let tracking = await json(await customer(`/api/orders/${ids.order}/tracking`))
  assert(tracking.order.pickup && tracking.order.drop, 'tracking is missing coordinates')
  assert(tracking.tracking.location === null, 'no location should exist before the rider pings')
  assert(Array.isArray(tracking.tracking.route) && tracking.tracking.route.length > 5, 'planned route geometry missing')
  assert(Number.isFinite(tracking.tracking.etaMinutes), 'planned ETA missing')
  ok('customer sees planned route and ETA before pickup')

  const blocked = await customer(`/api/orders/${ids.order}/tracking`)
  assert(blocked.status === 200, 'customer tracking should be allowed')

  const stranger = await other(`/api/orders/${ids.order}/tracking`)
  assert(stranger.status === 404, `unrelated user should not see tracking, got ${stranger.status}`)
  ok('unrelated account blocked from tracking (404)')

  const claim = await rider('/api/rider', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, action: 'claim' }),
  })
  assert(claim.ok, 'rider could not claim')
  ok('rider claimed the trip')

  const customerPing = await customer('/api/rider/location', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, latitude: 28.62, longitude: 77.21 }),
  })
  assert(customerPing.status === 403, `customer location update must be forbidden, got ${customerPing.status}`)
  ok('non-rider cannot post rider location')

  const wrongRiderPing = await rider2('/api/rider/location', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, latitude: 28.62, longitude: 77.21 }),
  })
  assert(wrongRiderPing.status === 403, `unassigned rider must be forbidden, got ${wrongRiderPing.status}`)
  ok('unassigned rider cannot post location')

  const ping = await json(await rider('/api/rider/location', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, latitude: 28.625, longitude: 77.215, accuracy: 12, heading: 90, speed: 6 }),
  }))
  assert(ping.ok, 'assigned rider location was rejected')
  ok('assigned rider location accepted')

  tracking = await json(await customer(`/api/orders/${ids.order}/tracking`))
  assert(tracking.tracking.location?.latitude === 28.625, 'customer does not see rider location')
  assert(tracking.tracking.stale === false, 'fresh location marked stale')
  assert(tracking.order.rider?.phone === null || typeof tracking.order.rider?.phone === 'string', 'rider contact shape invalid')
  assert(Number.isFinite(tracking.tracking.etaMinutes), 'ETA to pickup missing')
  assert(tracking.tracking.etaTarget === 'pickup', `expected pickup ETA, got ${tracking.tracking.etaTarget}`)
  ok('customer sees rider position + pickup ETA')

  await pool.query("UPDATE order_locations SET updated_at = now() - interval '5 minutes' WHERE order_id = $1", [ids.order])
  tracking = await json(await customer(`/api/orders/${ids.order}/tracking`))
  assert(tracking.tracking.stale === true, 'old location must be stale')
  assert(tracking.tracking.ageSeconds >= 299, `ageSeconds too small: ${tracking.tracking.ageSeconds}`)
  ok('stale location flagged with age')
  await pool.query('UPDATE order_locations SET updated_at = now() WHERE order_id = $1', [ids.order])

  await json(await rider('/api/rider', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, action: 'pickup' }),
  }))
  ok('rider marked picked up')

  const sellerView = await json(await seller(`/api/orders/${ids.order}/tracking`))
  assert(sellerView.tracking.location === null, 'seller must not see rider location after pickup')
  ok('seller loses live rider location after pickup')

  const riderView = await json(await rider(`/api/orders/${ids.order}/tracking`))
  assert(typeof riderView.tracking.customerPhone === 'string' && riderView.tracking.customerPhone.length > 0, 'rider needs the customer phone')
  assert(riderView.tracking.etaTarget === 'drop', 'rider ETA should target the customer')
  ok('rider sees customer contact and delivery ETA')

  await json(await rider('/api/rider', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, action: 'deliver' }),
  }))
  ok('rider marked delivered')

  const afterPing = await rider('/api/rider/location', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, latitude: 28.626, longitude: 77.216 }),
  })
  assert(afterPing.status === 409, `location after delivery must stop, got ${afterPing.status}`)
  ok('location sharing stops after delivery')

  const finalTracking = await json(await customer(`/api/orders/${ids.order}/tracking`))
  assert(finalTracking.tracking.active === false, 'delivered order must be closed')
  assert(finalTracking.tracking.location === null, 'delivered order must not expose location')
  ok('tracking closed after delivery')

  const { rows: events } = await pool.query('SELECT actor_role, to_status FROM order_events WHERE order_id = $1 ORDER BY id', [ids.order])
  assert(events.length >= 5, `expected 5 order events, got ${events.length}`)
  ok('event trail intact', events.map(event => `${event.actor_role}:${event.to_status}`).join(' -> '))

  ids.cancelledOrder = `LH${crypto.randomBytes(5).toString('hex').toUpperCase()}`
  await pool.query(
    `INSERT INTO orders (id, checkout_id, user_id, shop_id, lines, item_total, delivery_fee, platform_fee,
       delivery_distance_km, rider_payout, seller_payout, total, customer_name, address, status, rider_id, rider_name,
       placed_at, cancelled_at)
     SELECT $1, checkout_id, user_id, shop_id, lines, item_total, delivery_fee, platform_fee,
       delivery_distance_km, rider_payout, seller_payout, total, customer_name, address, 'cancelled', rider_id, rider_name,
       placed_at, now()
     FROM orders WHERE id = $2`,
    [ids.cancelledOrder, ids.order],
  )
  const cancelledTracking = await json(await customer(`/api/orders/${ids.cancelledOrder}/tracking`))
  assert(cancelledTracking.order.status === 'cancelled', 'cancelled order status missing')
  assert(cancelledTracking.tracking.active === false, 'cancelled order must close tracking')
  assert(cancelledTracking.tracking.location === null, 'cancelled order must not expose rider location')
  const cancelledPing = await rider('/api/rider/location', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.cancelledOrder, latitude: 28.626, longitude: 77.216 }),
  })
  assert(cancelledPing.status === 409, `location sharing after cancellation must stop, got ${cancelledPing.status}`)
  const riderTrips = await json(await rider('/api/rider'))
  assert(!riderTrips.orders.some(order => order.id === ids.cancelledOrder), 'cancelled trip must leave the rider queue')
  ok('cancelled order closes tracking, rejects GPS and leaves rider queue')

  console.log(`\nPASS ${checks} tracking checks`)
} catch (error) {
  console.error(`\nFAIL after ${checks} checks: ${error.message}`)
  process.exitCode = 1
} finally {
  await cleanup()
  await pool.end()
}
