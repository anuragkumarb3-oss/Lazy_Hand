import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/authz'
import { pool } from '@/lib/db'
import { isSameOriginRequest } from '@/lib/same-origin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const { rows } = await pool.query(
    `SELECT id, phone, name, role, whatsapp_number, whatsapp_alerts_enabled, village,
            landmark, shop_name, shop_type, vehicle
     FROM profiles WHERE id = $1`,
    [user.id],
  )
  return NextResponse.json({ profile: rows[0] ? toProfile(rows[0]) : null }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function PUT(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid profile.' }, { status: 400 })
  }

  const strings = ['phone', 'name', 'whatsappNumber', 'village', 'landmark', 'shopName', 'shopType', 'vehicle'] as const
  for (const key of strings) {
    if (typeof body[key] !== 'string' || body[key].length > 500) {
      return NextResponse.json({ error: 'Invalid profile.' }, { status: 400 })
    }
  }
  if (typeof body.whatsappAlertsEnabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid profile.' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `INSERT INTO profiles (
       id, phone, name, whatsapp_number, whatsapp_alerts_enabled, village, landmark,
       shop_name, vehicle, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (id) DO UPDATE SET
       phone = EXCLUDED.phone, name = EXCLUDED.name,
       whatsapp_number = EXCLUDED.whatsapp_number,
       whatsapp_alerts_enabled = EXCLUDED.whatsapp_alerts_enabled,
       village = EXCLUDED.village, landmark = EXCLUDED.landmark,
       shop_name = EXCLUDED.shop_name, vehicle = EXCLUDED.vehicle,
       updated_at = now()
     RETURNING id, phone, name, role, whatsapp_number, whatsapp_alerts_enabled,
               village, landmark, shop_name, shop_type, vehicle`,
    [user.id, body.phone, body.name, body.whatsappNumber, body.whatsappAlertsEnabled,
      body.village, body.landmark, body.shopName, body.vehicle],
  )
  return NextResponse.json({ profile: toProfile(rows[0]) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function toProfile(row: Record<string, unknown>) {
  return {
    phone: row.phone,
    name: row.name,
    role: row.role,
    whatsappNumber: row.whatsapp_number,
    whatsappAlertsEnabled: row.whatsapp_alerts_enabled,
    village: row.village,
    landmark: row.landmark,
    shopName: row.shop_name,
    shopType: row.shop_type,
    vehicle: row.vehicle,
  }
}
