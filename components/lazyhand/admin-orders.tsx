'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react'
import { ago, Empty, LiveDot, money, Pager, StatusPill, when } from './admin-ui'
import { cn } from '@/lib/utils'

type AdminOrder = {
  id: string
  status: string
  customerName: string
  customerPhone: string | null
  address: string
  shopName: string
  shopPhone: string | null
  riderName: string | null
  riderPhone: string | null
  total: number
  itemTotal: number
  deliveryFee: number
  platformFee: number
  riderPayout: number
  sellerPayout: number
  payment: string
  itemCount: number
  routeDistanceKm: number | null
  placedAt: string
  pickedUpAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  updatedAt: string
}

type OrdersResponse = { orders: AdminOrder[]; page: number; pages: number; total: number; generatedAt: string }

type Detail = {
  order: {
    id: string
    status: string
    customer: { id: string; name: string; phone: string | null; address: string }
    shop: { id: string; name: string; phone: string | null; type: string | null }
    rider: { id: string; name: string; phone: string | null; vehicle: string | null } | null
    lines: { name?: string; quantity?: number; qty?: number; price?: number; unit?: string; variant?: string }[]
    payment: string
    totals: { itemTotal: number; deliveryFee: number; platformFee: number; riderPayout: number; sellerPayout: number; sellerDeliveryDeduction: number; sellerCommission: number; total: number }
    route: { distanceKm: number | null; durationMinutes: number | null; pickup: { latitude: number; longitude: number } | null; drop: { latitude: number; longitude: number } | null }
    placedAt: string
    assignedAt: string | null
    pickedUpAt: string | null
    deliveredAt: string | null
    cancelledAt: string | null
  }
  events: { id: number; actor_role: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string }[]
  paymentRows: { method: string; amount: number; status: string; provider_reference: string | null; collected_at: string | null }[]
  messages: { id: number; recipient: string; kind: string; status: string; body: string; error: string | null; created_at: string }[]
  location: { latitude: number; longitude: number; updatedAt: string } | null
  review: { rating: number; comment: string } | null
}

async function ordersFetcher(url: string): Promise<OrdersResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Orders could not be loaded.')
  return response.json() as Promise<OrdersResponse>
}

async function detailFetcher(url: string): Promise<Detail> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Order detail could not be loaded.')
  return response.json() as Promise<Detail>
}

const FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active only' },
  { value: 'placed', label: 'Placed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'ready', label: 'Ready' },
  { value: 'picked', label: 'Picked up' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function AdminOrders() {
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [debouncedQ, setDebouncedQ] = useState(q)
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [q])

  useEffect(() => { setPage(1) }, [status, from, to])

  const query = new URLSearchParams({ page: String(page), limit: '25' })
  if (debouncedQ) query.set('q', debouncedQ)
  if (status) query.set('status', status)
  if (from) query.set('from', from)
  if (to) query.set('to', to)

  const { data, error, isValidating } = useSWR(`/api/admin/orders?${query.toString()}`, ordersFetcher, { refreshInterval: 8000, keepPreviousData: true })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Orders</h1>
          <p className="text-xs text-neutral-500">Every order, its money split, rider and event trail.</p>
        </div>
        <LiveDot loading={isValidating} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            value={q}
            onChange={event => setQ(event.target.value)}
            placeholder="Order ID, customer, shop, phone…"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm">
          {FILTERS.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
        </select>
        <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm" aria-label="From date" />
        <input type="date" value={to} onChange={event => setTo(event.target.value)} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm" aria-label="To date" />
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p> : null}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Order</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Shop</th>
                <th className="px-4 py-2.5 font-semibold">Rider</th>
                <th className="px-4 py-2.5 font-semibold">Route</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(data?.orders ?? []).map(order => (
                <tr key={order.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => setOpenId(order.id)}>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold text-neutral-900">{order.id}</p>
                    <p className="text-[11px] text-neutral-500">{when(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-neutral-800">{order.customerName || '—'}</p>
                    <p className="text-[11px] text-neutral-500">{order.customerPhone ? `+91 ${order.customerPhone}` : order.address}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{order.shopName || '—'}</td>
                  <td className="px-4 py-3">
                    {order.riderName ? <><p className="text-neutral-800">{order.riderName}</p><p className="text-[11px] text-neutral-500">{order.riderPhone ? `+91 ${order.riderPhone}` : ''}</p></> : <span className="text-xs text-neutral-400">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">{order.routeDistanceKm == null ? '—' : `${order.routeDistanceKm.toFixed(2)} km`}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold tabular-nums">{money(order.total)}</p>
                    <p className="text-[11px] uppercase text-neutral-500">{order.payment}</p>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={order.status} /></td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{ago(order.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.orders.length ? <Empty>No orders match these filters.</Empty> : null}
          {!data && !error ? <Empty>Loading orders…</Empty> : null}
        </div>
        {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
      </div>

      {openId ? <OrderDrawer id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  )
}

function OrderDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, mutate } = useSWR(`/api/admin/orders/${encodeURIComponent(id)}`, detailFetcher, { refreshInterval: 10000 })
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [markingPaid, setMarkingPaid] = useState(false)
  const [payError, setPayError] = useState('')

  const pendingPayment = data?.paymentRows.find(row => row.status === 'pending')

  const markPaid = async () => {
    const reference = window.prompt('Enter the UPI/bank reference (UTR) from your statement, if available. Leave blank to skip.')
    if (reference === null) return
    setMarkingPaid(true)
    setPayError('')
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-paid', reference }),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error || 'The payment could not be marked collected.')
      await mutate()
    } catch (caught) {
      setPayError(caught instanceof Error ? caught.message : 'The payment could not be marked collected.')
    } finally {
      setMarkingPaid(false)
    }
  }

  const cancelOrder = async () => {
    const reason = window.prompt('Reason for cancelling this order? (optional)')
    if (reason === null) return
    setCancelling(true)
    setCancelError('')
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason }),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error || 'The order could not be cancelled.')
      await mutate()
    } catch (caught) {
      setCancelError(caught instanceof Error ? caught.message : 'The order could not be cancelled.')
    } finally {
      setCancelling(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
          <div>
            <p className="font-mono text-sm font-bold text-neutral-900">{id}</p>
            <p className="text-[11px] text-neutral-500">Full order record</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md border border-neutral-200 p-1.5 text-neutral-600 hover:bg-neutral-50"><X className="h-4 w-4" /></button>
        </header>

        {error ? <p className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error.message}</p> : null}
        {!data && !error ? <p className="p-6 text-sm text-neutral-500">Loading order…</p> : null}

        {data ? (
          <div className="space-y-5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={data.order.status} />
              <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] uppercase text-neutral-600">{data.order.payment}</span>
              <span className="text-xs text-neutral-500">Placed {when(data.order.placedAt)}</span>
              {['placed', 'accepted', 'ready', 'picked'].includes(data.order.status) ? (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={cancelOrder}
                  className="ml-auto rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling…' : 'Cancel order'}
                </button>
              ) : null}
            </div>
            {cancelError ? <p className="text-xs font-medium text-red-600">{cancelError}</p> : null}

            <section className="grid gap-3 rounded-xl border border-neutral-200 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Customer</p>
                <p className="font-medium text-neutral-900">{data.order.customer.name || '—'}</p>
                <p className="text-xs text-neutral-600">{data.order.customer.phone ? `+91 ${data.order.customer.phone}` : 'No phone'}</p>
                <p className="mt-1 text-xs text-neutral-600">{data.order.customer.address}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Shop</p>
                <p className="font-medium text-neutral-900">{data.order.shop.name || '—'}</p>
                <p className="text-xs text-neutral-600">{data.order.shop.phone ? `+91 ${data.order.shop.phone}` : 'No phone'}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Rider</p>
                <p className="text-sm text-neutral-900">{data.order.rider ? `${data.order.rider.name || 'Rider'}${data.order.rider.vehicle ? ` · ${data.order.rider.vehicle}` : ''}` : 'Not assigned'}</p>
                <p className="text-xs text-neutral-600">{data.order.rider?.phone ? `+91 ${data.order.rider.phone}` : ''}</p>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Items</h3>
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                {data.order.lines.map((line, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-neutral-800">{line.qty ?? line.quantity ?? 1} × {line.name ?? 'Item'}{line.variant ? ` (${line.variant})` : ''}</span>
                    <span className="tabular-nums text-neutral-600">{money((line.price ?? 0) * (line.qty ?? line.quantity ?? 1))}</span>
                  </li>
                ))}
                {!data.order.lines.length ? <li className="px-3 py-4 text-sm text-neutral-500">No line items stored.</li> : null}
              </ul>
            </section>

            <section className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-200 p-3 text-sm sm:grid-cols-3">
              {[
                ['Items', data.order.totals.itemTotal],
                ['Delivery fee', data.order.totals.deliveryFee],
                ['Platform fee', data.order.totals.platformFee],
                ['Rider payout', data.order.totals.riderPayout],
                ['Shop fee (5%)', data.order.totals.sellerCommission],
                ['Shop payout', data.order.totals.sellerPayout],
                ['Total', data.order.totals.total],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
                  <p className="font-semibold tabular-nums text-neutral-900">{money(value as number)}</p>
                </div>
              ))}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">Route</p>
                <p className="font-semibold text-neutral-900">{data.order.route.distanceKm == null ? 'Not routed' : `${data.order.route.distanceKm.toFixed(2)} km · ${data.order.route.durationMinutes ?? '—'} min`}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">GPS</p>
                <p className="font-semibold text-neutral-900">{data.location ? `${data.location.latitude.toFixed(4)}, ${data.location.longitude.toFixed(4)}` : 'No ping'}</p>
                <p className="text-[10px] text-neutral-500">{data.location ? ago(data.location.updatedAt) : ''}</p>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Payment</h3>
                {pendingPayment ? (
                  <button
                    type="button"
                    disabled={markingPaid}
                    onClick={markPaid}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-50"
                  >
                    {markingPaid ? 'Marking…' : 'Mark paid (verify)'}
                  </button>
                ) : null}
              </div>
              {payError ? <p className="mb-2 text-xs font-medium text-red-600">{payError}</p> : null}
              <ul className="space-y-2">
                {data.paymentRows.map((row, index) => (
                  <li key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-2.5 text-xs">
                    <span className="font-semibold uppercase text-neutral-700">{row.method}</span>
                    <span className="tabular-nums text-neutral-700">{money(row.amount)}</span>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      row.status === 'collected' ? 'bg-emerald-100 text-emerald-700'
                        : row.status === 'failed' || row.status === 'refunded' ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700',
                    )}>{row.status}</span>
                    {row.provider_reference ? <span className="w-full font-mono text-[10px] text-neutral-500">ref {row.provider_reference}</span> : null}
                    {row.collected_at ? <span className="w-full text-[10px] text-neutral-400">collected {when(row.collected_at)}</span> : null}
                  </li>
                ))}
                {!data.paymentRows.length ? <li className="text-sm text-neutral-500">No payment record.</li> : null}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Event trail</h3>
              <ol className="space-y-2 border-l-2 border-neutral-100 pl-3">
                {data.events.map(event => (
                  <li key={event.id} className="relative text-sm">
                    <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-neutral-400" />
                    <p className="font-medium text-neutral-800">
                      {event.from_status ? `${event.from_status} → ` : ''}{event.to_status ?? 'event'}
                      <span className="ml-2 text-[11px] font-normal text-neutral-500">{event.actor_role}</span>
                    </p>
                    <p className="text-[11px] text-neutral-500">{when(event.created_at)}{event.note ? ` · ${event.note}` : ''}</p>
                  </li>
                ))}
                {!data.events.length ? <li className="text-sm text-neutral-500">No events recorded.</li> : null}
              </ol>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">WhatsApp messages</h3>
              <ul className="space-y-2">
                {data.messages.map(message => (
                  <li key={message.id} className="rounded-lg border border-neutral-200 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-neutral-800">{message.kind} → {message.recipient}</span>
                      <StatusPill status={message.status} />
                    </div>
                    <p className="mt-1 whitespace-pre-line text-neutral-600">{message.body}</p>
                    {message.error ? <p className="mt-1 text-red-600">{message.error}</p> : null}
                    <p className="mt-1 text-[10px] text-neutral-400">{when(message.created_at)}</p>
                  </li>
                ))}
                {!data.messages.length ? <li className="text-sm text-neutral-500">No messages for this order.</li> : null}
              </ul>
            </section>

            {data.review ? (
              <section className="rounded-xl border border-neutral-200 p-3 text-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer review</h3>
                <p className="mt-1 font-semibold text-neutral-900">{data.review.rating}★</p>
                <p className="text-neutral-600">{data.review.comment || 'No comment.'}</p>
              </section>
            ) : null}

            <p className="flex items-center gap-1 pb-4 text-[11px] text-neutral-400">
              <ArrowLeft className="h-3 w-3" /> Read-only record <ArrowRight className="h-3 w-3" /> changes happen in the customer, shop and rider apps
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  )
}
