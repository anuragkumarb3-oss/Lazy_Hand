import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, number } from '@/lib/admin'

export const dynamic = 'force-dynamic'

type OrderTotals = {
  orders_today: string
  gmv_today: string
  delivered_today: string
  cancelled_today: string
  active_orders: string
  delivered_7d: string
  avg_minutes_7d: string | null
  fees_7d: string
  rider_payout_7d: string
  platform_fees_7d: string
}

export async function GET() {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin

  const [totals, counts, catalog, whatsapp, pendingSellers, stale, statuses, payments, series, recentOrders, activity] = await Promise.all([
    pool.query<OrderTotals>(
      `SELECT
         count(*) FILTER (WHERE (placed_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS orders_today,
         COALESCE(sum(total) FILTER (WHERE (placed_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date AND status <> 'cancelled'), 0) AS gmv_today,
         count(*) FILTER (WHERE status = 'delivered' AND (delivered_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS delivered_today,
         count(*) FILTER (WHERE status = 'cancelled' AND (cancelled_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS cancelled_today,
         count(*) FILTER (WHERE status IN ('placed', 'accepted', 'ready', 'picked')) AS active_orders,
         count(*) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '7 days') AS delivered_7d,
         avg(EXTRACT(EPOCH FROM (delivered_at - placed_at)) / 60) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '7 days') AS avg_minutes_7d,
         COALESCE(sum(total) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '7 days'), 0) AS fees_7d,
         COALESCE(sum(rider_payout) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '7 days'), 0) AS rider_payout_7d,
         COALESCE(sum(seller_commission) FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '7 days'), 0) AS platform_fees_7d
       FROM orders`,
    ),
    pool.query<{ customers: string; shops: string; riders: string; suspended: string }>(
      `SELECT
         count(*) FILTER (WHERE role = 'customer') AS customers,
         count(*) FILTER (WHERE role = 'shopkeeper') AS shops,
         count(*) FILTER (WHERE role = 'rider') AS riders,
         count(*) FILTER (WHERE is_suspended) AS suspended
       FROM profiles`,
    ),
    pool.query<{ products: string; low_stock: string; out_of_stock: string; unavailable: string; categories: string }>(
      `SELECT
         (SELECT count(*) FROM catalog_products) AS products,
         (SELECT count(*) FROM catalog_products WHERE stock > 0 AND stock <= low_stock_threshold) AS low_stock,
         (SELECT count(*) FROM catalog_products WHERE stock = 0) AS out_of_stock,
         (SELECT count(*) FROM catalog_products WHERE is_available = FALSE) AS unavailable,
         (SELECT count(*) FROM catalog_categories WHERE is_active) AS categories`,
    ),
    pool.query<{ queued: string; sent: string; failed: string; skipped: string }>(
      `SELECT
         count(*) FILTER (WHERE status = 'queued') AS queued,
         count(*) FILTER (WHERE status = 'sent') AS sent,
         count(*) FILTER (WHERE status = 'failed') AS failed,
         count(*) FILTER (WHERE status = 'skipped') AS skipped
       FROM whatsapp_messages`,
    ),
    pool.query<{ pending: string }>(`SELECT count(*) AS pending FROM seller_applications WHERE status = 'pending'`),
    pool.query<{ stale: string; online: string }>(
      `SELECT
         count(*) FILTER (WHERE last_ping IS NULL OR last_ping < now() - interval '75 seconds') AS stale,
         count(*) FILTER (WHERE last_ping >= now() - interval '90 seconds') AS online
       FROM (
         SELECT o.rider_id, max(l.updated_at) AS last_ping
         FROM orders o
         LEFT JOIN order_locations l ON l.order_id = o.id
         WHERE o.status IN ('ready', 'picked') AND o.rider_id IS NOT NULL
         GROUP BY o.rider_id
       ) per_rider`,
    ),
    pool.query<{ status: string; count: string; total: string }>(
      `SELECT status, count(*) AS count, COALESCE(sum(total), 0) AS total
       FROM orders GROUP BY status ORDER BY count(*) DESC`,
    ),
    pool.query<{ method: string; count: string; total: string }>(
      `SELECT payment AS method, count(*) AS count, COALESCE(sum(total), 0) AS total
       FROM orders
       WHERE status <> 'cancelled' AND placed_at > now() - interval '7 days'
       GROUP BY payment ORDER BY count(*) DESC`,
    ),
    pool.query<{ day: string; orders: string; gmv: string; delivered: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              count(o.id) AS orders,
              COALESCE(sum(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS gmv,
              count(o.id) FILTER (WHERE o.status = 'delivered') AS delivered
       FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 6, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') AS d(day)
       LEFT JOIN orders o ON (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d.day
       GROUP BY d.day ORDER BY d.day`,
    ),
    pool.query(
      `SELECT o.id, o.status, o.customer_name, o.total, o.payment, o.placed_at,
              s.shop_name, r.name AS rider_name, o.rider_id
       FROM orders o
       LEFT JOIN profiles s ON s.id = o.shop_id
       LEFT JOIN profiles r ON r.id = o.rider_id
       ORDER BY o.placed_at DESC LIMIT 8`,
    ),
    pool.query(
      `SELECT * FROM (
         SELECT 'audit'::text AS kind, a.id::text AS ref, a.action AS title,
                COALESCE(a.actor_phone, 'system') AS actor, a.target AS subject, a.created_at
         FROM audit_log a
         UNION ALL
         SELECT 'order'::text, e.id::text, 'Order ' || e.order_id || ' → ' || COALESCE(e.to_status, 'event'),
                e.actor_role, e.order_id, e.created_at
         FROM order_events e
         UNION ALL
         SELECT 'whatsapp'::text, w.id::text, w.kind || ' · ' || w.status,
                w.recipient, w.order_id, w.created_at
         FROM whatsapp_messages w
       ) feed ORDER BY created_at DESC LIMIT 15`,
    ),
  ])

  const t = totals.rows[0]
  const c = counts.rows[0]
  const cat = catalog.rows[0]

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Kolkata',
    kpis: {
      ordersToday: number(t.orders_today),
      gmvToday: number(t.gmv_today),
      deliveredToday: number(t.delivered_today),
      cancelledToday: number(t.cancelled_today),
      activeOrders: number(t.active_orders),
      delivered7d: number(t.delivered_7d),
      avgDeliveryMinutes: t.avg_minutes_7d == null ? null : Math.round(number(t.avg_minutes_7d)),
      gmv7d: number(t.fees_7d),
      riderPayout7d: number(t.rider_payout_7d),
      platformFees7d: number(t.platform_fees_7d),
      customers: number(c.customers),
      shops: number(c.shops),
      riders: number(c.riders),
      suspended: number(c.suspended),
      products: number(cat.products),
      lowStock: number(cat.low_stock),
      outOfStock: number(cat.out_of_stock),
      unavailableProducts: number(cat.unavailable),
      categories: number(cat.categories),
      whatsappQueued: number(whatsapp.rows[0].queued),
      whatsappSent: number(whatsapp.rows[0].sent),
      whatsappFailed: number(whatsapp.rows[0].failed),
      whatsappSkipped: number(whatsapp.rows[0].skipped),
      pendingSellers: number(pendingSellers.rows[0].pending),
      ridersOnline: number(stale.rows[0].online),
      stalePings: number(stale.rows[0].stale),
    },
    statuses: statuses.rows.map(row => ({ status: row.status, count: number(row.count), total: number(row.total) })),
    payments: payments.rows.map(row => ({ method: row.method, count: number(row.count), total: number(row.total) })),
    series: series.rows.map(row => ({ day: row.day, orders: number(row.orders), gmv: number(row.gmv), delivered: number(row.delivered) })),
    recentOrders: recentOrders.rows.map(row => ({
      id: row.id,
      status: row.status,
      customerName: row.customer_name,
      shopName: row.shop_name ?? '',
      riderName: row.rider_name ?? null,
      riderId: row.rider_id ?? null,
      total: number(row.total),
      payment: row.payment,
      placedAt: row.placed_at,
    })),
    activity: activity.rows.map(row => ({
      kind: row.kind,
      ref: row.ref,
      title: row.title,
      actor: row.actor,
      subject: row.subject,
      createdAt: row.created_at,
    })),
  }, { headers: adminHeaders })
}
