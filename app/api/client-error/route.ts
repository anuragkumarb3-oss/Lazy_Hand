import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Lightweight client-error sink. The App Router error boundary (app/error.tsx)
// posts uncaught render errors here so they are visible in the server journal.
// It only logs; it never stores or returns data.
export async function POST(request: Request) {
  try {
    const raw = await request.text()
    if (raw.length > 4000) return new NextResponse(null, { status: 204 })
    const body = JSON.parse(raw) as { message?: unknown; stack?: unknown; digest?: unknown }
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : 'Unknown error'
    const digest = typeof body.digest === 'string' ? body.digest.slice(0, 100) : undefined
    console.error('[client-error]', message, digest ? `(digest ${digest})` : '', typeof body.stack === 'string' ? body.stack.slice(0, 1500) : '')
  } catch {
    // Ignore malformed reports.
  }
  return new NextResponse(null, { status: 204 })
}