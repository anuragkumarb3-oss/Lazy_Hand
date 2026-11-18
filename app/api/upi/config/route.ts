import { NextResponse } from 'next/server'
import { upiConfigured } from '@/lib/upi'

export const dynamic = 'force-dynamic'

// Public: only reveals whether UPI collection is enabled. The UPI ID itself is
// never exposed here; it is embedded in the per-order QR served to the owner.
export async function GET() {
  return NextResponse.json({ enabled: upiConfigured() }, { headers: { 'Cache-Control': 'no-store' } })
}