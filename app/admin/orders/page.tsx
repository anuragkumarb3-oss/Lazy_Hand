import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AdminOrders } from '@/components/lazyhand/admin-orders'

export const metadata: Metadata = { title: 'Orders · LazyHand admin', robots: { index: false, follow: false } }

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading orders…</p>}>
      <AdminOrders />
    </Suspense>
  )
}
