import 'server-only'

import { NextResponse } from 'next/server'
import { currentUser, isAdminUser, normalizePhone, type AuthedUser } from './authz'
import { pool } from './db'
export { isSameOriginRequest as sameOrigin } from './same-origin'

export const adminHeaders = { 'Cache-Control': 'private, no-store' }

export type AdminContext = { user: AuthedUser; phone: string | null }

/**
 * Returns the signed-in admin, or a ready-to-return error response. Every
 * /api/admin route funnels through this so admin checks cannot drift apart.
 */
export async function adminOrResponse(): Promise<AdminContext | NextResponse> {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers: adminHeaders })
  if (!(await isAdminUser(user))) return NextResponse.json({ error: 'Admin access required.' }, { status: 403, headers: adminHeaders })
  return { user, phone: normalizePhone(user.phone) }
}

/** Append-only admin action trail. Never throws into the request path. */
export async function audit(actorPhone: string | null, action: string, target: string, detail: Record<string, unknown> = {}) {
  try {
    await pool.query(
      'INSERT INTO audit_log (actor_phone, action, target, detail) VALUES ($1, $2, $3, $4::jsonb)',
      [actorPhone, action.slice(0, 80), target.slice(0, 200), JSON.stringify(detail)],
    )
  } catch (error) {
    console.error('[admin] Audit write failed', error instanceof Error ? error.message : error)
  }
}

/** SQL fragment for "today" in the shop timezone, used by every dashboard total. */
export const KOLKATA_TODAY = `(placed_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`

export function number(value: unknown) {
  return value == null ? 0 : Number(value)
}

export function positiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}
