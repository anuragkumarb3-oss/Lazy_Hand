import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, audit, positiveInt, sameOrigin } from '@/lib/admin'
import { resendWhatsApp } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin

  const url = new URL(request.url)
  const type = url.searchParams.get('type') ?? 'audit'
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const status = url.searchParams.get('status') ?? ''
  const page = positiveInt(url.searchParams.get('page'), 1, 10_000)
  const limit = positiveInt(url.searchParams.get('limit'), 50, 200)
  const offset = (page - 1) * limit

  const where: string[] = []
  const params: unknown[] = []

  try {
    if (type === 'orders') {
      if (q) { params.push(`%${q}%`); where.push(`(e.order_id ILIKE $${params.length} OR e.to_status ILIKE $${params.length} OR e.actor_role ILIKE $${params.length})`) }
      params.push(limit, offset)
      const { rows } = await pool.query(
        `SELECT e.id, e.order_id, e.actor_user_id, e.actor_role, e.from_status, e.to_status, e.note, e.created_at,
                p.name AS actor_name, p.phone AS actor_phone, count(*) OVER() AS total_count
         FROM order_events e
         LEFT JOIN profiles p ON p.id = e.actor_user_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
      return NextResponse.json({
        type,
        logs: rows.map(row => ({
          id: row.id,
          orderId: row.order_id,
          actorName: row.actor_name ?? null,
          actorPhone: row.actor_phone ?? null,
          actorRole: row.actor_role,
          fromStatus: row.from_status,
          toStatus: row.to_status,
          note: row.note,
          createdAt: row.created_at,
        })),
        total: rows.length ? Number(rows[0].total_count) : 0,
        page,
        limit,
        generatedAt: new Date().toISOString(),
      }, { headers: adminHeaders })
    }

    if (type === 'whatsapp') {
      if (q) { params.push(`%${q}%`); where.push(`(w.recipient ILIKE $${params.length} OR w.kind ILIKE $${params.length} OR w.order_id ILIKE $${params.length})`) }
      if (['queued', 'sent', 'failed', 'skipped'].includes(status)) { params.push(status); where.push(`w.status = $${params.length}`) }
      params.push(limit, offset)
      const [{ rows }, counts] = await Promise.all([
        pool.query(
          `SELECT w.id, w.order_id, w.recipient, w.kind, w.body, w.status, w.provider, w.provider_message_id,
                  w.error, w.attempts, w.created_at, w.sent_at, count(*) OVER() AS total_count
           FROM whatsapp_messages w
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY w.created_at DESC, w.id DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params,
        ),
        pool.query(`SELECT status, count(*) AS count FROM whatsapp_messages GROUP BY status`),
      ])
      return NextResponse.json({
        type,
        logs: rows.map(row => ({ ...row, id: Number(row.id) })),
        counts: Object.fromEntries(counts.rows.map(row => [row.status, Number(row.count)])),
        total: rows.length ? Number(rows[0].total_count) : 0,
        page,
        limit,
        generatedAt: new Date().toISOString(),
      }, { headers: adminHeaders })
    }

    if (q) { params.push(`%${q}%`); where.push(`(a.action ILIKE $${params.length} OR a.actor_phone ILIKE $${params.length} OR a.target ILIKE $${params.length})`) }
    params.push(limit, offset)
    const { rows } = await pool.query(
      `SELECT a.id, a.actor_phone, a.action, a.target, a.detail, a.created_at, count(*) OVER() AS total_count
       FROM audit_log a
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    return NextResponse.json({
      type: 'audit',
      logs: rows.map(row => ({ ...row, id: Number(row.id) })),
      total: rows.length ? Number(rows[0].total_count) : 0,
      page,
      limit,
      generatedAt: new Date().toISOString(),
    }, { headers: adminHeaders })
  } catch (error) {
    console.error('[admin/logs] Query failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Logs could not be loaded.' }, { status: 500, headers: adminHeaders })
  }
}

export async function POST(request: Request) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403, headers: adminHeaders })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: adminHeaders })
  }

  if (body.action !== 'retry-whatsapp' || !Number.isInteger(body.id)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: adminHeaders })
  }

  const sent = await resendWhatsApp(Number(body.id))
  await audit(admin.phone, 'whatsapp.retry', String(body.id), { sent })
  if (!sent) return NextResponse.json({ error: 'WhatsApp bridge is not connected, or the message was already sent.' }, { status: 409, headers: adminHeaders })
  return NextResponse.json({ ok: true }, { headers: adminHeaders })
}
