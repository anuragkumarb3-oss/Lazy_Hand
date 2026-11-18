import type { Metadata } from 'next'
import { currentUser, isAdminUser, normalizePhone } from '@/lib/authz'
import { AdminLogin } from '@/components/lazyhand/admin-login'
import { AdminShell } from '@/components/lazyhand/admin-shell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin · LazyHand',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  const admin = await isAdminUser(user)
  if (!admin) return <AdminLogin />
  return <AdminShell phone={normalizePhone(user?.phone)}>{children}</AdminShell>
}
