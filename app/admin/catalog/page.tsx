import type { Metadata } from 'next'
import { AdminCatalog } from '@/components/lazyhand/admin-catalog'

export const metadata: Metadata = { title: 'Catalog · LazyHand admin', robots: { index: false, follow: false } }

export default function AdminCatalogPage() {
  return <AdminCatalog />
}
