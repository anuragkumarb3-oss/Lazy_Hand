import 'server-only'

import { pool } from './db'
import { previewModeEnabled, previewUserId, readPreviewPhone } from './preview-session'
import { createClient } from './supabase/server'

/** Normalizes an Indian mobile number to its 10-digit form, or null when invalid. */
export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const lastTen = digits.slice(-10)
  return /^[6-9][0-9]{9}$/.test(lastTen) ? lastTen : null
}

export type AuthedUser = { id: string; phone?: string | null; app_metadata?: Record<string, unknown> }

export async function currentUser(): Promise<AuthedUser | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return user
  } catch {
    // Placeholder Supabase config in preview cannot authenticate; fall through.
  }

  if (previewModeEnabled()) {
    const phone = await readPreviewPhone()
    if (phone) return { id: previewUserId(phone), phone: `+91${phone}`, app_metadata: {} }
  }

  return null
}

/**
 * Admin access is granted by trusted Supabase app_metadata OR by the Postgres
 * allow-list. Phone numbers come from the verified session, never the client.
 */
export async function isAdminUser(user: AuthedUser | null) {
  if (!user) return false
  if (user.app_metadata?.role === 'admin') return true
  const phone = normalizePhone(user.phone)
  if (!phone) return false
  const { rows } = await pool.query('SELECT 1 FROM admins WHERE phone = $1 AND is_active = TRUE', [phone])
  return rows.length > 0
}
