import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'
import { isValidTimeZone } from '@/lib/shop-status'

export const dynamic = 'force-dynamic'

async function seller() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { rows } = await pool.query('SELECT role FROM profiles WHERE id=$1', [user.id])
  return rows[0]?.role === 'shopkeeper' ? user : null
}

export async function GET() {
  const user = await seller()
  if (!user) return NextResponse.json({ error: 'Approved seller access required.' }, { status: 403 })
  const [{ rows }, { rows: profileRows }] = await Promise.all([
    pool.query(
      'SELECT day_of_week, opens_at::text, closes_at::text, is_closed FROM shop_operating_hours WHERE user_id=$1 ORDER BY day_of_week',
      [user.id],
    ),
    pool.query(
      'SELECT shop_timezone, shop_is_open_override, delivery_estimate_min, delivery_estimate_max FROM profiles WHERE id=$1',
      [user.id],
    ),
  ])
  const settings = profileRows[0] ?? { shop_timezone: 'Asia/Kolkata', shop_is_open_override: null, delivery_estimate_min: null, delivery_estimate_max: null }
  return NextResponse.json({ hours: rows, settings }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PUT(request: Request) {
  const user = await seller()
  if (!user) return NextResponse.json({ error: 'Approved seller access required.' }, { status: 403 })
  const origin = request.headers.get('origin')
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) throw new Error('origin')
  } catch {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })
  }
  let body: { hours?: unknown; settings?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid shop settings.' }, { status: 400 }) }
  if (!Array.isArray(body.hours) || body.hours.length !== 7 || !body.settings || typeof body.settings !== 'object') return NextResponse.json({ error: 'Provide weekly hours and shop settings.' }, { status: 400 })
  const settings = body.settings as { shop_timezone?: unknown; shop_is_open_override?: unknown; delivery_estimate_min?: unknown; delivery_estimate_max?: unknown }
  const timezone = settings.shop_timezone
  const override = settings.shop_is_open_override
  const estimateMin = settings.delivery_estimate_min
  const estimateMax = settings.delivery_estimate_max
  if (typeof timezone !== 'string' || timezone.length > 80 || !isValidTimeZone(timezone)
    || (override !== null && typeof override !== 'boolean')
    || (estimateMin !== null && (!Number.isInteger(estimateMin) || Number(estimateMin) < 1 || Number(estimateMin) > 240))
    || (estimateMax !== null && (!Number.isInteger(estimateMax) || Number(estimateMax) < 1 || Number(estimateMax) > 240))
    || (estimateMin !== null && estimateMax !== null && Number(estimateMin) > Number(estimateMax))) {
    return NextResponse.json({ error: 'Invalid timezone, open status, or delivery estimate.' }, { status: 400 })
  }
  const days = new Set<number>()
  for (const value of body.hours) {
    if (!value || typeof value !== 'object') return NextResponse.json({ error: 'Invalid weekly hours.' }, { status: 400 })
    const day = value as { day_of_week?: unknown; opens_at?: unknown; closes_at?: unknown; is_closed?: unknown }
    if (!Number.isInteger(day.day_of_week) || Number(day.day_of_week) < 0 || Number(day.day_of_week) > 6 || days.has(Number(day.day_of_week)) || typeof day.is_closed !== 'boolean') return NextResponse.json({ error: 'Invalid weekly hours.' }, { status: 400 })
    days.add(Number(day.day_of_week))
    if (!day.is_closed && (typeof day.opens_at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.opens_at) || typeof day.closes_at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.closes_at) || day.opens_at === day.closes_at)) return NextResponse.json({ error: 'Opening and closing times must be valid and different.' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const value of body.hours as Array<{ day_of_week: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>) {
      await client.query(
        `INSERT INTO shop_operating_hours(user_id,day_of_week,opens_at,closes_at,is_closed)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id,day_of_week) DO UPDATE SET
           opens_at=EXCLUDED.opens_at, closes_at=EXCLUDED.closes_at, is_closed=EXCLUDED.is_closed`,
        [user.id, value.day_of_week, value.is_closed ? null : value.opens_at, value.is_closed ? null : value.closes_at, value.is_closed],
      )
    }
    await client.query(
      `UPDATE profiles SET shop_timezone=$1, shop_is_open_override=$2,
       delivery_estimate_min=$3, delivery_estimate_max=$4, updated_at=now() WHERE id=$5`,
      [timezone, override, estimateMin, estimateMax, user.id],
    )
    await client.query('COMMIT')
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'Shop hours could not be saved.' }, { status: 500 })
  } finally { client.release() }
}
