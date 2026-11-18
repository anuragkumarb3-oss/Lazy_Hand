import { NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/authz'
import { pool } from '@/lib/db'
import {
  clearPreviewSession,
  previewModeEnabled,
  previewUserId,
  readPreviewPhone,
  setPreviewSession,
} from '@/lib/preview-session'

export const dynamic = 'force-dynamic'

function disabled() {
  return NextResponse.json({ error: 'Preview sessions are not available.' }, { status: 404 })
}

type PreviewProfileRow = {
  name: string
  role: string
  shop_name: string | null
  shop_type: string | null
  village: string | null
  landmark: string | null
  vehicle: string | null
}

async function previewIdentity(id: string, phone: string) {
  const [{ rows }, { rows: profileRows }] = await Promise.all([
    pool.query('SELECT 1 FROM admins WHERE phone = $1 AND is_active = TRUE', [phone]),
    pool.query<PreviewProfileRow>(
      'SELECT name, role, shop_name, shop_type, village, landmark, vehicle FROM profiles WHERE id = $1',
      [id],
    ),
  ])
  const profile = profileRows[0]
  return {
    phone,
    id,
    admin: rows.length > 0,
    profile: profile ? {
      name: profile.name,
      role: profile.role,
      shopName: profile.shop_name ?? '',
      shopType: profile.shop_type ?? '',
      village: profile.village ?? '',
      landmark: profile.landmark ?? '',
      vehicle: profile.vehicle ?? '',
    } : null,
  }
}

export async function GET() {
  if (!previewModeEnabled()) return disabled()
  const phone = await readPreviewPhone()
  if (!phone) return NextResponse.json({ phone: null, admin: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  return NextResponse.json(await previewIdentity(previewUserId(phone), phone), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  if (!previewModeEnabled()) return disabled()
  let body: { phone?: unknown; name?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Enter a phone number.' }, { status: 400 }) }
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '')
  if (!phone) return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 })

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'Preview user'
  const id = previewUserId(phone)
  await pool.query(
    `INSERT INTO profiles (id, phone, name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`,
    [id, phone, name],
  )
  await setPreviewSession(phone)
  return NextResponse.json(await previewIdentity(id, phone), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function DELETE() {
  if (!previewModeEnabled()) return disabled()
  await clearPreviewSession()
  return NextResponse.json({ ok: true })
}
