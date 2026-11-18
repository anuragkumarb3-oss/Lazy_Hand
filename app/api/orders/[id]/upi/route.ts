import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { currentUser, isAdminUser } from '@/lib/authz'
import { pool } from '@/lib/db'
import { buildUpiUri, getUpiConfig } from '@/lib/upi'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers })

  const { id } = await params
  if (!/^LH[A-Z0-9]{10}$/.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })

  try {
    const { rows } = await pool.query<{ id: string; user_id: string; total: number | string; payment: string; status: string }>(
      `SELECT id, user_id, total, payment, status FROM orders WHERE id = $1`,
      [id],
    )
    const order = rows[0]
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })

    const isAdmin = await isAdminUser(user)
    if (!isAdmin && order.user_id !== user.id) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers })
    if (order.payment !== 'upi') return NextResponse.json({ error: 'This order is not a UPI order.' }, { status: 400, headers })

    const { rows: paymentRows } = await pool.query<{ status: string; collected_at: string | null; provider_reference: string | null }>(
      `SELECT status, collected_at, provider_reference FROM order_payments WHERE order_id = $1`,
      [id],
    )
    const payment = paymentRows[0]
    const status = payment?.status ?? 'pending'
    const amount = Number(order.total)

    if (status !== 'pending') {
      return NextResponse.json({
        status,
        amount,
        paidAt: payment?.collected_at ?? null,
        reference: id,
      }, { headers })
    }

    const config = getUpiConfig()
    if (!config) {
      return NextResponse.json({ status, amount, reference: id, error: 'UPI payments are not enabled right now.' }, { status: 503, headers })
    }

    const uri = buildUpiUri({ amount, reference: id })
    if (!uri) return NextResponse.json({ error: 'UPI link could not be generated.' }, { status: 503, headers })

    const svg = await QRCode.toString(uri, {
      type: 'svg',
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })

    return NextResponse.json({
      status,
      amount,
      upiId: config.upiId,
      payeeName: config.payeeName,
      reference: id,
      uri,
      svg,
    }, { headers })
  } catch (error) {
    console.error('[orders/:id/upi] failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'The UPI payment details could not be loaded.' }, { status: 500, headers })
  }
}