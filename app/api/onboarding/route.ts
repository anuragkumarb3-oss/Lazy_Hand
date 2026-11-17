import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'
import { LEGAL_POLICY_VERSION, policiesForRole } from '@/lib/legal-policies'

export const dynamic = 'force-dynamic'
const allowedRoles = new Set(['customer', 'shopkeeper', 'rider'])

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  const origin = request.headers.get('origin')
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })
  }

  let body: { role?: unknown; policyKeys?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid onboarding details.' }, { status: 400 }) }
  if (typeof body.role !== 'string' || !allowedRoles.has(body.role) || !Array.isArray(body.policyKeys) || body.policyKeys.length > 4 || body.policyKeys.some(key => typeof key !== 'string')) {
    return NextResponse.json({ error: 'Invalid onboarding details.' }, { status: 400 })
  }
  const role = body.role as 'customer' | 'shopkeeper' | 'rider'
  const submittedPolicies = new Set(body.policyKeys as string[])
  const requiredPolicies = policiesForRole(role)
  if (submittedPolicies.size !== requiredPolicies.length || requiredPolicies.some(key => !submittedPolicies.has(key))) {
    return NextResponse.json({ error: 'Please agree to the account policies to continue.' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rowCount } = await client.query('SELECT 1 FROM profiles WHERE id = $1 FOR SHARE', [user.id])
    if (!rowCount) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Save your profile before recording onboarding.' }, { status: 409 })
    }
    for (const policyKey of new Set(body.policyKeys as string[])) {
      await client.query(
        `INSERT INTO legal_policy_acceptances(user_id, role, policy_key, policy_version)
         VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, role, policy_key, policy_version) DO NOTHING`,
        [user.id, role, policyKey, LEGAL_POLICY_VERSION],
      )
    }
    let sellerRequestSubmitted = false
    if (role === 'shopkeeper') {
      const result = await client.query(
        `INSERT INTO seller_applications(user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`, [user.id],
      )
      sellerRequestSubmitted = (result.rowCount ?? 0) > 0
    }
    await client.query('COMMIT')
    return NextResponse.json({ sellerRequestSubmitted }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: 'Onboarding could not be saved.' }, { status: 500 })
  } finally {
    client.release()
  }
}
