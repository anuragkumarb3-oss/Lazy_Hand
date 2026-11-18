'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { BarChart3, Boxes, ClipboardList, LayoutGrid, LogOut, MapPinned, MessageCircle, ReceiptText, Store, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/orders', label: 'Orders', icon: ReceiptText },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/riders', label: 'Riders', icon: MapPinned },
  { href: '/admin/catalog', label: 'Catalog', icon: Boxes },
  { href: '/admin/categories', label: 'Categories', icon: LayoutGrid },
  { href: '/admin/tracking', label: 'Live map', icon: Store },
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/admin/logs', label: 'Logs', icon: ClipboardList },
]

export function AdminShell({ phone, children }: { phone: string | null; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try {
      await fetch('/api/preview/session', { method: 'DELETE' })
      router.replace('/admin')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-sm font-black text-white">LH</span>
            <span className="text-sm font-bold text-neutral-900">Admin console</span>
          </Link>
          <span className="ml-auto hidden text-xs text-neutral-500 sm:block">{phone ? `+91 ${phone}` : 'admin'}</span>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map(item => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
