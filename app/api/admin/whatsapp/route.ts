import { NextResponse } from 'next/server'
import { currentUser, isAdminUser } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

function bridgeBase() {
  return process.env.WHATSAPP_BRIDGE_URL?.replace(/\/+$/, '') ?? ''
}

function bridgeToken() {
  return process.env.WHATSAPP_BRIDGE_ADMIN_TOKEN ?? ''
}

async function bridgeFetch(path: string, init?: RequestInit) {
  const base = bridgeBase()
  const token = bridgeToken()
  if (!base || !token) throw new Error('WhatsApp bridge is not configured on this server.')
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : `Bridge responded ${response.status}`)
  return body ?? {}
}

async function requireAdmin() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers })
  if (!(await isAdminUser(user))) return NextResponse.json({ error: 'Admin access required.' }, { status: 403, headers })
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const status = await bridgeFetch('/v1/status')
    const qr = status.status === 'pairing' ? (await bridgeFetch('/v1/pairing/qr')).qr ?? null : null
    return NextResponse.json({ ...status, qr }, { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WhatsApp sender status is unavailable.' }, { status: 503, headers })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { action?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers }) }

  if (body.action === 'pair') {
    try {
      await bridgeFetch('/v1/pairing', { method: 'POST' })
      return NextResponse.json({ ok: true }, { headers })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Pairing could not be started.' }, { status: 503, headers })
    }
  }

  if (body.action === 'logout') {
    try {
      await bridgeFetch('/v1/pairing/logout', { method: 'POST' })
      return NextResponse.json({ ok: true }, { headers })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'The sender could not be disconnected.' }, { status: 503, headers })
    }
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers })
}
