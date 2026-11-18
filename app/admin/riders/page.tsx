import type { Metadata } from 'next'
import { AdminRiders } from '@/components/lazyhand/admin-riders'

export const metadata: Metadata = { title: 'Riders · LazyHand admin', robots: { index: false, follow: false } }

export default function AdminRidersPage() {
  return <AdminRiders />
}
