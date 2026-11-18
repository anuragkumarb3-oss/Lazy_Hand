'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Search, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ago, Empty, money, Pager, StatusPill } from './admin-ui'

type AdminUser = {
  id: string
  phone: string
  name: string
  role: 'customer' | 'shopkeeper' | 'rider'
  shopName: string | null
  shopType: string | null
  vehicle: string | null
  village: string | null
  suspended: boolean
  updatedAt: string
  ordersAsCustomer: number
  spent: number
  shopOrders: number
  shopDelivered: number
  deliveries: number
  riderEarnings: number
  lastPing: string | null
  sellerStatus: string | null
  isAdmin: boolean
}

type UsersResponse = { users: AdminUser[]; page: number; pages: number; total: number }

async function fetcher(url: string): Promise<UsersResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Users could not be loaded.')
  return response.json() as Promise<UsersResponse>
}

const ROLE_TONE: Record<string, string> = {
  customer: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  shopkeeper: 'bg-sky-50 text-sky-700 border-sky-200',
  rider: 'bg-violet-50 text-violet-700 border-violet-200',
}

export function AdminUsers() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const query = new URLSearchParams({ page: String(page), limit: '25' })
  if (debouncedQ) query.set('q', debouncedQ)
  if (role) query.set('role', role)

  const { data, error, mutate } = useSWR(`/api/admin/users?${query.toString()}`, fetcher, { refreshInterval: 15000, keepPreviousData: true })

  const act = async (user: AdminUser, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusyId(user.id)
    setNotice('')
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error || 'Action failed.')
      setNotice(`${String(body.action).replace(/-/g, ' ')} saved for ${user.name || user.phone}.`)
      await mutate()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Users</h1>
        <p className="text-xs text-neutral-500">Customers, shops and riders — with their real activity and account controls.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input value={q} onChange={event => setQ(event.target.value)} placeholder="Name, phone, shop, village…" className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-neutral-900" />
        </div>
        <select value={role} onChange={event => { setRole(event.target.value); setPage(1) }} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm">
          <option value="">All roles</option>
          <option value="customer">Customers</option>
          <option value="shopkeeper">Shops</option>
          <option value="rider">Riders</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {notice ? <p className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">{notice}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p> : null}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Account</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Activity</th>
                <th className="px-4 py-2.5 font-semibold">Money</th>
                <th className="px-4 py-2.5 font-semibold">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(data?.users ?? []).map(user => {
                const busy = busyId === user.id
                return (
                  <tr key={user.id} className={cn('align-top', user.suspended && 'bg-red-50/40')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-neutral-900">{user.name || 'Unnamed'}</p>
                        {user.isAdmin ? <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Admin</span> : null}
                        {user.suspended ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Suspended</span> : null}
                      </div>
                      <p className="text-xs text-neutral-600">+91 {user.phone || '—'}</p>
                      <p className="text-[11px] text-neutral-500">
                        {user.shopName ? `${user.shopName} · ${user.shopType ?? 'shop'}` : user.vehicle ? `Rider · ${user.vehicle}` : user.village || 'No address'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize', ROLE_TONE[user.role])}>{user.role}</span>
                      {user.sellerStatus ? <p className="mt-1"><StatusPill status={user.sellerStatus} /></p> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      <p>{user.ordersAsCustomer} orders · {money(user.spent)} spent</p>
                      {user.role === 'shopkeeper' ? <p>{user.shopOrders} received · {user.shopDelivered} delivered</p> : null}
                      {user.role === 'rider' ? <p>{user.deliveries} deliveries · last GPS {ago(user.lastPing)}</p> : null}
                      <p className="text-[11px] text-neutral-400">Active {ago(user.updatedAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {user.role === 'rider' ? <p className="font-semibold text-neutral-900">{money(user.riderEarnings)} earned</p> : null}
                      {user.role === 'shopkeeper' ? <p>Payout tracked per order</p> : null}
                      {user.role === 'customer' ? <p>Cash on delivery</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {user.sellerStatus === 'pending' ? (
                          <>
                            <button type="button" disabled={busy} onClick={() => act(user, { action: 'approve-seller', businessType: (user.shopType || 'grocery').toLowerCase() })} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">Approve shop</button>
                            <button type="button" disabled={busy} onClick={() => act(user, { action: 'reject-seller' }, `Reject the shop request from ${user.name || user.phone}?`)} className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-700 disabled:opacity-50">Reject</button>
                          </>
                        ) : null}
                        <select
                          value={user.role}
                          disabled={busy}
                          onChange={event => act(user, { action: 'set-role', role: event.target.value }, `Change ${user.name || user.phone} to ${event.target.value}?`)}
                          className="rounded-md border border-neutral-300 px-1.5 py-1 text-[11px]"
                        >
                          <option value="customer">customer</option>
                          <option value="shopkeeper">shopkeeper</option>
                          <option value="rider">rider</option>
                        </select>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(user, { action: user.suspended ? 'restore' : 'suspend' }, user.suspended ? undefined : `Suspend ${user.name || user.phone}? They will not be able to place or accept orders.`)}
                          className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-50', user.suspended ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700')}
                        >
                          {user.suspended ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                          {user.suspended ? 'Restore' : 'Suspend'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(user, { action: user.isAdmin ? 'revoke-admin' : 'make-admin' }, user.isAdmin ? `Remove admin access from ${user.name || user.phone}?` : `Give ${user.name || user.phone} full admin access?`)}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-700 disabled:opacity-50"
                        >
                          {user.isAdmin ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                          {user.isAdmin ? 'Revoke admin' : 'Make admin'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data && !data.users.length ? <Empty>No accounts match this filter.</Empty> : null}
          {!data && !error ? <Empty>Loading accounts…</Empty> : null}
        </div>
        {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
      </div>
    </div>
  )
}
