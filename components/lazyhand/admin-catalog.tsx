'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Empty, money, Pager, Stat } from './admin-ui'

type Product = {
  id: string
  name: string
  brand: string | null
  sku: string | null
  unit: string | null
  price: number
  mrp: number | null
  stock: number
  lowStockThreshold: number
  available: boolean
  vegetarian: boolean | null
  productType: string
  categoryName: string | null
  shopName: string | null
  ownerPhone: string | null
  updatedAt: string
}

type CatalogResponse = {
  products: Product[]
  summary: { products: number; outOfStock: number; lowStock: number; unavailable: number; stockValue: number }
  page: number
  pages: number
  total: number
}

async function fetcher(url: string): Promise<CatalogResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Catalog could not be loaded.')
  return response.json() as Promise<CatalogResponse>
}

export function AdminCatalog() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [stock, setStock] = useState('')
  const [page, setPage] = useState(1)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const query = new URLSearchParams({ page: String(page), limit: '30' })
  if (debouncedQ) query.set('q', debouncedQ)
  if (stock) query.set('stock', stock)

  const { data, error, mutate } = useSWR(`/api/admin/catalog?${query.toString()}`, fetcher, { refreshInterval: 15000, keepPreviousData: true })

  const act = async (product: Product, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusyId(product.id)
    setNotice('')
    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, ...body }),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error || 'Action failed.')
      setNotice(`Saved ${product.name}.`)
      setDrafts(current => { const next = { ...current }; delete next[product.id]; return next })
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
        <h1 className="text-xl font-bold text-neutral-900">Catalog</h1>
        <p className="text-xs text-neutral-500">Every product from every shop, with stock and visibility control.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Products" value={data?.summary.products ?? '—'} hint={`${data?.summary.unavailable ?? 0} hidden`} />
        <Stat label="Low stock" value={data?.summary.lowStock ?? '—'} tone={(data?.summary.lowStock ?? 0) > 0 ? 'warn' : 'default'} />
        <Stat label="Out of stock" value={data?.summary.outOfStock ?? '—'} tone={(data?.summary.outOfStock ?? 0) > 0 ? 'warn' : 'default'} />
        <Stat label="Stock value" value={data ? money(data.summary.stockValue) : '—'} hint="Selling price × stock" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input value={q} onChange={event => setQ(event.target.value)} placeholder="Product, SKU, brand, shop…" className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-neutral-900" />
        </div>
        <select value={stock} onChange={event => { setStock(event.target.value); setPage(1) }} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm">
          <option value="">All stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
          <option value="unavailable">Hidden products</option>
        </select>
      </div>

      {notice ? <p className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">{notice}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p> : null}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 font-semibold">Shop</th>
                <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                <th className="px-4 py-2.5 font-semibold">Stock</th>
                <th className="px-4 py-2.5 font-semibold">Visible</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(data?.products ?? []).map(product => {
                const draft = drafts[product.id]
                const busy = busyId === product.id
                const dirty = draft !== undefined && Number(draft) !== product.stock
                return (
                  <tr key={product.id} className={cn(!product.available && 'bg-neutral-50/70')}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-neutral-900">{product.name}</p>
                      <p className="text-[11px] text-neutral-500">
                        {[product.brand, product.unit, product.categoryName].filter(Boolean).join(' · ') || 'No details'}
                        {product.vegetarian === true ? ' · Veg' : ''}
                      </p>
                      <p className="text-[10px] text-neutral-400">{product.productType} · {product.sku || 'no SKU'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{product.shopName || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold tabular-nums">{money(product.price)}</p>
                      {product.mrp ? <p className="text-[11px] text-neutral-400 line-through">{money(product.mrp)}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={draft ?? String(product.stock)}
                          onChange={event => setDrafts(current => ({ ...current, [product.id]: event.target.value }))}
                          className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs tabular-nums"
                          aria-label={`Stock for ${product.name}`}
                        />
                        {dirty ? <button type="button" disabled={busy} onClick={() => act(product, { action: 'set-stock', stock: Number(draft) })} className="rounded bg-neutral-900 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">Save</button> : null}
                      </div>
                      <p className={cn('mt-0.5 text-[10px]', product.stock === 0 ? 'text-red-600' : product.stock <= product.lowStockThreshold ? 'text-amber-600' : 'text-neutral-400')}>
                        {product.stock === 0 ? 'Out of stock' : product.stock <= product.lowStockThreshold ? `Low (≤ ${product.lowStockThreshold})` : 'In stock'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(product, { action: 'toggle-availability', available: !product.available })}
                        className={cn('relative h-5 w-9 rounded-full transition-colors disabled:opacity-50', product.available ? 'bg-emerald-500' : 'bg-neutral-300')}
                        aria-label={product.available ? 'Hide product' : 'Show product'}
                      >
                        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', product.available ? 'left-[18px]' : 'left-0.5')} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(product, { action: 'delete' }, `Permanently delete ${product.name}? Past order lines keep their copy.`)}
                        className="rounded-md border border-red-200 p-1.5 text-red-600 disabled:opacity-50"
                        aria-label={`Delete ${product.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data && !data.products.length ? <Empty>No products match this filter. Shopkeepers add products from the seller app.</Empty> : null}
          {!data && !error ? <Empty>Loading catalog…</Empty> : null}
        </div>
        {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
      </div>
    </div>
  )
}
