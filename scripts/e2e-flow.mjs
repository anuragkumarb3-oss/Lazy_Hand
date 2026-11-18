/**
 * End-to-end preview flow test: customer order -> seller accept/ready ->
 * rider claim/pickup/deliver. Requires the preview server running with
 * ALLOW_UNVERIFIED_DISTANCE=1 and a DATABASE_URL for lazyhand_app.
 *
 * Usage: DATABASE_URL=... node scripts/e2e-flow.mjs [baseUrl]
 */

import crypto from 'node:crypto'
import { Pool } from 'pg'

const base = (process.argv[2] ?? 'http://127.0.0.1:3001').replace(/\/+$/, '')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const suffix = String(Date.now()).slice(-5)
const phones = {
  customer: `90000${suffix}`,
  seller: `91100${suffix}`,
  rider: `92200${suffix}`,
}
const ids = {}

let steps = 0
function ok(label, extra = '') {
  steps += 1
  console.log(`ok ${steps} - ${label}${extra ? ` (${extra})` : ''}`)
}

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
    body: JSON.stringify({ phone: phones[who], name: `Flow ${who}` }),
  }))
  ids[who] = result.id
  ok(`${who} preview session created`, phones[who])
  return call
}

const cleanup = async () => {
  try {
    if (ids.order) {
      await pool.query('DELETE FROM order_events WHERE order_id = $1', [ids.order])
      await pool.query('DELETE FROM whatsapp_messages WHERE order_id = $1', [ids.order])
      await pool.query('DELETE FROM orders WHERE id = $1', [ids.order])
    }
    if (ids.product) await pool.query('DELETE FROM catalog_products WHERE id = $1', [ids.product])
    await pool.query('DELETE FROM profiles WHERE id = ANY($1::uuid[])', [[ids.customer, ids.seller, ids.rider].filter(Boolean)])
  } catch (error) {
    console.error('cleanup warning:', error.message)
  }
}

try {
  const customer = await session('customer')
  const seller = await session('seller')
  const rider = await session('rider')

  await pool.query("UPDATE profiles SET role = 'shopkeeper', shop_name = 'Flow Test Shop', shop_type = 'grocery' WHERE id = $1", [ids.seller])
  await pool.query("UPDATE profiles SET role = 'rider', name = 'Flow Rider' WHERE id = $1", [ids.rider])
  ok('seller and rider roles assigned')

  const { rows: categoryRows } = await pool.query("SELECT id FROM catalog_categories WHERE name = 'Groceries' AND scope = 'general' LIMIT 1")
  if (!categoryRows[0]) throw new Error('Groceries category is missing')
  const { rows: productRows } = await pool.query(
    `INSERT INTO catalog_products (owner_id, category_id, product_type, name, unit, price, stock)
     VALUES ($1, $2, 'retail', 'Flow Test Apples', '1 kg', 120, 10) RETURNING id`,
    [ids.seller, categoryRows[0].id],
  )
  ids.product = productRows[0].id
  ok('test product created')

  const quote = await json(await customer('/api/orders?quote=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: 'Flow Test Village, Main Road',
      deliveryDistanceKm: 3,
      stores: [{ shopId: ids.seller, lines: [{ productId: ids.product, qty: 2 }] }],
    }),
  }))
  if (!(Number(quote.distanceKm) > 0)) throw new Error('delivery quote did not return a distance')
  ok('delivery quote confirmed before checkout', `${quote.distanceKm} km`)

  const orderResponse = await json(await customer('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      address: 'Flow Test Village, Main Road',
      deliveryDistanceKm: 3,
      stores: [{ shopId: ids.seller, lines: [{ productId: ids.product, qty: 2 }] }],
    }),
  }))
  ids.order = orderResponse.orders?.[0]?.id
  if (!ids.order) throw new Error('order was not created')
  ok('customer placed order', ids.order)

  const { rows: pricing } = await pool.query('SELECT item_total, seller_commission, seller_payout FROM orders WHERE id = $1', [ids.order])
  const itemTotal = Number(pricing[0].item_total)
  const expectedCommission = Math.round(itemTotal * 5) / 100
  if (Number(pricing[0].seller_commission) !== expectedCommission) {
    throw new Error(`expected 5% commission ${expectedCommission}, got ${pricing[0].seller_commission}`)
  }
  if (Number(pricing[0].seller_payout) !== itemTotal - expectedCommission) {
    throw new Error(`expected seller payout ${itemTotal - expectedCommission}, got ${pricing[0].seller_payout}`)
  }
  ok('5% seller platform fee withheld', `₹${expectedCommission} of ₹${itemTotal}`)

  const accepted = await json(await seller('/api/seller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, status: 'accepted' }),
  }))
  if (accepted.order.status !== 'accepted') throw new Error('seller accept failed')
  ok('seller accepted order')

  await json(await seller('/api/seller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, status: 'ready' }),
  }))
  ok('seller marked order ready')

  const available = await json(await rider('/api/rider'))
  if (!available.orders.some(order => order.id === ids.order)) throw new Error('order not visible to rider')
  ok('order visible to rider queue')

  await json(await rider('/api/rider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, action: 'claim' }),
  }))
  ok('rider claimed trip')

  const sellerOrders = await json(await seller('/api/seller'))
  const assigned = sellerOrders.orders.find(order => order.id === ids.order)
  if (!assigned?.rider_name || assigned.rider_phone !== phones.rider) {
    throw new Error(`seller did not receive rider contact: ${assigned?.rider_name}/${assigned?.rider_phone}`)
  }
  if (Number(assigned.seller_commission) !== expectedCommission) throw new Error('seller view lost the platform fee')
  ok('seller receives rider name and phone for pickup', `${assigned.rider_name} · ${assigned.rider_phone}`)

  await json(await rider('/api/rider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, action: 'pickup' }),
  }))
  ok('rider picked up order')

  const delivered = await json(await rider('/api/rider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ids.order, action: 'deliver' }),
  }))
  if (delivered.order.status !== 'delivered') throw new Error('delivery failed')
  ok('rider delivered order')

  const customerOrders = await json(await customer('/api/orders'))
  const finalOrder = customerOrders.orders.find(order => order.id === ids.order)
  if (finalOrder?.status !== 'delivered') throw new Error('customer does not see delivered status')
  ok('customer sees delivered status')

  const { rows: events } = await pool.query('SELECT actor_role, to_status FROM order_events WHERE order_id = $1 ORDER BY id', [ids.order])
  const trail = events.map(event => `${event.actor_role}:${event.to_status}`).join(' -> ')
  if (events.length < 5) throw new Error(`expected at least 5 order events, got ${events.length}`)
  ok('order event trail recorded', trail)

  const { rows: stock } = await pool.query('SELECT stock FROM catalog_products WHERE id = $1', [ids.product])
  if (Number(stock[0].stock) !== 8) throw new Error(`expected stock 8, got ${stock[0].stock}`)
  ok('stock decremented correctly')

  console.log(`\nPASS ${steps} checks`)
} catch (error) {
  console.error(`\nFAIL after ${steps} checks: ${error.message}`)
  process.exitCode = 1
} finally {
  await cleanup()
  await pool.end()
}
