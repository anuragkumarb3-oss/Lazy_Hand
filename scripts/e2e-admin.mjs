/**
 * Admin console test: creates real rows, then checks that every dashboard
 * figure matches a direct SQL count and that management actions persist and
 * are audited.
 *
 * Usage: DATABASE_URL=postgresql://appuser@... node scripts/e2e-admin.mjs [baseUrl]
 */

import crypto from 'node:crypto'
import { Pool } from 'pg'

const base = (process.argv[2] ?? 'http://127.0.0.1:3001').replace(/\/+$/, '')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const suffix = String(Date.now()).slice(-5)
const ADMIN_PHONE = '9798077838'
const testPhones = {
  customer: `93300${suffix}`,
  seller: `94400${suffix}`,
  rider: `95500${suffix}`,
}
const ids = {}
const orderIds = {
  active: `LH${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
  delivered: `LH${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
  cancelled: `LH${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
}
let steps = 0
let productId

function ok(label, extra = '') {
  steps += 1
  console.log(`ok ${steps} - ${label}${extra ? ` (${extra})` : ''}`)
}
function fail(message) { throw new Error(message) }
function assert(condition, message) { if (!condition) fail(message) }

function agent() {
  let cookie = ''
  return async (path, init = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { origin: base, ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
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
async function session(phone, name) {
  const call = agent()
  const result = await json(await call('/api/preview/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name }),
  }))
  return { call, id: result.id, admin: result.admin }
}

const start = new Date()
const cleanup = async () => {
  try {
    await pool.query('DELETE FROM whatsapp_messages WHERE recipient = ANY($1::text[])', [Object.values(testPhones).map(phone => `+91${phone}`)])
    await pool.query('DELETE FROM order_events WHERE order_id = ANY($1::text[])', [Object.values(orderIds)])
    await pool.query('DELETE FROM order_locations WHERE order_id = ANY($1::text[])', [Object.values(orderIds)])
    await pool.query('DELETE FROM orders WHERE id = ANY($1::text[])', [Object.values(orderIds)])
    await pool.query('DELETE FROM checkout_idempotency WHERE user_id = $1', [ids.customer])
    if (productId) await pool.query('DELETE FROM catalog_products WHERE id = $1', [productId])
    await pool.query('DELETE FROM seller_applications WHERE user_id = ANY($1::uuid[])', [[ids.customer, ids.seller, ids.rider].filter(Boolean)])
    await pool.query('DELETE FROM admins WHERE phone = ANY($1::text[])', [[testPhones.customer]])
    await pool.query('DELETE FROM audit_log WHERE created_at >= $1 AND (actor_phone = $2 OR target = ANY($3::text[]))', [start.toISOString(), ADMIN_PHONE, [ids.customer, ids.seller, ids.rider, productId, ...Object.values(orderIds)].filter(Boolean)])
    await pool.query('DELETE FROM profiles WHERE id = ANY($1::uuid[])', [[ids.customer, ids.seller, ids.rider].filter(Boolean)])
  } catch (error) {
    console.error('cleanup warning:', error.message)
  }
}

try {
  // ---------------------------------------------------------------- fixtures
  const customer = await session(testPhones.customer, 'AdminTest Customer')
  const seller = await session(testPhones.seller, 'AdminTest Shop')
  const rider = await session(testPhones.rider, 'AdminTest Rider')
  ids.customer = customer.id; ids.seller = seller.id; ids.rider = rider.id

  await pool.query(`UPDATE profiles SET role='shopkeeper', shop_name='AdminTest Store', shop_type='grocery', whatsapp_number=$2, whatsapp_alerts_enabled=TRUE WHERE id=$1`, [ids.seller, testPhones.seller])
  await pool.query(`UPDATE profiles SET role='rider', vehicle='Bike' WHERE id=$1`, [ids.rider])
  const { rows: productRows } = await pool.query(
    `INSERT INTO catalog_products (owner_id, category_id, product_type, name, unit, price, stock, low_stock_threshold)
     VALUES ($1, (SELECT id FROM catalog_categories LIMIT 1), 'retail', 'AdminTest Apples', '500 g', 90, 3, 5) RETURNING id`,
    [ids.seller],
  )
  productId = productRows[0].id
  ok('fixtures created', `${ids.customer.slice(0, 8)}… / ${productId.slice(0, 8)}…`)

  const checkout = crypto.randomUUID()
  await pool.query('INSERT INTO checkout_idempotency (idempotency_key, user_id, checkout_id) VALUES ($1, $2, $3)', [crypto.randomUUID(), ids.customer, checkout])
  const insertOrder = async (id, status, totals, extra = {}) => {
    await pool.query(
      `INSERT INTO orders (id, checkout_id, user_id, shop_id, lines, item_total, delivery_fee, platform_fee,
         delivery_distance_km, rider_payout, seller_payout, total, customer_name, address, status, rider_id, rider_name,
         placed_at, delivered_at, cancelled_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 20, 5, 3.2, $7, $8, $9, 'AdminTest Customer', '12 Test Lane', $10, $11, $12, now(), $13, $14)`,
      [id, checkout, ids.customer, ids.seller,
        JSON.stringify([{ name: 'AdminTest Apples', qty: 2, price: 50 }]),
        totals.item, totals.rider, totals.seller, totals.total, status,
        extra.riderId ?? null, extra.riderId ? 'AdminTest Rider' : null, extra.deliveredAt ?? null, extra.cancelledAt ?? null],
    )
  }
  await insertOrder(orderIds.active, 'ready', { item: 100, rider: 20, seller: 80, total: 125 }, { riderId: ids.rider })
  await insertOrder(orderIds.delivered, 'delivered', { item: 200, rider: 20, seller: 180, total: 245 }, { riderId: ids.rider, deliveredAt: new Date() })
  await insertOrder(orderIds.cancelled, 'cancelled', { item: 80, rider: 0, seller: 80, total: 105 }, { cancelledAt: new Date() })
  await pool.query(`INSERT INTO order_locations (order_id, rider_id, latitude, longitude) VALUES ($1, $2, 19.07, 72.87)`, [orderIds.active, ids.rider])
  await pool.query(`INSERT INTO order_events (order_id, actor_user_id, actor_role, from_status, to_status) VALUES ($1,$2,'shopkeeper','placed','accepted'), ($1,$2,'shopkeeper','accepted','ready')`, [orderIds.active, ids.seller])
  await pool.query(`INSERT INTO whatsapp_messages (order_id, recipient, kind, body, status, error) VALUES ($1,$2,'order_placed','test message','failed','bridge offline')`, [orderIds.active, `+91${testPhones.seller}`])
  await pool.query(`INSERT INTO seller_applications (user_id, status) VALUES ($1, 'pending')`, [ids.customer])
  ok('orders, GPS, events, WhatsApp and seller request seeded')

  const admin = await session(ADMIN_PHONE, 'LazyHand Admin')
  assert(admin.admin, 'admin phone did not get an admin session')

  // ----------------------------------------------------------- authorization
  assert((await fetch(`${base}/api/admin/overview`)).status === 401, 'overview without a session should be 401')
  assert((await customer.call('/api/admin/overview')).status === 403, 'non-admin should get 403')
  ok('admin API rejects anonymous (401) and non-admin (403) callers')

  // -------------------------------------------------------------- overview
  const overview = await json(await admin.call('/api/admin/overview'))
  const one = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0].value)
  const expected = {
    ordersToday: await one(`SELECT count(*) AS value FROM orders WHERE (placed_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`),
    gmvToday: await one(`SELECT COALESCE(sum(total),0) AS value FROM orders WHERE (placed_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date AND status <> 'cancelled'`),
    activeOrders: await one(`SELECT count(*) AS value FROM orders WHERE status IN ('placed','accepted','ready','picked')`),
    deliveredToday: await one(`SELECT count(*) AS value FROM orders WHERE status='delivered' AND (delivered_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`),
    cancelledToday: await one(`SELECT count(*) AS value FROM orders WHERE status='cancelled' AND (cancelled_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`),
    customers: await one(`SELECT count(*) AS value FROM profiles WHERE role='customer'`),
    shops: await one(`SELECT count(*) AS value FROM profiles WHERE role='shopkeeper'`),
    riders: await one(`SELECT count(*) AS value FROM profiles WHERE role='rider'`),
    products: await one(`SELECT count(*) AS value FROM catalog_products`),
    lowStock: await one(`SELECT count(*) AS value FROM catalog_products WHERE stock > 0 AND stock <= low_stock_threshold`),
    outOfStock: await one(`SELECT count(*) AS value FROM catalog_products WHERE stock = 0`),
    pendingSellers: await one(`SELECT count(*) AS value FROM seller_applications WHERE status='pending'`),
    whatsappFailed: await one(`SELECT count(*) AS value FROM whatsapp_messages WHERE status='failed'`),
    ridersOnline: await one(`SELECT count(*) AS value FROM (SELECT o.rider_id, max(l.updated_at) AS last_ping FROM orders o LEFT JOIN order_locations l ON l.order_id=o.id WHERE o.status IN ('ready','picked') AND o.rider_id IS NOT NULL GROUP BY o.rider_id) per_rider WHERE last_ping >= now() - interval '90 seconds'`),
    stalePings: await one(`SELECT count(*) AS value FROM (SELECT o.rider_id, max(l.updated_at) AS last_ping FROM orders o LEFT JOIN order_locations l ON l.order_id=o.id WHERE o.status IN ('ready','picked') AND o.rider_id IS NOT NULL GROUP BY o.rider_id) per_rider WHERE last_ping IS NULL OR last_ping < now() - interval '75 seconds'`),
  }
  for (const [key, value] of Object.entries(expected)) {
    assert(Number(overview.kpis[key]) === value, `overview.${key}: API ${overview.kpis[key]} vs SQL ${value}`)
  }
  ok('overview KPI set matches direct SQL', `${Object.keys(expected).length} counters`)

  const statusMap = Object.fromEntries(overview.statuses.map(row => [row.status, row.count]))
  const { rows: statusRows } = await pool.query('SELECT status, count(*)::int AS count FROM orders GROUP BY status')
  for (const row of statusRows) assert(statusMap[row.status] === row.count, `status ${row.status}: API ${statusMap[row.status]} vs SQL ${row.count}`)
  assert(overview.recentOrders.some(order => order.id === orderIds.active), 'recent orders should include the active test order')
  const today = overview.series[overview.series.length - 1]
  assert(today.orders === expected.ordersToday, `today series ${today.orders} vs ${expected.ordersToday}`)
  ok('status split, 7-day series and recent orders agree with SQL')

  // ---------------------------------------------------------------- orders
  const deliveredList = await json(await admin.call('/api/admin/orders?status=delivered&limit=100'))
  assert(deliveredList.orders.some(order => order.id === orderIds.delivered), 'delivered filter should include the delivered order')
  assert(deliveredList.orders.every(order => order.status === 'delivered'), 'delivered filter leaked another status')
  const search = await json(await admin.call(`/api/admin/orders?q=${orderIds.active}`))
  assert(search.total === 1 && search.orders[0].id === orderIds.active, 'order search should match exactly one order')
  assert(search.orders[0].itemCount === 2, `item quantity total ${search.orders[0].itemCount}`)
  const activeFilter = await json(await admin.call('/api/admin/orders?status=active&limit=100'))
  assert(activeFilter.orders.some(order => order.id === orderIds.active) && !activeFilter.orders.some(order => order.id === orderIds.delivered), 'active filter is wrong')
  ok('order filters (status, active, exact search) are correct')

  const detail = await json(await admin.call(`/api/admin/orders/${orderIds.active}`))
  assert(detail.order.lines.length === 1 && detail.order.lines[0].name === 'AdminTest Apples', 'order lines missing')
  assert(detail.order.totals.total === 125, `order total ${detail.order.totals.total}`)
  assert(detail.events.length === 2 && detail.events[1].to_status === 'ready', 'event trail missing')
  assert(detail.messages.length === 1 && detail.messages[0].status === 'failed', 'WhatsApp messages missing')
  assert(detail.location && Math.abs(detail.location.latitude - 19.07) < 0.001, 'GPS location missing')
  ok('order detail returns lines, money split, events, messages and GPS')

  // ----------------------------------------------------------------- users
  const users = await json(await admin.call(`/api/admin/users?q=${testPhones.rider}`))
  const riderRow = users.users.find(user => user.id === ids.rider)
  assert(riderRow && riderRow.role === 'rider', 'rider missing from user list')
  assert(riderRow.deliveries === 1 && riderRow.riderEarnings === 20, `rider stats ${riderRow.deliveries}/${riderRow.riderEarnings}`)
  const pending = await json(await admin.call('/api/admin/users?role=customer'))
  assert(pending.users.find(user => user.id === ids.customer)?.sellerStatus === 'pending', 'pending seller badge missing')
  ok('users list shows real order, delivery and seller-request data')

  // --------------------------------------------------------- user actions
  const post = (path, body) => admin.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  await json(await post(`/api/admin/users/${ids.customer}`, { action: 'approve-seller', businessType: 'grocery' }))
  const approved = await pool.query(`SELECT p.role, p.shop_type, a.status FROM profiles p JOIN seller_applications a ON a.user_id=p.id WHERE p.id=$1`, [ids.customer])
  assert(approved.rows[0].role === 'shopkeeper' && approved.rows[0].status === 'approved', 'seller approval did not persist')
  await json(await post(`/api/admin/users/${ids.customer}`, { action: 'set-role', role: 'customer' }))
  assert((await pool.query('SELECT role FROM profiles WHERE id=$1', [ids.customer])).rows[0].role === 'customer', 'role change failed')
  await json(await post(`/api/admin/users/${ids.customer}`, { action: 'suspend' }))
  assert((await pool.query('SELECT is_suspended FROM profiles WHERE id=$1', [ids.customer])).rows[0].is_suspended === true, 'suspend failed')
  await json(await post(`/api/admin/users/${ids.customer}`, { action: 'restore' }))
  assert((await pool.query('SELECT is_suspended FROM profiles WHERE id=$1', [ids.customer])).rows[0].is_suspended === false, 'restore failed')
  await json(await post(`/api/admin/users/${ids.customer}`, { action: 'make-admin' }))
  assert((await pool.query('SELECT is_active FROM admins WHERE phone=$1', [testPhones.customer])).rows[0]?.is_active === true, 'make-admin failed')
  await json(await post(`/api/admin/users/${ids.customer}`, { action: 'revoke-admin' }))
  assert((await pool.query('SELECT is_active FROM admins WHERE phone=$1', [testPhones.customer])).rows[0]?.is_active === false, 'revoke-admin failed')
  const { rows: auditRows } = await pool.query(`SELECT action FROM audit_log WHERE actor_phone=$1 AND target=$2 ORDER BY id`, [ADMIN_PHONE, ids.customer])
  const auditActions = auditRows.map(row => row.action)
  for (const action of ['seller.approve', 'user.role', 'user.suspend', 'user.restore', 'admin.grant', 'admin.revoke']) {
    assert(auditActions.includes(action), `audit log missing ${action}`)
  }
  ok('seller approval, role change, suspend, admin grant/revoke persist and are audited', `${auditActions.length} entries`)

  // --------------------------------------------------------------- riders
  const riders = await json(await admin.call('/api/admin/riders'))
  const riderCard = riders.riders.find(item => item.id === ids.rider)
  assert(riderCard && riderCard.online === true, 'rider should be online from the fresh ping')
  assert(riderCard.activeOrder?.id === orderIds.active, 'rider active trip missing')
  assert(riderCard.earnings === 20, `rider earnings ${riderCard.earnings}`)
  ok('rider list shows live GPS, active trip and earnings')

  // -------------------------------------------------------------- catalog
  const catalog = await json(await admin.call('/api/admin/catalog?stock=low'))
  assert(catalog.products.some(item => item.id === productId), 'low-stock product missing')
  assert(catalog.summary.lowStock >= 1, 'low stock summary is wrong')
  await json(await post('/api/admin/catalog', { id: productId, action: 'set-stock', stock: 40 }))
  assert((await pool.query('SELECT stock FROM catalog_products WHERE id=$1', [productId])).rows[0].stock === 40, 'stock update failed')
  await json(await post('/api/admin/catalog', { id: productId, action: 'toggle-availability', available: false }))
  assert((await pool.query('SELECT is_available FROM catalog_products WHERE id=$1', [productId])).rows[0].is_available === false, 'availability toggle failed')
  await json(await post('/api/admin/catalog', { id: productId, action: 'delete' }))
  assert((await pool.query('SELECT 1 FROM catalog_products WHERE id=$1', [productId])).rowCount === 0, 'product delete failed')
  productId = null
  ok('catalog stock update, visibility toggle and delete persist')

  // ----------------------------------------------------------------- logs
  const auditLogs = await json(await admin.call('/api/admin/logs?type=audit&limit=200'))
  assert(auditLogs.logs.some(log => log.action === 'seller.approve'), 'audit log endpoint missing actions')
  const eventLogs = await json(await admin.call(`/api/admin/logs?type=orders&q=${orderIds.active}`))
  assert(eventLogs.logs.length === 2, `order event log count ${eventLogs.logs.length}`)
  const waLogs = await json(await admin.call('/api/admin/logs?type=whatsapp&status=failed'))
  assert(waLogs.logs.some(log => log.recipient === `+91${testPhones.seller}`), 'WhatsApp failed log missing')
  ok('all three log feeds return the rows written by this test')

  await json(await post(`/api/admin/orders/${orderIds.active}`, { action: 'cancel', reason: 'admin test' }))
  const cancelled = await pool.query(`SELECT status, cancelled_at FROM orders WHERE id=$1`, [orderIds.active])
  assert(cancelled.rows[0].status === 'cancelled' && cancelled.rows[0].cancelled_at, 'admin cancel did not persist')
  const cancelEvent = await pool.query(`SELECT actor_role, to_status, note FROM order_events WHERE order_id=$1 ORDER BY id DESC LIMIT 1`, [orderIds.active])
  assert(cancelEvent.rows[0].actor_role === 'admin' && cancelEvent.rows[0].to_status === 'cancelled', 'cancel event missing')
  assert((await post(`/api/admin/orders/${orderIds.active}`, { action: 'cancel' })).status === 409, 'second cancel should be rejected')
  const cancelAudit = await pool.query(`SELECT 1 FROM audit_log WHERE action='order.cancel' AND target=$1`, [orderIds.active])
  assert(cancelAudit.rowCount === 1, 'cancel was not audited')
  ok('admin cancellation persists, records an admin event and is audited')

  const overviewAfter = await json(await admin.call('/api/admin/overview'))
  assert(Number(overviewAfter.kpis.products) === await one(`SELECT count(*) AS value FROM catalog_products`), 'overview products did not follow the delete')
  ok('overview reflects catalog changes immediately')

  console.log(`\nPASS ${steps} admin checks`)
} catch (error) {
  console.error(`\nFAIL after ${steps} checks: ${error.message}`)
  process.exitCode = 1
} finally {
  await cleanup()
  await pool.end()
}
