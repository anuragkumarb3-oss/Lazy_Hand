import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, audit, sameOrigin } from '@/lib/admin'
import { normalizePhone } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ROLES = new Set(['customer', 'shopkeeper', 'rider'])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403, headers: adminHeaders })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'User not found.' }, { status: 404, headers: adminHeaders })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: adminHeaders })
  }

  const { rows } = await pool.query<{ id: string; phone: string; role: string; is_suspended: boolean; phone_normalized: string | null }>(
    `SELECT id, phone, role, is_suspended, NULL::text AS phone_normalized FROM profiles WHERE id = $1`,
    [id],
  )
  const profile = rows[0]
  if (!profile) return NextResponse.json({ error: 'User not found.' }, { status: 404, headers: adminHeaders })

  const action = String(body.action ?? '')
  const isSelf = Boolean(admin.phone) && normalizePhone(profile.phone) === admin.phone

  try {
    if (action === 'suspend' || action === 'restore') {
      if (isSelf) return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 409, headers: adminHeaders })
      await pool.query(
        `UPDATE profiles SET is_suspended = $2, suspended_at = CASE WHEN $2 THEN now() ELSE NULL END, updated_at = now() WHERE id = $1`,
        [id, action === 'suspend'],
      )
      await audit(admin.phone, action === 'suspend' ? 'user.suspend' : 'user.restore', id, { phone: profile.phone })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    if (action === 'set-role') {
      const role = String(body.role ?? '')
      if (!ROLES.has(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400, headers: adminHeaders })
      if (isSelf) return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 409, headers: adminHeaders })
      await pool.query(`UPDATE profiles SET role = $2, updated_at = now() WHERE id = $1`, [id, role])
      await audit(admin.phone, 'user.role', id, { from: profile.role, to: role, phone: profile.phone })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    if (action === 'approve-seller' || action === 'reject-seller') {
      const approve = action === 'approve-seller'
      const businessType = typeof body.businessType === 'string' && /^[a-z-]{1,40}$/.test(body.businessType) ? body.businessType : 'grocery'
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `UPDATE seller_applications SET status = $2, reviewed_at = now(), reviewed_by = $3
           WHERE user_id = $1 AND status = 'pending'`,
          [id, approve ? 'approved' : 'rejected', admin.user.id],
        )
        if (!result.rowCount) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'No pending shopkeeper request for this account.' }, { status: 404, headers: adminHeaders })
        }
        if (approve) {
          await client.query(`UPDATE profiles SET role = 'shopkeeper', shop_type = $2, updated_at = now() WHERE id = $1`, [id, businessType])
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
      await audit(admin.phone, approve ? 'seller.approve' : 'seller.reject', id, { businessType, phone: profile.phone })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    if (action === 'make-admin' || action === 'revoke-admin') {
      const phone = normalizePhone(profile.phone)
      if (!phone) return NextResponse.json({ error: 'This account has no valid mobile number.' }, { status: 409, headers: adminHeaders })
      if (action === 'make-admin') {
        await pool.query(
          `INSERT INTO admins (phone, name) VALUES ($1, $2)
           ON CONFLICT (phone) DO UPDATE SET is_active = TRUE`,
          [phone, profile.phone],
        )
        await audit(admin.phone, 'admin.grant', id, { phone })
        return NextResponse.json({ ok: true }, { headers: adminHeaders })
      }
      if (isSelf) return NextResponse.json({ error: 'You cannot revoke your own admin access.' }, { status: 409, headers: adminHeaders })
      const { rows: active } = await pool.query<{ count: string }>('SELECT count(*) AS count FROM admins WHERE is_active')
      if (Number(active[0]?.count ?? 0) <= 1) {
        return NextResponse.json({ error: 'At least one active admin is required.' }, { status: 409, headers: adminHeaders })
      }
      await pool.query('UPDATE admins SET is_active = FALSE WHERE phone = $1', [phone])
      await audit(admin.phone, 'admin.revoke', id, { phone })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: adminHeaders })
  } catch (error) {
    console.error('[admin/users/:id] Action failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'The action could not be completed.' }, { status: 500, headers: adminHeaders })
  }
}
