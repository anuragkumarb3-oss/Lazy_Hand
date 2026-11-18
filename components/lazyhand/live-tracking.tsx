'use client'

import useSWR from 'swr'
import { Phone } from 'lucide-react'
import { TrackingMap, type TrackingMarker } from './tracking-map'

type TrackingResponse = {
  order: {
    id: string
    status: string
    address: string
    shopName: string
    total: number
    pickup: { latitude: number; longitude: number } | null
    drop: { latitude: number; longitude: number } | null
    routeDistanceKm: number | null
    rider: { name: string; phone: string | null } | null
  }
  tracking: {
    active: boolean
    stale: boolean
    ageSeconds: number | null
    etaMinutes: number | null
    etaTarget: 'pickup' | 'drop' | null
    route: [number, number][] | null
    location: { latitude: number; longitude: number; accuracyM: number | null; updatedAt: string } | null
    customerPhone: string | null
    shopPhone: string | null
    viewer: 'customer' | 'seller' | 'rider' | 'admin'
  }
}

const STATUS_LABEL: Record<string, string> = {
  placed: 'Waiting for the shop',
  accepted: 'Shop is preparing your order',
  ready: 'Packed and waiting for a rider',
  picked: 'On the way to you',
  delivered: 'Delivered',
  rejected: 'Order declined',
  cancelled: 'Order cancelled',
}

async function fetchTracking(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to see live tracking.' : 'Live tracking is unavailable right now.')
  return response.json() as Promise<TrackingResponse>
}

export function LiveTrackingPanel({ orderId, height = 260 }: { orderId: string; height?: number }) {
  const testOrder = orderId.startsWith('TEST')
  const { data, error } = useSWR(testOrder ? null : `/api/orders/${orderId}/tracking`, fetchTracking, { refreshInterval: 8000 })

  if (testOrder) return null
  if (error) return <p className="rounded-2xl border border-line bg-white p-4 text-sm text-muted-ink">{error.message}</p>
  if (!data) return <div className="h-60 animate-pulse rounded-2xl border border-line bg-white" aria-label="Loading live tracking" />

  const { order, tracking } = data
  const markers: TrackingMarker[] = []
  if (order.pickup) markers.push({ id: 'pickup', latitude: order.pickup.latitude, longitude: order.pickup.longitude, label: `${order.shopName} (pickup)`, color: '#B45309' })
  if (order.drop) markers.push({ id: 'drop', latitude: order.drop.latitude, longitude: order.drop.longitude, label: 'Delivery address', color: '#15803D' })
  if (tracking.location) markers.push({ id: 'rider', latitude: tracking.location.latitude, longitude: tracking.location.longitude, label: 'Rider', color: '#2563EB' })

  const updated = tracking.ageSeconds == null ? null : tracking.ageSeconds < 60 ? `${tracking.ageSeconds}s ago` : `${Math.round(tracking.ageSeconds / 60)} min ago`

  return (
    <section className="rounded-2xl border border-line bg-white p-3" aria-label="Live delivery tracking">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-sm font-bold">Live tracking</p>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tracking.active ? (tracking.stale ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#15803D]') : 'bg-cream text-muted-ink'}`}>
          {tracking.active ? (tracking.stale ? 'Location stale' : 'Live') : 'Tracking closed'}
        </span>
      </div>

      {markers.length ? (
        <div className="mt-2"><TrackingMap markers={markers} route={tracking.route} height={height} fitKey={`${order.id}-${markers.map(marker => marker.id).join(',')}`} /></div>
      ) : (
        <p className="mt-2 rounded-xl bg-cream px-3 py-4 text-sm text-muted-ink">Map coordinates are not available for this order yet. The rider can still deliver using the address.</p>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-cream px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-ink">Status</dt>
          <dd className="mt-0.5 text-xs font-bold">{STATUS_LABEL[order.status] ?? order.status}</dd>
        </div>
        <div className="rounded-xl bg-cream px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-ink">{tracking.etaTarget === 'pickup' ? 'Pickup ETA' : 'Arrival'}</dt>
          <dd className="mt-0.5 text-xs font-bold">{tracking.etaMinutes == null ? 'Unavailable' : `${tracking.etaMinutes} min`}</dd>
        </div>
        <div className="rounded-xl bg-cream px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-ink">Updated</dt>
          <dd className="mt-0.5 text-xs font-bold">{updated ?? 'No ping'}</dd>
        </div>
      </dl>

      {tracking.active && !tracking.location && (
        <p className="mt-2 px-1 text-xs text-muted-ink">Waiting for the rider to share location. Nothing is simulated here.</p>
      )}
      {tracking.stale && (
        <p className="mt-2 rounded-lg bg-[#FEF3C7] px-3 py-2 text-xs text-[#92400E]">Rider location last updated {updated}. The position shown may be behind.</p>
      )}

      {order.rider && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{order.rider.name}</p>
            <p className="text-[11px] text-muted-ink">Your delivery partner</p>
          </div>
          {order.rider.phone && (
            <a href={`tel:${order.rider.phone}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white">
              <Phone className="size-3.5" aria-hidden="true" /> Call
            </a>
          )}
        </div>
      )}

      {tracking.viewer === 'rider' && tracking.customerPhone && (
        <a href={`tel:${tracking.customerPhone}`} className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold">
          <Phone className="size-3.5" aria-hidden="true" /> Call customer
        </a>
      )}
    </section>
  )
}
