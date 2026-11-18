import type { Metadata } from 'next'
import { AdminUsers } from '@/components/lazyhand/admin-users'

export const metadata: Metadata = { title: 'Users · LazyHand admin', robots: { index: false, follow: false } }

export default function AdminUsersPage() {
  return <AdminUsers />
}
