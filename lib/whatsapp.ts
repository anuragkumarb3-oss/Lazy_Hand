import 'server-only'

import crypto from 'node:crypto'
import { pool } from './db'

export type WhatsAppKind =
  | 'order_placed'
  | 'order_accepted'
  | 'order_ready'
  | 'order_rejected'
  | 'order_delivered'
  | 'system'

type SendInput = {
  to: string | null | undefined
  text: string
  kind: WhatsAppKind
  orderId?: string | null
}

/** Normalizes an Indian mobile number to E.164 (+91XXXXXXXXXX), or null. */
export function toE164(phone: string | null | undefined) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '').slice(-10)
  return /^[6-9][0-9]{9}$/.test(digits) ? `+91${digits}` : null
}

async function markMessage(id: number, status: 'sent' | 'failed' | 'skipped', values: { providerId?: string | null; error?: string | null } = {}) {
  try {
    await pool.query(
      `UPDATE whatsapp_messages
       SET status = $2, provider_message_id = COALESCE($3, provider_message_id),
           error = $4, attempts = attempts + 1,
           sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
       WHERE id = $1`,
      [id, status, values.providerId ?? null, values.error ? values.error.slice(0, 500) : null],
    )
  } catch (error) {
    console.error('[whatsapp] Could not update message log', error instanceof Error ? error.message : error)
  }
}

/**
 * Best-effort transactional send. Never throws: a failed notification must not
 * fail the order or status change that triggered it.
 */
export async function sendWhatsApp(input: SendInput) {
  const recipient = toE164(input.to)
  const text = input.text.trim()
  if (!recipient || !text) return

  let messageId: number
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO whatsapp_messages (order_id, recipient, kind, body)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.orderId ?? null, recipient, input.kind, text.slice(0, 4000)],
    )
    messageId = Number(rows[0].id)
  } catch (error) {
    console.error('[whatsapp] Could not queue message', error instanceof Error ? error.message : error)
    return
  }

  const base = process.env.WHATSAPP_BRIDGE_URL?.replace(/\/+$/, '')
  const secret = process.env.WHATSAPP_BRIDGE_HMAC_SECRET
  if (!base || !secret) {
    await markMessage(messageId, 'skipped', { error: 'WhatsApp bridge is not configured' })
    return
  }

  const body = JSON.stringify({ to: recipient, text })
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')

  try {
    const response = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lazyhand-timestamp': timestamp,
        'x-lazyhand-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    const result = await response.json().catch(() => null) as { id?: string; error?: string } | null
    if (!response.ok) throw new Error(result?.error ?? `Bridge responded ${response.status}`)
    await markMessage(messageId, 'sent', { providerId: result?.id ?? null })
  } catch (error) {
    await markMessage(messageId, 'failed', { error: error instanceof Error ? error.message : 'Unknown error' })
  }
}

/** Re-sends a stored message (used by the admin log). Returns false when it cannot. */
export async function resendWhatsApp(id: number) {
  const { rows } = await pool.query<{ recipient: string; body: string; status: string }>(
    'SELECT recipient, body, status FROM whatsapp_messages WHERE id = $1',
    [id],
  )
  const message = rows[0]
  if (!message || message.status === 'sent') return false

  const base = process.env.WHATSAPP_BRIDGE_URL?.replace(/\/+$/, '')
  const secret = process.env.WHATSAPP_BRIDGE_HMAC_SECRET
  if (!base || !secret) return false

  const body = JSON.stringify({ to: message.recipient, text: message.body })
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  try {
    const response = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lazyhand-timestamp': timestamp,
        'x-lazyhand-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    const result = await response.json().catch(() => null) as { id?: string; error?: string } | null
    if (!response.ok) throw new Error(result?.error ?? `Bridge responded ${response.status}`)
    await markMessage(id, 'sent', { providerId: result?.id ?? null })
    return true
  } catch (error) {
    await markMessage(id, 'failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    return false
  }
}

type PlacedOrder = {
  id: string
  shop_id: string
  total: number | string
  customer_name: string
  address: string
}

/** Notifies each shop that opted into WhatsApp alerts. */
export async function notifySellersOrderPlaced(orders: PlacedOrder[]) {
  if (!orders.length) return
  try {
    const shopIds = [...new Set(orders.map(order => order.shop_id))]
    const { rows } = await pool.query<{ id: string; whatsapp_number: string }>(
      `SELECT id, whatsapp_number FROM profiles
       WHERE id = ANY($1::uuid[]) AND whatsapp_alerts_enabled = TRUE AND whatsapp_number <> ''`,
      [shopIds],
    )
    const numberByShop = new Map(rows.map(row => [row.id, row.whatsapp_number]))
    await Promise.all(orders.map(order => {
      const number = numberByShop.get(order.shop_id)
      if (!number) return Promise.resolve()
      return sendWhatsApp({
        to: number,
        kind: 'order_placed',
        orderId: order.id,
        text: `New LazyHand order ${order.id} · ₹${Number(order.total).toFixed(0)}\n${order.customer_name} · ${order.address}\nOpen the seller app to accept or reject.`,
      })
    }))
  } catch (error) {
    console.error('[whatsapp] Seller notification failed', error instanceof Error ? error.message : error)
  }
}

const CUSTOMER_MESSAGES: Record<'accepted' | 'ready' | 'rejected' | 'delivered', { kind: WhatsAppKind; text: (id: string) => string }> = {
  accepted: { kind: 'order_accepted', text: id => `LazyHand: your order ${id} was accepted and is being prepared.` },
  ready: { kind: 'order_ready', text: id => `LazyHand: your order ${id} is ready and waiting for a rider.` },
  rejected: { kind: 'order_rejected', text: id => `LazyHand: the shop could not take your order ${id}. No payment is due for it.` },
  delivered: { kind: 'order_delivered', text: id => `LazyHand: order ${id} was delivered. Thanks for shopping with us.` },
}

/** Notifies the customer about a seller decision. */
export async function notifyCustomerOrderStatus(input: { orderId: string; userId: string; status: string }) {
  const template = CUSTOMER_MESSAGES[input.status as keyof typeof CUSTOMER_MESSAGES]
  if (!template) return
  try {
    const { rows } = await pool.query<{ phone: string }>('SELECT phone FROM profiles WHERE id = $1', [input.userId])
    const phone = rows[0]?.phone
    if (!phone) return
    await sendWhatsApp({
      to: phone,
      kind: template.kind,
      orderId: input.orderId,
      text: template.text(input.orderId),
    })
  } catch (error) {
    console.error('[whatsapp] Customer notification failed', error instanceof Error ? error.message : error)
  }
}
