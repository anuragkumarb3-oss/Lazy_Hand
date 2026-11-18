import 'server-only'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'

export const PREVIEW_SESSION_COOKIE = 'lh_preview_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function previewModeEnabled() {
  return process.env.VERCEL_ENV === 'preview' || process.env.PREVIEW_MODE === '1'
}

function sessionSecret() {
  return process.env.PREVIEW_SESSION_SECRET ?? ''
}

/** Deterministic UUID for a preview identity, so orders/profiles stay consistent. */
export function previewUserId(phone: string) {
  const hex = crypto.createHash('sha256').update(`lazyhand-preview:${phone}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function createPreviewToken(phone: string) {
  const secret = sessionSecret()
  if (!secret) return null
  const expires = Date.now() + MAX_AGE_SECONDS * 1000
  const payload = `${phone}.${expires}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${signature}`
}

function verifyPreviewToken(token: string) {
  const secret = sessionSecret()
  if (!secret) return null
  const [phone, expires, signature] = token.split('.')
  if (!phone || !expires || !signature) return null
  if (!/^[6-9][0-9]{9}$/.test(phone)) return null
  if (!Number(expires) || Number(expires) < Date.now()) return null
  const expected = crypto.createHmac('sha256', secret).update(`${phone}.${expires}`).digest('hex')
  const given = Buffer.from(signature, 'hex')
  const wanted = Buffer.from(expected, 'hex')
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null
  return phone
}

export async function readPreviewPhone() {
  if (!previewModeEnabled()) return null
  const token = (await cookies()).get(PREVIEW_SESSION_COOKIE)?.value
  return token ? verifyPreviewToken(token) : null
}

export async function setPreviewSession(phone: string) {
  const token = createPreviewToken(phone)
  if (!token) throw new Error('Preview sessions are not configured.')
  ;(await cookies()).set(PREVIEW_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Preview is also opened over plain HTTP on the VPS. A Secure cookie is
    // silently dropped there, which made preview sign-in look like it did
    // nothing. Production (non-preview) stays Secure.
    secure: process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function clearPreviewSession() {
  ;(await cookies()).delete(PREVIEW_SESSION_COOKIE)
}
