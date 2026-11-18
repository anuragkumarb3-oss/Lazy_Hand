import type { Metadata } from 'next'
import { AdminLogs } from '@/components/lazyhand/admin-logs'

export const metadata: Metadata = { title: 'Logs · LazyHand admin', robots: { index: false, follow: false } }

export default function AdminLogsPage() {
  return <AdminLogs />
}
