import type { Metadata } from 'next'
import { AdminTracking } from '@/components/lazyhand/admin-tracking'

export const metadata: Metadata = { title: 'Live tracking · LazyHand admin', robots: { index: false, follow: false } }

export default function AdminTrackingPage() {
  return <AdminTracking />
}
