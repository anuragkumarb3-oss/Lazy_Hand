'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { AlertTriangle, ArrowUpRight, Clock3 } from 'lucide-react'
import { ago, Empty, LiveDot, money, Panel, Stat, StatusPill, timeOf, when } from './admin-ui'

type Overview = {
  generatedAt: string
  kpis: Record<string, number | null>
  statuses: { status: string; count: number; total: number }[]
  payments: { method: string; count: number; total: number }[]
  series: { day: string; orders: number; gmv: number; delivered: number }[]
  recentOrders: { id: string; status: string; customerName: string; shopName: string; riderName: string | null; total: number; payment: string; placedAt: string }[]
  activity: { kind: string; ref: string; title: string; actor: string; subject: string | null; createdAt: string }[]
}

async function fetcher(url: string): Promise<Overview> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(response.status === 403 ? 'Admin access required.' : 'Overview could not be loaded.')
  return response.json() as Promise<Overview>
}

export function AdminOverview() {
  const { data, error, isValidating } = useSWR('/api/admin/overview', fetcher, { refreshInterval: 5000 })
  const k = data?.kpis ?? {}
  const maxOrders = Math.max(1, ...(data?.series ?? []).map(point => point.orders))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Platform overview</h1>
          <p className="text-xs text-neutral-500">
            Every number is read live from PostgreSQL{data ? ` · updated ${timeOf(data.generatedAt)}` : ''}
          </p>
        </div>
        <LiveDot loading={isValidating} />
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders today" value={data ? k.ordersToday : '—'} hint={`${k.activeOrders ?? 0} active right now`} />
        <Stat label="GMV today" value={data ? money(k.gmvToday) : '—'} hint="Excludes cancelled orders" tone="good" />
        <Stat label="Delivered today" value={data ? k.deliveredToday : '—'} hint={`${k.delivered7d ?? 0} in 7 days`} />
        <Stat
          label="Riders online"
          value={data ? k.ridersOnline : '—'}
          hint={`${k.stalePings ?? 0} with stale GPS`}
          tone={(k.stalePings ?? 0) > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Avg delivery time" value={k.avgDeliveryMinutes == null ? '—' : `${k.avgDeliveryMinutes} min`} hint="Delivered in last 7 days" />
        <Stat label="Pending shop requests" value={data ? k.pendingSellers : '—'} hint="Awaiting approval" tone={(k.pendingSellers ?? 0) > 0 ? 'warn' : 'default'} />
        <Stat label="Products low / out" value={data ? `${k.lowStock} / ${k.outOfStock}` : '—'} hint={`${k.products ?? 0} products total`} tone={(k.outOfStock ?? 0) > 0 ? 'warn' : 'default'} />
        <Stat label="WhatsApp failures" value={data ? k.whatsappFailed : '—'} hint={`${k.whatsappSent ?? 0} sent · ${k.whatsappQueued ?? 0} queued`} tone={(k.whatsappFailed ?? 0) > 0 ? 'bad' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Orders · last 7 days" className="lg:col-span-2" action={<span className="text-xs text-neutral-500">{money(data?.series.reduce((sum, point) => sum + point.gmv, 0) ?? 0)} GMV</span>}>
          <div className="flex h-44 items-end gap-3 px-4 pb-2 pt-4">
            {(data?.series ?? []).map(point => (
              <div key={point.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold tabular-nums text-neutral-600">{point.orders}</span>
                <div className="flex w-full items-end justify-center" style={{ height: 110 }}>
                  <div
                    className="w-full max-w-10 rounded-t bg-neutral-900/85 transition-all"
                    style={{ height: `${Math.max(4, (point.orders / maxOrders) * 100)}%` }}
                    title={`${point.orders} orders · ${money(point.gmv)}`}
                  />
                </div>
                <span className="text-[10px] text-neutral-500">{new Date(`${point.day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              </div>
            ))}
            {!data ? <p className="m-auto text-sm text-neutral-400">Loading…</p> : null}
          </div>
        </Panel>

        <Panel title="Orders by status">
          <ul className="divide-y divide-neutral-100">
            {(data?.statuses ?? []).map(row => (
              <li key={row.status} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <StatusPill status={row.status} />
                <span className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">{money(row.total)}</span>
                  <span className="w-8 text-right font-semibold tabular-nums text-neutral-900">{row.count}</span>
                </span>
              </li>
            ))}
            {data && !data.statuses.length ? <Empty>No orders yet.</Empty> : null}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Latest orders"
          className="lg:col-span-2"
          action={<Link href="/admin/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900">All orders <ArrowUpRight className="h-3 w-3" /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Order</th>
                  <th className="px-4 py-2 font-semibold">Customer</th>
                  <th className="px-4 py-2 font-semibold">Shop</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(data?.recentOrders ?? []).map(order => (
                  <tr key={order.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/orders?q=${encodeURIComponent(order.id)}`} className="font-mono text-xs font-semibold text-neutral-900 hover:text-red-600">{order.id}</Link>
                      <p className="text-[11px] text-neutral-500">{when(order.placedAt)}</p>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700">{order.customerName || '—'}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{order.shopName || '—'}</td>
                    <td className="px-4 py-2.5"><StatusPill status={order.status} /></td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{money(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !data.recentOrders.length ? <Empty>No orders have been placed yet.</Empty> : null}
          </div>
        </Panel>

        <Panel title="Live activity log">
          <ul className="max-h-[22rem] divide-y divide-neutral-100 overflow-y-auto">
            {(data?.activity ?? []).map(item => (
              <li key={`${item.kind}-${item.ref}-${item.createdAt}`} className="px-4 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-neutral-800">{item.title}</p>
                    <p className="truncate text-[11px] text-neutral-500">{item.actor} · {ago(item.createdAt)}</p>
                  </div>
                </div>
              </li>
            ))}
            {data && !data.activity.length ? <Empty>No activity recorded yet.</Empty> : null}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers" value={data ? k.customers : '—'} hint={`${k.suspended ?? 0} suspended`} />
        <Stat label="Shops" value={data ? k.shops : '—'} hint={`${k.categories ?? 0} categories`} />
        <Stat label="Riders" value={data ? k.riders : '—'} hint="Registered partners" />
        <Stat label="Platform fees · 7d" value={data ? money(k.platformFees7d) : '—'} hint={`Rider payouts ${data ? money(k.riderPayout7d) : '—'} · 5% of items`} />
      </div>

      <p className="flex items-center gap-1.5 pb-2 text-[11px] text-neutral-400">
        <Clock3 className="h-3 w-3" /> Refresh every 5 seconds · Asia/Kolkata day boundaries
        <AlertTriangle className="ml-2 h-3 w-3" /> Statuses and amounts are never cached
      </p>
    </div>
  )
}
