'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Phone } from 'lucide-react'
import { ago, Empty, LiveDot, money, StatusPill } from './admin-ui'

type Rider = {
  id: string
  name: string
  phone: string
  vehicle: string | null
  suspended: boolean
  deliveries: number
  earnings: number
  lastPing: string | null
  ageSeconds: number | null
  online: boolean
  activeOrder: { id: string; status: string; customerName: string; address: string; total: number; placedAt: string } | null
}

async function fetcher(url: string): Promise<{ riders: Rider[]; generatedAt: string }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Riders could not be loaded.')
  return response.json()
}

export function AdminRiders() {
  const { data, error, isValidating } = useSWR('/api/admin/riders', fetcher, { refreshInterval: 8000 })
  const riders = data?.riders ?? []
  const active = riders.filter(rider => rider.activeOrder).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Riders</h1>
          <p className="text-xs text-neutral-500">{riders.length} registered · {active} on a trip · {riders.filter(rider => rider.online).length} sending GPS in the last 90s</p>
        </div>
        <LiveDot loading={isValidating} />
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p> : null}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Rider</th>
                <th className="px-4 py-2.5 font-semibold">Availability</th>
                <th className="px-4 py-2.5 font-semibold">Active trip</th>
                <th className="px-4 py-2.5 text-right font-semibold">Deliveries</th>
                <th className="px-4 py-2.5 text-right font-semibold">Earnings</th>
                <th className="px-4 py-2.5 font-semibold">Last GPS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {riders.map(rider => (
                <tr key={rider.id} className={rider.suspended ? 'bg-red-50/40' : undefined}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-neutral-900">{rider.name}</p>
                    <p className="flex items-center gap-1 text-xs text-neutral-600"><Phone className="h-3 w-3" /> +91 {rider.phone || '—'}</p>
                    <p className="text-[11px] text-neutral-500">{rider.vehicle || 'No vehicle recorded'}</p>
                  </td>
                  <td className="px-4 py-3">
                    {rider.suspended ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-red-700">Suspended</span> : rider.activeOrder ? <span className="text-xs font-semibold text-violet-700">On a trip</span> : rider.online ? <span className="text-xs font-semibold text-emerald-700">Online</span> : <span className="text-xs text-neutral-400">Offline</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {rider.activeOrder ? (
                      <>
                        <Link href={`/admin/orders?q=${encodeURIComponent(rider.activeOrder.id)}`} className="font-mono font-semibold text-neutral-900 hover:text-red-600">{rider.activeOrder.id}</Link>
                        <p className="text-neutral-600">{rider.activeOrder.customerName} · {money(rider.activeOrder.total)}</p>
                        <StatusPill status={rider.activeOrder.status} className="mt-1" />
                      </>
                    ) : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{rider.deliveries}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(rider.earnings)}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{rider.lastPing ? ago(rider.lastPing) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !riders.length ? <Empty>No rider accounts yet. Change a user’s role to rider from the Users page.</Empty> : null}
          {!data && !error ? <Empty>Loading riders…</Empty> : null}
        </div>
      </div>
    </div>
  )
}
