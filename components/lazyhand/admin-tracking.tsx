'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { RefreshCw } from 'lucide-react'
import { TrackingMap, type TrackingMarker } from './tracking-map'

type ActiveOrder = {
  id: string
  status: string
  customerName: string
  address: string
  total: number
  riderId: string | null
  riderName: string | null
  riderPhone: string | null
  shopName: string
  location: { latitude: number; longitude: number } | null
  updatedAt: string | null
  ageSeconds: number | null
  stale: boolean
}

type TrackingResponse = { orders: ActiveOrder[]; riders: number; active: number; stale: number }

async function fetchAdminTracking(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (response.status === 401 || response.status === 403) {
    const error = new Error('auth')
    Object.assign(error, { status: response.status })
    throw error
  }
  if (!response.ok) throw new Error('Live tracking could not be loaded.')
  return response.json() as Promise<TrackingResponse>
}

function ago(seconds: number | null) {
  if (seconds == null) return 'No ping'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.round(seconds / 60)} min ago`
}

export function AdminTracking() {
  const { data, error, mutate, isValidating } = useSWR('/api/admin/tracking', fetchAdminTracking, { refreshInterval: 10000 })
  const [busy, setBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [phone, setPhone] = useState('9798077838')

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setLoginError('')
    try {
      const response = await fetch('/api/preview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const result = await response.json().catch(() => null) as { error?: string; admin?: boolean } | null
      if (!response.ok) throw new Error(result?.error || 'Preview sign-in failed.')
      if (!result?.admin) throw new Error('That number is not an active admin.')
      await mutate()
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : 'Preview sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    const authError = error.message === 'auth'
    return (
      <main className="mx-auto grid min-h-svh max-w-lg content-center gap-4 p-6">
        <h1 className="text-2xl font-bold">Live rider tracking</h1>
        <p className="text-sm text-muted-ink">{authError ? 'Admin access is required to view rider locations.' : error.message}</p>
        {authError && (
          <form onSubmit={signIn} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-semibold">Preview sign-in (no OTP)</p>
            <input value={phone} onChange={event => setPhone(event.target.value)} inputMode="numeric" maxLength={10} className="h-11 rounded-xl border border-line px-3 text-sm" aria-label="Admin phone number" />
            {loginError && <p role="alert" className="text-xs text-red-700">{loginError}</p>}
            <button type="submit" disabled={busy} className="h-11 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Enter admin panel'}</button>
          </form>
        )}
        <a href="/admin/categories" className="text-sm font-semibold text-brand-deep underline">Back to admin</a>
      </main>
    )
  }

  const orders = data?.orders ?? []
  const located = orders.filter(order => order.location)
  const markers: TrackingMarker[] = located.map(order => ({
    id: `order-${order.id}`,
    latitude: order.location!.latitude,
    longitude: order.location!.longitude,
    label: `#${order.id} ${order.riderName ?? 'rider'}`,
    color: order.stale ? '#B91C1C' : order.status === 'picked' ? '#2563EB' : '#B45309',
  }))

  return (
    <main className="mx-auto min-h-svh max-w-5xl bg-cream px-4 py-8 text-ink">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">LazyHand control center</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Live rider tracking</h1>
          <p className="mt-2 text-sm leading-6 text-muted-ink">Active deliveries only. Locations come from rider devices and are marked stale after 75 seconds.</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/categories" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold">Categories</a>
          <a href="/admin/whatsapp" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold">WhatsApp</a>
          <button type="button" onClick={() => void mutate()} className="grid size-10 place-items-center rounded-xl border border-line bg-white" aria-label="Refresh"><RefreshCw className={`size-4 ${isValidating ? 'animate-spin' : ''}`} /></button>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-line bg-white p-4"><dt className="text-xs text-muted-ink">Active orders</dt><dd className="mt-1 text-2xl font-bold">{data?.active ?? 0}</dd></div>
        <div className="rounded-2xl border border-line bg-white p-4"><dt className="text-xs text-muted-ink">Riders assigned</dt><dd className="mt-1 text-2xl font-bold">{data?.riders ?? 0}</dd></div>
        <div className="rounded-2xl border border-line bg-white p-4"><dt className="text-xs text-muted-ink">Stale locations</dt><dd className="mt-1 text-2xl font-bold">{data?.stale ?? 0}</dd></div>
      </dl>

      {markers.length > 0 ? (
        <div className="mt-5"><TrackingMap markers={markers} height={380} fitKey={markers.map(marker => marker.id).join(',')} /></div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted-ink">No rider locations are being shared right now.</p>
      )}

      <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-white">
        <h2 className="border-b border-line px-4 py-3 text-sm font-bold">Active deliveries</h2>
        {orders.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-ink">No active deliveries.</p>
        ) : (
          <div className="divide-y divide-line">
            {orders.map(order => (
              <article key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">#{order.id} · {order.shopName || 'Shop'}</p>
                  <p className="truncate text-xs text-muted-ink">{order.customerName} · {order.address}</p>
                </div>
                <span className="rounded-full bg-cream px-2.5 py-1 text-[10px] font-semibold uppercase">{order.status}</span>
                <div className="min-w-28 text-right">
                  <p className="text-xs font-semibold">{order.riderName ?? 'Unassigned'}</p>
                  <p className={`text-[11px] ${order.stale ? 'text-[#B91C1C]' : 'text-muted-ink'}`}>{order.riderId ? ago(order.ageSeconds) : 'No rider'}</p>
                </div>
                {order.riderPhone && <a href={`tel:${order.riderPhone}`} className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold">Call</a>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
