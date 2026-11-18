import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { currentUser, isAdminUser, normalizePhone } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const admin = await isAdminUser(user)
  const { rows } = await pool.query<{ role: string; shop_type: string }>(
    'SELECT role, shop_type FROM profiles WHERE id = $1',
    [user.id],
  )

  return NextResponse.json({
    admin,
    phone: normalizePhone(user.phone),
    role: rows[0]?.role ?? 'customer',
    businessType: (rows[0]?.shop_type ?? '').toLowerCase(),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
