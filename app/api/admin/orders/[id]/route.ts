import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, audit, number, sameOrigin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  if (!id || id.length > 40) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers: adminHeaders })

  try {
    const { rows } = await pool.query(
      `SELECT o.*, c.phone AS customer_phone, c.name AS customer_profile_name,
              s.shop_name, s.phone AS shop_phone, s.shop_type,
              r.name AS rider_name, r.phone AS rider_phone, r.vehicle
       FROM orders o
       LEFT JOIN profiles c ON c.id = o.user_id
       LEFT JOIN profiles s ON s.id = o.shop_id
       LEFT JOIN profiles r ON r.id = o.rider_id
       WHERE o.id = $1`,
      [id],
    )
    if (!rows.length) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers: adminHeaders })

    const [events, payment, messages, location, review] = await Promise.all([
      pool.query(`SELECT id, actor_role, actor_user_id, from_status, to_status, note, created_at
                  FROM order_events WHERE order_id = $1 ORDER BY created_at ASC, id ASC`, [id]),
      pool.query(`SELECT method, amount, status, provider_reference, collected_at, created_at
                  FROM order_payments WHERE order_id = $1`, [id]),
      pool.query(`SELECT id, recipient, kind, body, status, provider, provider_message_id, error, attempts, created_at, sent_at
                  FROM whatsapp_messages WHERE order_id = $1 ORDER BY created_at ASC, id ASC`, [id]),
      pool.query(`SELECT rider_id, latitude, longitude, accuracy_m, updated_at FROM order_locations WHERE order_id = $1`, [id]),
      pool.query(`SELECT rating, comment, created_at FROM reviews WHERE order_id = $1`, [id]),
    ])

    const order = rows[0]
    return NextResponse.json({
      order: {
        id: order.id,
        status: order.status,
        customer: {
          id: order.user_id,
          name: order.customer_name || order.customer_profile_name || '',
          phone: order.customer_phone ?? null,
          address: order.address,
        },
        shop: { id: order.shop_id, name: order.shop_name ?? '', phone: order.shop_phone ?? null, type: order.shop_type ?? null },
        rider: order.rider_id
          ? { id: order.rider_id, name: order.rider_name ?? order.rider_name ?? '', phone: order.rider_phone ?? null, vehicle: order.vehicle ?? null }
          : null,
        lines: Array.isArray(order.lines) ? order.lines : [],
        payment: order.payment,
        totals: {
          itemTotal: number(order.item_total),
          deliveryFee: number(order.delivery_fee),
          platformFee: number(order.platform_fee),
          riderPayout: number(order.rider_payout),
          sellerCommission: number(order.seller_commission),
          sellerPayout: number(order.seller_payout),
          sellerDeliveryDeduction: number(order.seller_delivery_deduction),
          total: number(order.total),
        },
        route: {
          distanceKm: order.route_distance_km == null ? null : number(order.route_distance_km),
          durationMinutes: order.route_duration_minutes ?? null,
          pickup: order.pickup_latitude != null && order.pickup_longitude != null
            ? { latitude: Number(order.pickup_latitude), longitude: Number(order.pickup_longitude) } : null,
          drop: order.drop_latitude != null && order.drop_longitude != null
            ? { latitude: Number(order.drop_latitude), longitude: Number(order.drop_longitude) } : null,
        },
        placedAt: order.placed_at,
        assignedAt: order.assigned_at,
        pickedUpAt: order.picked_up_at,
        deliveredAt: order.delivered_at,
        cancelledAt: order.cancelled_at,
        updatedAt: order.updated_at,
      },
      events: events.rows,
      paymentRows: payment.rows.map(row => ({ ...row, amount: number(row.amount) })),
      messages: messages.rows,
      location: location.rows[0]
        ? { latitude: Number(location.rows[0].latitude), longitude: Number(location.rows[0].longitude), accuracyM: location.rows[0].accuracy_m, updatedAt: location.rows[0].updated_at }
        : null,
      review: review.rows[0] ?? null,
    }, { headers: adminHeaders })
  } catch (error) {
    console.error('[admin/orders/:id] Query failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Order could not be loaded.' }, { status: 500, headers: adminHeaders })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403, headers: adminHeaders })

  const { id } = await params
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: adminHeaders })
  }
  const action = body.action
  if (action !== 'cancel' && action !== 'mark-paid') return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: adminHeaders })

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : ''
  const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 64) : ''
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (action === 'mark-paid') {
      const { rows: payments } = await client.query<{ status: string }>(
        'SELECT status FROM order_payments WHERE order_id = $1 FOR UPDATE',
        [id],
      )
      const payment = payments[0]
      if (!payment) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'No payment record exists for this order.' }, { status: 404, headers: adminHeaders })
      }
      if (payment.status !== 'pending') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `This payment is already ${payment.status}.` }, { status: 409, headers: adminHeaders })
      }
      await client.query(
        `UPDATE order_payments
            SET status = 'collected', collected_at = now(), updated_at = now(),
                provider_reference = COALESCE(NULLIF($2, ''), provider_reference)
          WHERE order_id = $1`,
        [id, reference],
      )
      await client.query(
        `INSERT INTO order_events (order_id, actor_user_id, actor_role, from_status, to_status, note)
         VALUES ($1, $2, 'admin', NULL, 'payment_collected', $3)`,
        [id, admin.user.id, reference ? `Payment marked collected (ref ${reference})` : 'Payment marked collected after verification'],
      )
      await client.query('COMMIT')
      await audit(admin.phone, 'order.payment_collect', id, { reference: reference || null })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    const { rows } = await client.query<{ status: string; lines: { productId?: string; qty?: number; quantity?: number }[] }>(
      'SELECT status, lines FROM orders WHERE id = $1 FOR UPDATE',
      [id],
    )
    const order = rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers: adminHeaders })
    }
    if (!['placed', 'accepted', 'ready', 'picked'].includes(order.status)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `A ${order.status} order cannot be cancelled.` }, { status: 409, headers: adminHeaders })
    }

    for (const line of Array.isArray(order.lines) ? order.lines : []) {
      const quantity = Number(line.qty ?? line.quantity ?? 0)
      if (typeof line.productId === 'string' && Number.isInteger(quantity) && quantity > 0) {
        await client.query('UPDATE catalog_products SET stock = stock + $2, updated_at = now() WHERE id = $1', [line.productId, quantity])
      }
    }
    await client.query(`UPDATE orders SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`, [id])
    await client.query(
      `INSERT INTO order_events (order_id, actor_user_id, actor_role, from_status, to_status, note)
       VALUES ($1, $2, 'admin', $3, 'cancelled', $4)`,
      [id, admin.user.id, order.status, reason || 'Cancelled by admin'],
    )
    await client.query('COMMIT')
    await audit(admin.phone, 'order.cancel', id, { from: order.status, reason })
    return NextResponse.json({ ok: true }, { headers: adminHeaders })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[admin/orders/:id] Cancel failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'The order could not be cancelled.' }, { status: 500, headers: adminHeaders })
  } finally {
    client.release()
  }
}
