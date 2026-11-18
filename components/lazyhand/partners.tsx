'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { Banknote, Bike, Calculator, Check, ClipboardList, Clock3, IndianRupee, MapPin, MessageCircle, Package, Plus, Power, Printer, Search, Store, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { billFor, categories, DEFAULT_DELIVERY_DISTANCE_KM, DELIVERY_SLABS, PLATFORM_FEE_SLABS, deliverySlabFor, rupee, type CategoryId, type Order, type Product } from './data'
import { useLazyHand } from './store'
import { BottomNav, PrimaryButton, SecondaryButton, StatusPill, Toggle } from './ui'
import { TrackingMap } from './tracking-map'
import { LiveTrackingPanel } from './live-tracking'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type ShopHour = { day_of_week: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }
type ShopHourDraft = ShopHour
type ShopSettings = { shop_timezone: string; shop_is_open_override: boolean | null; delivery_estimate_min: number | null; delivery_estimate_max: number | null }
type ShopSettingsResponse = { hours: ShopHour[]; settings: ShopSettings }
const defaultShopSettings: ShopSettings = { shop_timezone: 'Asia/Kolkata', shop_is_open_override: null, delivery_estimate_min: null, delivery_estimate_max: null }

function PartnerHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="border-b border-line bg-white px-4 pb-4 pt-[max(env(safe-area-inset-top),16px)] sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0 border-l-[3px] border-brand pl-3">
          <p className="text-xs font-semibold text-brand-deep">{eyebrow}</p>
          <h1 className="truncate text-lg font-bold tracking-tight text-ink sm:text-xl">{title}</h1>
        </div>
        {right}
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-3.5 sm:p-4">
      <dt className="text-xs font-medium leading-5 text-muted-ink">{label}</dt>
      <dd className="mt-1 truncate text-xl font-bold tracking-tight tabular-nums text-ink sm:text-2xl">{value}</dd>
    </div>
  )
}

function OrderLines({ order }: { order: Order }) {
  return (
    <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-ink">
      {order.lines.map(l => (
        <li key={l.productId} className="flex justify-between">
          <span>
            {l.qty} × {l.name}
          </span>
          <span>{rupee(l.qty * l.price)}</span>
        </li>
      ))}
    </ul>
  )
}

function PreviewNote({ detail }: { detail: string }) {
  return (
    <p role="status" className="mx-auto mt-3 max-w-md px-4 text-xs leading-5 text-muted-ink">
      {detail} Demo only: changes appear immediately but are temporary. No real orders, customers, riders, or payouts are connected.
    </p>
  )
}

function Empty({ Icon, title, detail }: { Icon: typeof Package; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white p-6 text-center">
      <Icon className="mx-auto size-7 text-muted-ink" aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-ink">{detail}</p>
    </div>
  )
}

export function ShopkeeperDashboard({ onExit, previewMode }: { onExit: () => void; previewMode?: boolean }) {
  const { profile, orders: localOrders, setOrderStatus: setLocalOrderStatus } = useLazyHand()
  const [tab, setTab] = useState<'orders' | 'products' | 'earnings' | 'account'>('orders')
  const [productQuery, setProductQuery] = useState('')
  const [productAvailability, setProductAvailability] = useState('all')
  const [productCategory, setProductCategory] = useState('all')
  const [showProfitCalculator, setShowProfitCalculator] = useState(false)
  const [earningsRange, setEarningsRange] = useState<'today' | '7d' | '30d'>('7d')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [orderDateFilter, setOrderDateFilter] = useState('all')
  const [actionError, setActionError] = useState('')
  const { data: sellerData, error: sellerDataError, isLoading: sellerDataLoading, mutate: refreshSellerData } = useSWR(previewMode ? null : '/api/seller', async () => {
    const response = await fetch('/api/seller')
    if (!response.ok) throw new Error('Seller workspace could not be loaded.')
    return response.json() as Promise<{ products: Array<{ id: string; category_id: string; name: string; unit: string; price: number | string; stock: number; is_available: boolean; low_stock_threshold: number; images: string[] }>; categories: Array<{ id: string; name: string }>; orders: Array<{ id: string; lines: Order['lines']; item_total: number | string; delivery_fee: number | string; platform_fee: number | string; seller_delivery_deduction: number | string; seller_commission: number | string; seller_payout: number | string; total: number | string; payment: 'cod'; status: Order['status']; customer_name: string; address: string; rider_name: string | null; rider_phone: string | null; customer_phone: string | null; placed_at: string }> }>
  }, { refreshInterval: 15000 })
  const realOrders: Order[] = (sellerData?.orders ?? []).map(order => ({
    id: order.id, shopId: '', lines: order.lines, itemTotal: Number(order.item_total), deliveryFee: Number(order.delivery_fee),
    platformFee: Number(order.platform_fee), deliveryDistanceKm: 0, riderPayout: 0,
    sellerDeliveryDeduction: Number(order.seller_delivery_deduction), sellerCommission: Number(order.seller_commission), sellerPayout: Number(order.seller_payout),
    total: Number(order.total), payment: order.payment, status: order.status,
    placedAt: order.placed_at, customerName: order.customer_name,
    address: order.address, riderName: order.rider_name ?? undefined,
    riderPhone: order.rider_phone ?? undefined, customerPhone: order.customer_phone ?? undefined,
  }))
  // In the preview there is no real shop, so orders placed from the demo
  // catalog (TEST… ids) never reach the DB. Surface them here so the
  // customer → seller → earnings flow is demonstrable end to end.
  const demoOrders = localOrders.filter(order => order.id.startsWith('TEST'))
  const shopOrders: Order[] = previewMode ? [...demoOrders, ...realOrders] : realOrders
  const incoming = shopOrders.filter(order => order.status === 'placed')
  const packing = shopOrders.filter(order => order.status === 'accepted')
  const ready = shopOrders.filter(order => order.status === 'ready')
  const outForDelivery = shopOrders.filter(order => order.status === 'picked')
  const completed = shopOrders.filter(order => order.status === 'delivered')
  const visibleOrders = shopOrders.filter(order => {
    const placed = new Date(order.placedAt)
    const dateMatches = orderDateFilter === 'all' || (orderDateFilter === 'today' && placed.toDateString() === new Date().toDateString()) || (orderDateFilter === '7d' && placed >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) || (orderDateFilter === '30d' && placed >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    return dateMatches && (orderStatusFilter === 'all' || order.status === orderStatusFilter)
  })
  const revenue = shopOrders.filter(order => order.status !== 'rejected').reduce((sum, order) => sum + order.itemTotal, 0)
  const myProducts = sellerData?.products ?? []
  const visibleProducts = myProducts.filter(product => {
    const statusMatches = productAvailability === 'all' || (productAvailability === 'in-stock' && product.stock > 0 && product.is_available) || (productAvailability === 'low-stock' && product.stock > 0 && product.stock <= product.low_stock_threshold) || (productAvailability === 'unavailable' && (!product.is_available || product.stock === 0))
    return product.name.toLowerCase().includes(productQuery.toLowerCase()) && statusMatches && (productCategory === 'all' || product.category_id === productCategory)
  })
  const inStockCount = myProducts.filter(product => product.stock > 0 && product.is_available).length
  const rangeStart = new Date()
  rangeStart.setHours(0, 0, 0, 0)
  if (earningsRange === '7d') rangeStart.setDate(rangeStart.getDate() - 6)
  if (earningsRange === '30d') rangeStart.setDate(rangeStart.getDate() - 29)
  const periodOrders = (sellerData?.orders ?? []).filter(order => new Date(order.placed_at) >= rangeStart && order.status !== 'rejected')
  const salesByDay = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const total = (sellerData?.orders ?? []).filter(order => new Date(order.placed_at).toDateString() === date.toDateString() && order.status !== 'rejected').reduce((sum, order) => sum + Number(order.item_total), 0)
    return { key: date.toISOString(), label: date.toLocaleDateString('en-IN', { weekday: 'short' }), total }
  })
  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    setActionError('')
    if (orderId.startsWith('TEST')) {
      setLocalOrderStatus(orderId, status)
      return
    }
    const response = await fetch('/api/seller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, status }) })
    if (!response.ok) {
      setActionError('Order status could not be updated. Refresh and try again.')
      return
    }
    await refreshSellerData()
  }

  return (
    <div className="min-h-svh bg-[#F7F8FA] pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-ink">
      <PartnerHeader eyebrow="Seller workspace" title={profile.shopName || 'Your shop'} right={<span className="rounded-full border border-line bg-[#F7F8FA] px-3 py-1.5 text-xs font-semibold text-muted-ink">Shop account</span>} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7">
        {tab === 'orders' && !previewMode && <>
          <section className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-ink">Orders</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-[28px]">Your shop, at a glance</h2>
          </section>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="New orders" value={String(incoming.length)} />
            <Stat label="Today’s orders" value={String(shopOrders.filter(order => new Date(order.placedAt).toDateString() === new Date().toDateString()).length)} />
            <Stat label="Sales in loaded orders" value={rupee(revenue)} />
            <Stat label="In progress" value={String(incoming.length + packing.length + ready.length + outForDelivery.length)} />
          </dl>
          {sellerDataError && <p role="alert" className="rounded-xl border border-[#F4C7C7] bg-[#FCE8E8] p-3 text-sm text-[#7F1D1D]">Seller data could not load. Refresh to try again.</p>}
          <section aria-labelledby="quick-actions-heading">
            <h2 id="quick-actions-heading" className="mb-3 text-lg font-bold">Quick actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <a href="/seller/catalog" className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-sm font-semibold"><Plus className="size-5 text-brand" aria-hidden="true" />Add product</a>
              <button type="button" onClick={() => setTab('products')} className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left text-sm font-semibold"><Package className="size-5 text-brand" aria-hidden="true" />Manage products</button>
              <button type="button" onClick={() => setTab('earnings')} className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left text-sm font-semibold"><Banknote className="size-5 text-brand" aria-hidden="true" />View earnings</button>
              <button type="button" onClick={() => setTab('account')} className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left text-sm font-semibold"><Store className="size-5 text-brand" aria-hidden="true" />Shop settings</button>
            </div>
          </section>
        </>}

        {tab === 'orders' && previewMode && <SellerOrderPrototype shopName={profile.shopName || 'Your shop'} />}

        {tab === 'orders' && !previewMode && (
          <>
            <section aria-labelledby="order-management-heading">
              <div className="mb-3"><h2 id="order-management-heading" className="text-lg font-bold">Order management</h2><p className="mt-0.5 text-sm text-muted-ink">Orders retrieved from your shop account.</p></div>
              <div className="mb-3 grid grid-cols-2 gap-2"><label className="flex flex-col gap-1 text-xs font-medium text-muted-ink">Status<select value={orderStatusFilter} onChange={event => setOrderStatusFilter(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-2 text-sm text-ink"><option value="all">All statuses</option>{['placed', 'accepted', 'ready', 'picked', 'delivered', 'rejected'].map(status => <option key={status} value={status}>{status}</option>)}</select></label><label className="flex flex-col gap-1 text-xs font-medium text-muted-ink">Date<select value={orderDateFilter} onChange={event => setOrderDateFilter(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-2 text-sm text-ink"><option value="all">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label></div>
              {actionError && <p role="alert" className="mb-3 rounded-xl bg-[#FCE8E8] p-3 text-sm text-[#7F1D1D]">{actionError}</p>}
              {sellerDataLoading ? <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted-ink">Loading your orders…</p> : null}
              {sellerDataError ? <Empty Icon={ClipboardList} title="Orders could not be loaded" detail="Check your connection and refresh this page." /> : null}
              {!sellerDataLoading && !sellerDataError && visibleOrders.length === 0 ? <Empty Icon={ClipboardList} title={shopOrders.length ? 'No matching orders' : 'No orders yet'} detail={shopOrders.length ? 'Change the status or date filters to see more orders.' : 'New customer orders for your shop will appear here.'} /> : null}
              <div className="flex flex-col gap-3">
                {visibleOrders.map(order => <article key={order.id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold">Order #{order.id}</p><p className="mt-1 text-xs text-muted-ink">{order.customerName} · {order.payment.toUpperCase()} · {new Date(order.placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><div className="text-right"><StatusPill tone={order.status === 'placed' ? 'warn' : order.status === 'delivered' ? 'open' : 'info'}>{order.status}</StatusPill><p className="mt-2 text-base font-bold">{rupee(order.itemTotal)}</p></div></div>
                  <OrderLines order={order} />
                  <p className="mt-3 text-xs leading-5 text-muted-ink">Payment status: COD · {order.status === 'delivered' ? 'completed' : 'collection status is recorded with delivery'}</p>
                  {order.status === 'placed' && <div className="mt-3 flex gap-2"><SecondaryButton onClick={() => void updateOrderStatus(order.id, 'rejected')} className="h-11 text-sm text-[#B91F1F]">Reject</SecondaryButton><PrimaryButton onClick={() => void updateOrderStatus(order.id, 'accepted')} className="h-11 text-sm">Accept order</PrimaryButton></div>}
                  {order.status === 'accepted' && <PrimaryButton onClick={() => void updateOrderStatus(order.id, 'ready')} className="mt-3 h-11">Mark ready for pickup</PrimaryButton>}
                  {order.riderName && ['accepted', 'ready', 'picked'].includes(order.status) && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#EFF6FF] px-3 py-2.5 text-xs">
                      <span><strong className="text-[#1E3A8A]">Rider {order.riderName}</strong>{order.riderPhone ? <span className="text-muted-ink"> · +91 {order.riderPhone}</span> : null}</span>
                      {order.riderPhone ? <a href={`tel:${order.riderPhone}`} className="rounded-lg border border-[#BFDBFE] bg-white px-2.5 py-1.5 font-semibold text-[#1E3A8A]">Call rider</a> : null}
                    </div>
                  )}
                  {!order.riderName && ['accepted', 'ready'].includes(order.status) && (
                    <div className="mt-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-xs leading-5 text-[#92400E]">
                      No rider has accepted yet. You can arrange your own delivery partner or deliver this order yourself.
                      {order.customerPhone ? <> <a href={`tel:${order.customerPhone}`} className="font-semibold underline underline-offset-2">Call customer</a></> : null}
                    </div>
                  )}
                  {['accepted', 'ready', 'picked'].includes(order.status) && (
                    <div className="mt-3">
                      {order.status === 'picked' && <p className="mb-2 rounded-lg bg-[#F0FDF4] px-3 py-2 text-xs font-semibold text-[#166534]">Rider collected this order. Live rider location is hidden from sellers after pickup.</p>}
                      <LiveTrackingPanel orderId={order.id} height={180} />
                    </div>
                  )}
                </article>)}
              </div>
            </section>
          </>
        )}

        {tab === 'products' && (
          <section aria-labelledby="products-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="products-heading" className="text-xl font-bold">Products & inventory</h2><p className="mt-1 text-sm text-muted-ink">Manage real listings and stock for {profile.shopName || 'your shop'}.</p></div><a href="/seller/catalog" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep"><Plus className="size-4" aria-hidden="true" /> Add product</a></div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Total products" value={String(myProducts.length)} /><Stat label="In stock" value={String(inStockCount)} /><Stat label="Low stock" value={String(myProducts.filter(product => product.stock > 0 && product.stock <= product.low_stock_threshold).length)} /><Stat label="Unavailable" value={String(myProducts.filter(product => !product.is_available || product.stock === 0).length)} /></dl>
            <label className="flex h-12 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"><Search className="size-4 text-muted-ink" aria-hidden="true" /><span className="sr-only">Search your products</span><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-ink" /></label>
            <div className="grid grid-cols-2 gap-2"><label className="flex flex-col gap-1 text-xs font-medium text-muted-ink">Availability<select value={productAvailability} onChange={event => setProductAvailability(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-2 text-sm text-ink"><option value="all">All products</option><option value="in-stock">In stock</option><option value="low-stock">Low stock</option><option value="unavailable">Unavailable</option></select></label><label className="flex flex-col gap-1 text-xs font-medium text-muted-ink">Category<select value={productCategory} onChange={event => setProductCategory(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-2 text-sm text-ink"><option value="all">All categories</option>{sellerData?.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
            {sellerDataLoading ? <p className="rounded-xl border border-line bg-white p-4 text-sm text-muted-ink">Loading your catalog…</p> : null}
            {sellerDataError ? <Empty Icon={Package} title="Catalog could not be loaded" detail="Check your connection and refresh this page." /> : null}
            {!sellerDataLoading && !sellerDataError && visibleProducts.length === 0 ? <Empty Icon={Package} title={myProducts.length ? 'No matching products' : 'Your catalog is empty'} detail={myProducts.length ? 'Try another search.' : 'Add your first product to start building your catalog.'} /> : null}
            <ul className="grid gap-3 sm:grid-cols-2">{visibleProducts.map(product => {
              const categoryName = sellerData?.categories.find(category => category.id === product.category_id)?.name ?? 'Uncategorized'
              const status = !product.is_available || product.stock === 0 ? 'Unavailable' : product.stock <= 5 ? 'Low stock' : 'In stock'
              return <li key={product.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
                {product.images?.[0] ? <img src={product.images[0]} alt={product.name} className="size-16 shrink-0 rounded-xl object-cover" /> : <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#F7F8FA] text-brand"><Package className="size-6" aria-hidden="true" /></span>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.name}</p><p className="mt-1 truncate text-xs text-muted-ink">{categoryName}{product.unit ? ` · ${product.unit}` : ''}</p><p className="mt-1 text-base font-bold">{rupee(Number(product.price))}</p><p className={cn('mt-1 text-xs font-semibold', status === 'In stock' ? 'text-[#15803D]' : status === 'Low stock' ? 'text-[#A16207]' : 'text-[#B91F1F]')}>{status} · {product.stock} units</p></div>
                <a href="/seller/catalog" className="inline-flex min-h-10 shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-brand-deep hover:bg-[#FCE8E8]">Edit</a>
              </li>
            })}</ul>
            {previewMode && <section aria-labelledby="sample-products-heading" className="flex flex-col gap-3 rounded-2xl border border-dashed border-[#FDBA74] bg-[#FFFAF5] p-4">
              <div><p className="text-sm font-bold uppercase tracking-wide text-brand">Sample catalog</p><h3 id="sample-products-heading" className="mt-1 text-lg font-bold">Prototype products</h3><p className="mt-1 text-sm text-muted-ink">Illustrative inventory only; these items are not saved to your catalog.</p></div>
              <ul className="grid gap-3 sm:grid-cols-2">{[
                { name: 'Aashirvaad Atta', detail: 'Staples · 5 kg', price: 260, stock: 18 },
                { name: 'Amul Toned Milk', detail: 'Dairy · 500 ml', price: 28, stock: 24 },
                { name: 'Farm Eggs', detail: 'Dairy · Pack of 6', price: 54, stock: 8 },
                { name: 'Tata Salt', detail: 'Staples · 1 kg', price: 28, stock: 3 },
              ].map(product => <li key={product.name} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#FFF7ED] text-brand"><Package className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.name}</p><p className="mt-1 text-sm text-muted-ink">{product.detail}</p><p className="mt-1 text-base font-bold">{rupee(product.price)}</p></div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold', product.stock <= 5 ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#166534]')}>{product.stock} in stock</span>
              </li>)}</ul>
            </section>}
          </section>
        )}

        {tab === 'earnings' && (
          <section className="flex flex-col gap-4" aria-labelledby="earnings-heading">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="earnings-heading" className="text-xl font-bold">Earnings</h2><p className="mt-1 text-sm text-muted-ink">Actual order totals, not profit estimates.</p></div><label className="flex flex-col gap-1 text-xs font-medium text-muted-ink">Period<select value={earningsRange} onChange={event => setEarningsRange(event.target.value as 'today' | '7d' | '30d')} className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label></div>
            <dl className="grid grid-cols-2 gap-3"><Stat label="Gross sales" value={rupee(periodOrders.reduce((total, order) => total + Number(order.item_total), 0))} /><Stat label="Seller earnings" value={rupee(periodOrders.reduce((total, order) => total + Number(order.seller_payout), 0))} /><Stat label="Platform fee (5%)" value={rupee(periodOrders.reduce((total, order) => total + Number(order.seller_commission), 0))} /><Stat label="Settlements" value="Not configured" /></dl>
            <section className="rounded-2xl border border-line bg-white p-4" aria-labelledby="sales-chart-heading"><h3 id="sales-chart-heading" className="text-sm font-bold">Daily gross sales</h3><div className="mt-4 flex h-36 items-end gap-2" role="img" aria-label="Daily gross sales chart for the selected period">{salesByDay.map(day => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1 text-center"><span className="truncate text-[10px] font-medium text-muted-ink">{day.total ? rupee(day.total) : '—'}</span><div className="min-h-1 rounded-t-md bg-brand" style={{ height: `${Math.max(4, (day.total / Math.max(1, ...salesByDay.map(item => item.total))) * 80)}%` }} /><span className="text-[10px] text-muted-ink">{day.label}</span></div>)}</div></section>
            <section className="rounded-2xl border border-line bg-white p-4"><h3 className="text-sm font-bold">Order financial breakdown</h3><dl className="mt-3 flex flex-col gap-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-ink">Gross product sales</dt><dd className="font-semibold">{rupee(periodOrders.reduce((total, order) => total + Number(order.item_total), 0))}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-ink">Platform fee recorded (5% of items)</dt><dd className="font-semibold">{rupee(periodOrders.reduce((total, order) => total + Number(order.seller_commission), 0))}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-ink">Seller delivery deductions</dt><dd className="font-semibold">{rupee(periodOrders.reduce((total, order) => total + Number(order.seller_delivery_deduction), 0))}</dd></div><div className="flex justify-between gap-3 border-t border-line pt-3"><dt className="font-semibold">Net seller earnings recorded</dt><dd className="font-bold">{rupee(periodOrders.reduce((total, order) => total + Number(order.seller_payout), 0))}</dd></div><div className="text-xs leading-5 text-muted-ink">Discounts, refunds and adjustments are not recorded in the current order schema; they are excluded. A 5% platform fee is deducted from the item subtotal on each order; it is not added to the customer's bill.</div></dl></section>
            <section className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4"><h3 className="text-sm font-bold text-[#9A3412]">Settlement history not configured</h3><p className="mt-1 text-sm leading-5 text-[#9A3412]">No payout ledger or bank settlement records are available in this workspace, so settled and pending amounts cannot be verified. Connect and verify seller bank details and enable the settlement ledger before showing payouts.</p></section>
            <section className="rounded-2xl border border-line bg-white p-4"><h3 className="text-sm font-bold">Recent orders</h3>{periodOrders.length ? <ul className="mt-2 divide-y divide-line">{periodOrders.slice(0, 8).map(order => <li key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate">#{order.id} · {order.status}</span><strong>{rupee(Number(order.seller_payout))}</strong></li>)}</ul> : <p className="mt-2 text-sm text-muted-ink">No completed financial activity for this period.</p>}</section>
            <button type="button" onClick={() => setShowProfitCalculator(value => !value)} aria-expanded={showProfitCalculator} className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-white px-4 text-sm font-semibold"><span className="flex items-center gap-2"><Calculator className="size-4 text-brand" aria-hidden="true" /> Product profit calculator</span><span className="text-xs text-muted-ink">{showProfitCalculator ? 'Hide' : 'Show'}</span></button>
            {showProfitCalculator && <SmartProfitCalculator />}
          </section>
        )}

        {tab === 'account' && <PartnerAccount role="Shopkeeper" onExit={onExit} />}
      </main>
      <BottomNav wide items={[{ key: 'orders', label: 'Orders', Icon: ClipboardList }, { key: 'products', label: 'Products', Icon: Package }, { key: 'earnings', label: 'Earnings', Icon: Banknote }, { key: 'account', label: 'Account', Icon: UserRound }]} active={tab} onSelect={setTab} />
    </div>
  )
}

type PrototypeOrderStatus = 'placed' | 'accepted' | 'dispatching' | 'rider_found' | 'picked' | 'delivered' | 'rejected'
type PrototypeOrder = { id: string; customer: string; address: string; phone: string; placedAt: string; payment: string; items: Array<{ name: string; qty: number; price: number }>; total: number; sellerEarns: number; status: PrototypeOrderStatus; prepMinutes: number; rejectReason?: string }

const prototypeOrdersSeed: PrototypeOrder[] = [
  { id: 'LH2483', customer: 'Aarav Sharma', address: 'Rampur, Ward 4 · near Shiv Mandir', phone: '+91 98765 43210', placedAt: new Date(Date.now() - 2 * 60_000).toISOString(), payment: 'Cash on delivery', items: [{ name: 'Aashirvaad Atta 5 kg', qty: 1, price: 260 }, { name: 'Amul Toned Milk 500 ml', qty: 2, price: 28 }, { name: 'Tata Salt 1 kg', qty: 1, price: 28 }], total: 344, sellerEarns: 327, status: 'placed', prepMinutes: 15 },
  { id: 'LH2482', customer: 'Meera Kumari', address: 'Madhopur · Hanuman Chowk', phone: '+91 98765 43211', placedAt: new Date(Date.now() - 11 * 60_000).toISOString(), payment: 'Cash on delivery', items: [{ name: 'Farm Eggs (6)', qty: 1, price: 54 }, { name: 'Maggi Noodles 70 g', qty: 4, price: 14 }], total: 110, sellerEarns: 105, status: 'accepted', prepMinutes: 10 },
]

export function SellerOrderPrototype({ shopName = 'Gupta Kirana Store' }: { shopName?: string }) {
  const [orders, setOrders] = useState(prototypeOrdersSeed)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [prepMinutes, setPrepMinutes] = useState('15')
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('Item unavailable')
  const [notice, setNotice] = useState('')
  const [pickupOtp, setPickupOtp] = useState('')
  const activeOrder = orders.find(order => order.id === activeOrderId)
  const dispatchingOrder = orders.find(order => order.status === 'dispatching')
  const setStatus = (id: string, status: PrototypeOrderStatus, extra: Partial<PrototypeOrder> = {}) => {
    setOrders(current => current.map(order => order.id === id ? { ...order, ...extra, status } : order))
    setNotice('Prototype state updated locally. No order was sent or saved.')
  }
  const incomingCount = orders.filter(order => order.status === 'placed').length

  return (
    <section aria-labelledby="prototype-orders-heading" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4 text-[#7C2D12]">
        <div><p className="text-xs font-bold uppercase tracking-wide">UI prototype · sample orders</p><p className="mt-1 text-sm leading-5">This flow is isolated from Supabase and the order APIs. All actions are temporary and local to this screen.</p></div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold">DEMO</span>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-muted-ink">{shopName}</p><h2 id="prototype-orders-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">Incoming orders</h2></div>
        <div className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold"><span aria-live="polite">{incomingCount ? `${incomingCount} ${incomingCount === 1 ? 'order needs' : 'orders need'} a response` : 'No orders need a response'}</span></div>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Pending response" value={String(incomingCount)} />
        <Stat label="Sample earnings today" value={rupee(orders.filter(order => order.status !== 'rejected').reduce((sum, order) => sum + order.sellerEarns, 0))} />
      </div>
      <div className="flex flex-col gap-3">
        {orders.map(order => <article key={order.id} className={cn('rounded-2xl border bg-white p-4 shadow-sm sm:p-5', order.status === 'placed' ? 'border-[#FDBA74] ring-1 ring-[#FDBA74]' : 'border-line')}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold">Order #{order.id}</h3><span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', order.status === 'placed' ? 'bg-[#FFEDD5] text-[#9A3412]' : order.status === 'rejected' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#DCFCE7] text-[#166534]')}>{order.status === 'placed' ? 'NEW ORDER' : order.status === 'accepted' ? 'ACCEPTED · PACKING' : order.status === 'dispatching' ? 'FINDING A RIDER' : order.status === 'rider_found' ? 'RIDER FOUND' : order.status.toUpperCase()}</span></div>
              <p className="mt-1.5 text-sm text-muted-ink">{order.customer} · {order.payment} · {new Date(order.placedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>
            </div>
            <div className="text-right"><p className="text-xs text-muted-ink">YOU EARN</p><p className="text-xl font-extrabold tabular-nums">{rupee(order.sellerEarns)}</p></div>
          </div>
          <p className="mt-3 flex items-start gap-2 text-sm text-ink"><MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />{order.address}</p>
          <ul className="mt-3 divide-y divide-line rounded-xl bg-[#F7F8FA] px-3">
            {order.items.map(item => <li key={item.name} className="flex justify-between gap-3 py-2 text-sm"><span>{item.qty} × {item.name}</span><span className="font-medium tabular-nums">{rupee(item.qty * item.price)}</span></li>)}
          </ul>
          <p className="mt-3 text-sm font-semibold">Customer total <span className="float-right">{rupee(order.total)}</span></p>
          {order.status === 'placed' && <div className="mt-4 flex flex-row gap-2"><button type="button" onClick={() => setRejectingOrderId(order.id)} className="min-h-12 flex-1 rounded-xl border border-line px-4 text-sm font-semibold text-[#991B1B]">Reject</button><button type="button" onClick={() => { setActiveOrderId(order.id); setPrepMinutes(String(order.prepMinutes)) }} className="min-h-12 flex-1 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-deep">Accept</button></div>}
          {order.status === 'accepted' && <div className="mt-4 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3"><p className="text-sm font-bold text-[#166534]">Accepted · Packing · {order.prepMinutes} min prep</p><button type="button" onClick={() => setStatus(order.id, 'dispatching')} className="mt-3 min-h-14 w-full rounded-xl bg-brand px-4 text-base font-bold text-white hover:bg-brand-deep">Ready for pickup</button></div>}
          {order.status === 'dispatching' && <p className="mt-4 rounded-xl bg-[#EFF6FF] p-4 text-sm font-semibold text-[#1E3A8A]">Rider search is active in the prototype.</p>}
          {order.status === 'rider_found' && <div className="mt-4 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-base font-bold">Rider accepted · Rohan Singh</p><p className="mt-1 text-sm text-muted-ink">Honda Activa · BR 01 AB 2483</p><p className="mt-1 text-sm text-muted-ink">ETA 8 min · 1.2 km away</p><button type="button" onClick={() => setNotice('Calling is not configured in this prototype.')} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold"><Bike className="size-4" aria-hidden="true" />Call rider</button></div><span className="rounded-full bg-[#EFF6FF] px-3 py-1.5 text-sm font-semibold text-[#1E3A8A]">Sample rider</span></div>
            <div aria-label="Illustrative rider route preview, not live GPS" className="relative mt-4 h-64 overflow-hidden rounded-2xl border border-[#DCE7DD] bg-[#EEF4EC]">
              <div className="absolute inset-0 opacity-80" style={{ backgroundImage: 'linear-gradient(0deg, transparent 46%, #D6E1D4 47%, #D6E1D4 53%, transparent 54%), linear-gradient(90deg, transparent 46%, #D6E1D4 47%, #D6E1D4 53%, transparent 54%)', backgroundSize: '84px 72px', transform: 'rotate(-8deg) scale(1.2)' }} />
              <div className="absolute left-[13%] top-[76%] z-10 rounded-full border-2 border-white bg-brand p-2 text-white shadow-lg"><MapPin className="size-5" aria-hidden="true" /></div>
              <div className="absolute right-[9%] top-[10%] z-10 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink shadow">{shopName}</div>
              <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 400 260" preserveAspectRatio="none"><path d="M 55 210 C 120 190 120 125 215 145 S 315 96 360 52" fill="none" stroke="#DC2626" strokeDasharray="7 8" strokeLinecap="round" strokeWidth="5" /></svg>
              <div className="prototype-rider-marker absolute z-20 grid size-10 place-items-center rounded-full border-2 border-white bg-[#1D4ED8] text-white shadow-lg"><Bike className="size-5" aria-hidden="true" /></div>
              <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold text-ink shadow">Illustrative map · simulated route</div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-end"><div><label htmlFor={`pickup-otp-${order.id}`} className="block text-sm font-semibold">Pickup OTP</label><p className="mt-1 text-sm text-muted-ink">Sample code: <strong className="font-mono tracking-[0.2em] text-ink">4821</strong></p><input id={`pickup-otp-${order.id}`} aria-label="Enter pickup OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pickupOtp} onChange={event => setPickupOtp(event.target.value.replace(/\\D/g, '').slice(0, 4))} placeholder="4-digit code" className="mt-2 h-12 w-full rounded-xl border border-line px-3 text-base tracking-[0.25em] sm:max-w-48" /></div><button type="button" disabled={pickupOtp !== '4821'} onClick={() => { setStatus(order.id, 'picked'); setPickupOtp('') }} className="min-h-12 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Confirm pickup</button></div>
          </div>}
          {order.status === 'picked' && <div className="mt-4 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4"><p className="text-base font-bold text-[#1E3A8A]">On the way</p><p className="mt-1 text-sm text-[#1E3A8A]">Customer delivery OTP · Pending</p><p className="mt-1 text-sm text-[#1E3A8A]">The customer shares their delivery code with the rider at drop-off. This prototype does not issue or verify real OTPs.</p><button type="button" onClick={() => setStatus(order.id, 'delivered')} className="mt-4 min-h-12 w-full rounded-xl bg-brand px-4 text-sm font-bold text-white">Simulate customer OTP verified</button></div>}
          {order.status === 'delivered' && <div className="mt-4 rounded-xl bg-[#F0FDF4] p-3"><p className="text-base font-bold text-[#166534]">Delivered</p><p className="mt-1 text-sm text-[#166534]">Customer delivery OTP · Verified in prototype</p></div>}
          {order.status === 'rejected' && <p className="mt-4 rounded-xl bg-[#FEF2F2] p-3 text-sm text-[#991B1B]">Rejected · {order.rejectReason}</p>}
        </article>)}
      </div>
      {notice && <p role="status" className="rounded-xl bg-[#EFF6FF] p-3 text-sm text-[#1E3A8A]">{notice}</p>}

      {dispatchingOrder && <div className="fixed inset-0 z-[60] flex min-h-[100dvh] flex-col items-center justify-center overflow-y-auto bg-[#101820] px-5 py-10 text-white" role="dialog" aria-modal="true" aria-labelledby="radar-heading"><div className="w-full max-w-md text-center"><p className="text-sm font-bold uppercase tracking-[0.16em] text-[#FDBA74]">Order #{dispatchingOrder.id} · prototype</p><div aria-hidden="true" className="relative mx-auto mt-10 grid size-64 place-items-center rounded-full border border-white/15 bg-[#152630]"><span className="prototype-radar-ring absolute inset-0 rounded-full border-2 border-[#FB923C]" /><span className="prototype-radar-ring absolute inset-6 rounded-full border-2 border-[#FB923C]" style={{ animationDelay: '0.7s' }} /><span className="prototype-radar-ring absolute inset-12 rounded-full border border-[#FDBA74]" style={{ animationDelay: '1.4s' }} /><span className="absolute inset-[4.5rem] rounded-full border border-white/20" /><span className="absolute size-4 rounded-full bg-[#FDBA74] shadow-[0_0_24px_8px_rgba(251,146,60,0.35)]" /></div><h2 id="radar-heading" className="mt-9 text-2xl font-extrabold">Notifying nearby riders…</h2><p className="mt-3 text-base leading-6 text-white/75">Searching around {shopName}. This is an animated prototype only; no riders are being contacted.</p><button type="button" onClick={() => setStatus(dispatchingOrder.id, 'rider_found')} className="mt-8 min-h-12 w-full rounded-xl bg-brand px-5 text-base font-bold text-white hover:bg-brand-deep">Simulate rider acceptance</button><button type="button" onClick={() => setStatus(dispatchingOrder.id, 'accepted')} className="mt-3 min-h-11 w-full rounded-xl border border-white/25 px-5 text-sm font-semibold text-white/85">Cancel rider search</button></div></div>}
      {activeOrder && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) setActiveOrderId(null) }}><section role="dialog" aria-modal="true" aria-labelledby="accept-order-title" className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand">Review new order</p><h3 id="accept-order-title" className="mt-1 text-xl font-extrabold">Accept #{activeOrder.id}?</h3></div><button type="button" aria-label="Close order review" onClick={() => setActiveOrderId(null)} className="rounded-full p-2 hover:bg-[#F7F8FA]"><X className="size-5" /></button></div><p className="mt-1 text-sm text-muted-ink">{activeOrder.customer} · {activeOrder.payment}</p><ul className="mt-4 divide-y divide-line rounded-xl bg-[#F7F8FA] px-3">{activeOrder.items.map(item => <li key={item.name} className="flex justify-between gap-3 py-3 text-sm"><span>{item.qty} × {item.name}</span><strong>{rupee(item.qty * item.price)}</strong></li>)}</ul><div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-ink">Customer pays (COD)</span><strong>{rupee(activeOrder.total)}</strong></div><div className="mt-2 flex items-center justify-between text-base"><span className="font-semibold">You earn</span><strong className="text-xl">{rupee(activeOrder.sellerEarns)}</strong></div><label className="mt-4 flex flex-col gap-1.5 text-sm font-semibold">Preparation time<select value={prepMinutes} onChange={event => setPrepMinutes(event.target.value)} className="h-12 rounded-xl border border-line bg-white px-3 text-base"><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option></select></label><div className="mt-5 flex flex-row gap-2"><button type="button" onClick={() => { window.print(); setNotice('Print dialog opened for this sample order.') }} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold"><Printer className="size-4" aria-hidden="true" />Print</button><button type="button" onClick={() => { setStatus(activeOrder.id, 'accepted', { prepMinutes: Number(prepMinutes) }); setActiveOrderId(null) }} className="min-h-12 flex-1 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-deep">Confirm</button></div></section></div>}
      {rejectingOrderId && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby="reject-order-title" className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl"><h3 id="reject-order-title" className="text-lg font-bold">Reject this order?</h3><p className="mt-1 text-sm text-muted-ink">Choose a reason to show with this sample order.</p><label className="mt-4 flex flex-col gap-1.5 text-sm font-semibold">Reason<select value={rejectReason} onChange={event => setRejectReason(event.target.value)} className="h-12 rounded-xl border border-line bg-white px-3"><option>Item unavailable</option><option>Shop is closing</option><option>Unable to prepare in time</option><option>Other</option></select></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRejectingOrderId(null)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold">Keep order</button><button type="button" onClick={() => { setStatus(rejectingOrderId, 'rejected', { rejectReason }); setRejectingOrderId(null) }} className="min-h-11 rounded-xl bg-[#B91C1C] px-4 text-sm font-bold text-white">Confirm reject</button></div></section></div>}
    </section>
  )
}

function SmartProfitCalculator() {
  const [sellingPrice, setSellingPrice] = useState('399')
  const [buyingCost, setBuyingCost] = useState('250')
  const [distanceKm, setDistanceKm] = useState(DEFAULT_DELIVERY_DISTANCE_KM)
  const [shopSelfDelivers, setShopSelfDelivers] = useState(false)
  const slab = deliverySlabFor(distanceKm)
  const sale = Math.max(0, Number(sellingPrice) || 0)
  const cost = Math.max(0, Number(buyingCost) || 0)
  const productProfit = sale - cost
  const bill = billFor(sale, distanceKm, shopSelfDelivers)
  const sellerTakeHome = productProfit - bill.sellerCommission - bill.sellerDeliveryDeduction
  const sellerReceives = Math.max(0, sale - bill.sellerCommission - bill.sellerDeliveryDeduction)
  const deliveryContribution = bill.deliveryFee + bill.sellerDeliveryDeduction - bill.riderPayout
  const lazyHandRevenue = deliveryContribution + bill.sellerCommission
  const riderTransfer = Math.max(0, lazyHandRevenue)
  const marginPercent = sale > 0 ? (sellerTakeHome / sale) * 100 : 0

  return (
    <section className="mt-4 flex flex-col gap-3 pb-4" aria-labelledby="profit-calculator-heading">
      <div>
        <h2 id="profit-calculator-heading" className="text-lg font-bold">Smart Profit Calculator</h2>
        <p className="mt-1 text-xs leading-5 text-muted-ink">Preview customer charges, the 5% seller platform fee, rider pay and LazyHand revenue separately.</p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Selling price
            <span className="flex h-11 items-center rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
              <span aria-hidden="true">₹</span>
              <input aria-label="Selling price in rupees" type="number" min="0" step="1" inputMode="numeric" value={sellingPrice} onChange={event => setSellingPrice(event.target.value)} className="w-full bg-transparent px-1 text-sm text-ink outline-none" />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Buying cost
            <span className="flex h-11 items-center rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
              <span aria-hidden="true">₹</span>
              <input aria-label="Buying cost in rupees" type="number" min="0" step="1" inputMode="numeric" value={buyingCost} onChange={event => setBuyingCost(event.target.value)} className="w-full bg-transparent px-1 text-sm text-ink outline-none" />
            </span>
          </label>
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold">Shop-to-customer distance · up to 6 km</legend>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Delivery distance">
            {DELIVERY_SLABS.map(option => {
              const selected = distanceKm === option.maxDistanceKm
              return <button key={option.label} type="button" role="radio" aria-checked={selected} onClick={() => setDistanceKm(option.maxDistanceKm)} className={cn('min-h-11 rounded-xl border px-2 text-left text-xs font-semibold transition', selected ? 'border-brand bg-[#FFF5EC] text-brand-deep' : 'border-line bg-white text-muted-ink')}>
                <span className="block">{option.label}</span>
                <span className="mt-0.5 block font-normal">Customer {rupee(option.customerFee)} · Rider {rupee(option.riderPayout)}</span>
              </button>
            })}
          </div>
        </fieldset>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-cream p-3">
          <span className="min-w-0 text-xs font-semibold leading-5">Shop handles delivery · free for customer</span>
          <button type="button" role="switch" aria-checked={shopSelfDelivers} aria-label="Shop handles delivery for free" onClick={() => setShopSelfDelivers(value => !value)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition', shopSelfDelivers ? 'bg-brand' : 'bg-[#C6C1BA]')}>
            <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', shopSelfDelivers ? 'left-[22px]' : 'left-0.5')} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold">Three-party breakdown</h3>
          <span className="rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[10px] font-bold text-[#166534]">0% seller commission</span>
        </div>
        <dl className="mt-3 flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Product profit</dt><dd className="font-semibold">{rupee(productProfit)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Platform fee (5% of item subtotal)</dt><dd className="font-semibold">−{rupee(bill.sellerCommission)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Seller delivery contribution</dt><dd className="font-semibold">−{rupee(bill.sellerDeliveryDeduction)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-dashed border-line pt-2.5 font-bold"><dt>Seller take-home</dt><dd>{rupee(sellerTakeHome)} <span className="text-xs font-medium text-muted-ink">({marginPercent.toFixed(1)}%)</span></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Customer pays</dt><dd className="font-semibold">{rupee(bill.total)}{shopSelfDelivers && <span className="text-xs font-normal text-muted-ink"> · free delivery</span>}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Seller platform fee (5%)</dt><dd className="font-semibold">{rupee(bill.sellerCommission)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Delivery contribution</dt><dd className="font-semibold">{rupee(deliveryContribution)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-dashed border-line pt-2 font-bold"><dt>LazyHand total revenue</dt><dd className="text-brand-deep">{rupee(lazyHandRevenue)}</dd></div>
          <div className="flex justify-between gap-3 text-xs text-muted-ink"><dt>Delivery fee − rider payout</dt><dd>{rupee(bill.deliveryFee)} − {rupee(bill.riderPayout)}</dd></div>
        </dl>
      </div>

      <div className="rounded-2xl border border-line bg-white p-4">
        <h3 className="text-sm font-bold">Customer platform-fee slabs</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {PLATFORM_FEE_SLABS.map(option => <div key={option.label} className="flex justify-between gap-2"><dt className="text-muted-ink">{option.label}</dt><dd className="font-semibold">{rupee(option.fee)}</dd></div>)}
        </dl>
        <p className="mt-3 text-[10px] leading-4 text-muted-ink">These are customer-facing fees, not seller commissions. They are based on the order value before delivery.</p>
      </div>

      <div className="rounded-2xl bg-ink p-4 text-white">
        <div className="flex items-center gap-2"><Banknote className="size-4 text-[#FFC178]" aria-hidden="true" /><h3 className="text-sm font-bold">Illustrative COD settlement · 9:00 PM</h3></div>
        {shopSelfDelivers ? (
          <ol className="mt-3 flex flex-col gap-2 text-xs leading-5 text-white/85">
            <li className="flex justify-between gap-3"><span>Customer pays shop</span><strong>{rupee(bill.total)}</strong></li>
            <li className="flex justify-between gap-3"><span>Shop keeps item value after 5% fee</span><strong>{rupee(sellerReceives)}</strong></li>
            <li className="flex justify-between gap-3 border-t border-white/15 pt-2"><span>LazyHand platform fee (5%)</span><strong>{rupee(bill.sellerCommission)}</strong></li>
            <li className="flex justify-between gap-3"><span>Rider payout</span><strong>{rupee(0)}</strong></li>
          </ol>
        ) : (
          <ol className="mt-3 flex flex-col gap-2 text-xs leading-5 text-white/85">
            <li className="flex justify-between gap-3"><span>Rider collects from customer</span><strong>{rupee(bill.total)}</strong></li>
            <li className="flex justify-between gap-3"><span>Rider keeps distance-based payout</span><strong>−{rupee(bill.riderPayout)}</strong></li>
            <li className="flex justify-between gap-3 border-t border-white/15 pt-2"><span>Rider remits delivery spread + platform fee</span><strong>{rupee(riderTransfer)}</strong></li>
            <li className="flex justify-between gap-3"><span>Seller receives item value after 5% fee</span><strong>{rupee(sellerReceives)}</strong></li>
            <li className="flex justify-between gap-3 border-t border-white/15 pt-2 font-bold text-white"><span>LazyHand revenue before costs</span><strong>{rupee(lazyHandRevenue)}</strong></li>
          </ol>
        )}
        <p className="mt-3 text-[10px] leading-4 text-white/60">Illustrative only. No funds move in this preview. Gateway charges, taxes, refunds, rewards and operating costs are not included.</p>
      </div>

      <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-3 text-xs leading-5 text-[#9A3412]">
        Rider pay is tied to the delivery-distance slab and never reduced on a later order. Model pickup travel, return distance, wait time and real fuel costs before treating contribution as profit.
      </div>
    </section>
  )
}

function RiderEarningsSimulator() {
  const [deliveriesValue, setDeliveriesValue] = useState('15')
  const [workDaysValue, setWorkDaysValue] = useState('26')
  const [averagePayoutValue, setAveragePayoutValue] = useState('26')
  const [dailyExpenseValue, setDailyExpenseValue] = useState('60')
  const deliveriesPerDay = Math.max(0, Math.floor(Number(deliveriesValue) || 0))
  const workDays = Math.max(0, Math.min(31, Math.floor(Number(workDaysValue) || 0)))
  const averagePayout = Math.max(0, Number(averagePayoutValue) || 0)
  const dailyExpenses = Math.max(0, Number(dailyExpenseValue) || 0)
  const dailyGross = deliveriesPerDay * averagePayout
  const monthlyGross = dailyGross * workDays
  const dailyBonus = deliveriesPerDay >= 15 ? 70 : deliveriesPerDay >= 10 ? 40 : deliveriesPerDay >= 5 ? 20 : 0
  const monthlyAfterExpenses = (dailyGross - dailyExpenses) * workDays
  const monthlyWithRewards = (dailyGross + dailyBonus - dailyExpenses) * workDays

  return (
    <section className="mt-4 rounded-2xl border border-line bg-white p-4" aria-labelledby="rider-simulator-heading">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-deep">Illustrative, not guaranteed</p>
        <h3 id="rider-simulator-heading" className="mt-1 text-base font-bold">Monthly earning simulator</h3>
        <p className="mt-1 text-xs leading-5 text-muted-ink">Estimate take-home using your delivery pace, payout and daily costs.</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Deliveries per day
          <input aria-label="Deliveries per day" type="number" min="0" step="1" inputMode="numeric" value={deliveriesValue} onChange={event => setDeliveriesValue(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Working days / month
          <input aria-label="Working days per month" type="number" min="0" max="31" step="1" inputMode="numeric" value={workDaysValue} onChange={event => setWorkDaysValue(event.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Avg. rider payout / order
          <span className="flex h-11 items-center rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"><span aria-hidden="true">₹</span><input aria-label="Average rider payout per order in rupees" type="number" min="0" step="1" inputMode="numeric" value={averagePayoutValue} onChange={event => setAveragePayoutValue(event.target.value)} className="w-full bg-transparent px-1 text-sm text-ink outline-none" /></span>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Fuel + maintenance / day
          <span className="flex h-11 items-center rounded-xl border border-line bg-white px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"><span aria-hidden="true">₹</span><input aria-label="Daily fuel and maintenance estimate in rupees" type="number" min="0" step="1" inputMode="numeric" value={dailyExpenseValue} onChange={event => setDailyExpenseValue(event.target.value)} className="w-full bg-transparent px-1 text-sm text-ink outline-none" /></span>
        </label>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Daily delivery gross" value={rupee(dailyGross)} />
        <Stat label="Monthly delivery gross" value={rupee(monthlyGross)} />
        <Stat label="Monthly after expenses" value={rupee(monthlyAfterExpenses)} />
        <Stat label="With milestone rewards" value={rupee(monthlyWithRewards)} />
      </dl>
      <div className="mt-3 rounded-xl bg-[#FFF7ED] p-3">
        <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-[#9A3412]">Estimated daily reward at this pace</span><strong className="text-brand-deep">+{rupee(dailyBonus)}</strong></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[{ deliveries: 5, reward: 20 }, { deliveries: 10, reward: 40 }, { deliveries: 15, reward: 70 }].map(milestone => (
            <div key={milestone.deliveries} className={cn('rounded-lg border px-1.5 py-2', deliveriesPerDay >= milestone.deliveries ? 'border-brand bg-white' : 'border-transparent bg-white/60')}>
              <p className="text-xs font-bold">{milestone.deliveries} trips</p>
              <p className="mt-0.5 text-[10px] text-muted-ink">+{rupee(milestone.reward)}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-4 text-muted-ink">Bonuses are cumulative milestones: 15 trips pays ₹70 total, not ₹130. Rewards are paid once per day. Estimates exclude taxes, phone costs, waiting time, pickup/return travel and other personal expenses; demand is not guaranteed.</p>
    </section>
  )
}

type ProductDraft = {
  name: string
  unit: string
  price: number
  category: CategoryId
  inStock: boolean
}

function ProductEditor({ initial, onSave, onCancel }: { initial?: Product; onSave: (product: ProductDraft) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [category, setCategory] = useState<CategoryId>(initial?.category ?? 'staples')
  const [inStock, setInStock] = useState(initial?.inStock ?? true)
  const [error, setError] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(price)
    if (!name.trim() || !unit.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter a product name, pack size, and price greater than ₹0.')
      return
    }
    onSave({ name: name.trim(), unit: unit.trim(), price: amount, category, inStock })
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-2xl border border-brand/30 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{initial ? 'Edit product details' : 'Add a product'}</h3>
          <p className="mt-1 text-xs text-muted-ink">Add the details customers need to choose the right item.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close product form" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-ink hover:bg-[#FFF8F1]"><X className="size-4" aria-hidden="true" /></button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Product name
          <input autoFocus required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Fresh paneer" className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Category
            <select value={category} onChange={event => setCategory(event.target.value as CategoryId)} className="h-11 min-w-0 rounded-xl border border-line bg-white px-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
              {categories.map(item => <option key={item.id} value={item.id}>{item.short}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Pack size
            <input required value={unit} onChange={event => setUnit(event.target.value)} placeholder="500 g / 1 pc" className="h-11 min-w-0 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-ink">Selling price (₹)
          <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="0.00" className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-[#F8F6F2] px-3 text-sm">
          <input type="checkbox" checked={inStock} onChange={event => setInStock(event.target.checked)} className="size-4 accent-[#C2410C]" />
          <span><strong>In stock</strong><span className="block text-xs text-muted-ink">Show this product in the customer catalog</span></span>
        </label>
        {error && <p role="alert" className="text-xs text-[#B91C1C]">{error}</p>}
        <div className="flex gap-2">
          <SecondaryButton onClick={onCancel} className="h-11">Cancel</SecondaryButton>
          <PrimaryButton type="submit" className="h-11">{initial ? 'Save changes' : 'Add to catalog'}</PrimaryButton>
        </div>
      </div>
    </form>
  )
}

type RiderApiOrder = {
  id: string
  shopId: string
  shopName: string
  shopVillage: string
  shopPhone: string
  status: Order['status']
  address: string
  customerName: string
  customerPhone: string
  total: number
  riderPayout: number
  riderName?: string
  placedAt: string
  pickup: { latitude: number; longitude: number } | null
  drop: { latitude: number; longitude: number } | null
  routeDistanceKm: number | null
  routeDurationMinutes: number | null
}

function mapsDirections(destination: { latitude: number; longitude: number }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=driving`
}

type RiderTracking = {
  tracking: {
    route: [number, number][] | null
    etaMinutes: number | null
    etaTarget: 'pickup' | 'drop' | null
    stale: boolean
  }
}

async function fetchRiderTracking(url: string): Promise<RiderTracking> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Route unavailable.')
  return response.json() as Promise<RiderTracking>
}

export function RiderDashboard({ onExit }: { onExit: () => void }) {
  const { profile } = useLazyHand()
  const [tab, setTab] = useState<'trips' | 'earnings' | 'account'>('trips')
  const [online, setOnline] = useState(true)
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [geoError, setGeoError] = useState('')
  const [riderPoint, setRiderPoint] = useState<{ latitude: number; longitude: number } | null>(null)
  const [trackingId, setTrackingId] = useState<string | null>(null)

  const { data, error, isLoading, mutate } = useSWR('rider-api-orders', async () => {
    const response = await fetch('/api/rider', { cache: 'no-store' })
    if (!response.ok) throw new Error(response.status === 403 ? 'Sign in with an approved rider account.' : 'Trips could not be loaded.')
    return response.json() as Promise<{ orders: RiderApiOrder[] }>
  }, { refreshInterval: 15000 })

  const orders = data?.orders ?? []
  const available = orders.filter(order => !order.riderName && ['accepted', 'ready'].includes(order.status))
  const active = orders.filter(order => order.riderName && ['ready', 'picked'].includes(order.status))
  const activeId = active[0]?.id ?? null
  const { data: riderTracking } = useSWR(activeId ? `/api/orders/${activeId}/tracking` : null, fetchRiderTracking, { refreshInterval: 8000, shouldRetryOnError: false })
  const completed = orders.filter(order => order.status === 'delivered')
  const totalEarned = completed.reduce((total, order) => total + order.riderPayout, 0)
  const averagePayout = completed.length ? totalEarned / completed.length : 0
  const riderName = profile.role === 'rider' && profile.name ? profile.name : 'Delivery partner'

  const sendLocation = useCallback(async (orderId: string, position: GeolocationPosition) => {
    setRiderPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude })
    try {
      await fetch('/api/rider/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
        }),
      })
    } catch {
      // A dropped ping is retried by the interval; never fabricate a position.
    }
  }, [])

  useEffect(() => {
    if (activeId && trackingId !== activeId) setTrackingId(activeId)
    if (!activeId && trackingId) setTrackingId(null)
  }, [activeId, trackingId])

  useEffect(() => {
    if (!trackingId) return
    if (!('geolocation' in navigator)) {
      setGeoError('This browser does not support location sharing.')
      return
    }
    const watch = navigator.geolocation.watchPosition(
      position => { void sendLocation(trackingId, position) },
      failure => setGeoError(failure.code === failure.PERMISSION_DENIED
        ? 'Location permission is blocked. Allow it in your browser settings to share the trip.'
        : 'GPS is unavailable right now. Keep device location on and stay online.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    const interval = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        position => { void sendLocation(trackingId, position) },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      )
    }, 9000)
    return () => {
      navigator.geolocation.clearWatch(watch)
      window.clearInterval(interval)
    }
  }, [sendLocation, trackingId])

  const act = async (orderId: string, action: 'claim' | 'pickup' | 'deliver') => {
    setBusy(`${orderId}:${action}`)
    setActionError('')
    try {
      const response = await fetch('/api/rider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(result?.error || 'Trip could not be updated.')
      }
      await mutate()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Trip could not be updated.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="pb-24">
      <PartnerHeader
        eyebrow="Delivery partner"
        title={riderName}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{online ? 'Online' : 'Offline'}</span>
            <Toggle checked={online} onChange={setOnline} label="Go online to receive trips" />
          </div>
        }
      />
      <div className="mx-auto max-w-md px-4">
        {tab === 'trips' && (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Delivered" value={String(completed.length)} />
              <Stat label="Earned" value={rupee(totalEarned)} />
              <Stat label="Avg / trip" value={rupee(averagePayout)} />
            </dl>

            {error && <p role="alert" className="mt-4 rounded-xl border border-[#F4C7C7] bg-[#FCE8E8] p-3 text-sm text-[#7F1D1D]">{error.message}</p>}
            {actionError && <p role="alert" className="mt-3 rounded-xl border border-[#F4C7C7] bg-[#FCE8E8] p-3 text-sm text-[#7F1D1D]">{actionError}</p>}
            {geoError && <p role="alert" className="mt-3 rounded-xl bg-[#FEF3C7] p-3 text-xs text-[#92400E]">{geoError}</p>}
            {isLoading && <p className="mt-4 text-sm text-muted-ink">Loading trips…</p>}

            {active.map(order => {
              const picked = order.status === 'picked'
              const destination = picked ? order.drop : order.pickup
              const markers = [
                ...(order.pickup ? [{ id: 'pickup', latitude: order.pickup.latitude, longitude: order.pickup.longitude, label: `${order.shopName} pickup`, color: '#B45309' }] : []),
                ...(order.drop ? [{ id: 'drop', latitude: order.drop.latitude, longitude: order.drop.longitude, label: 'Customer', color: '#15803D' }] : []),
                ...(riderPoint ? [{ id: 'rider', latitude: riderPoint.latitude, longitude: riderPoint.longitude, label: 'You', color: '#2563EB' }] : []),
              ]
              return (
                <article key={order.id} className="mt-5 rounded-2xl border-2 border-brand bg-white p-4" aria-label={`Active trip ${order.id}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold">Active trip · #{order.id}</h2>
                    <StatusPill tone="info">{picked ? 'Delivering' : 'Go to shop'}</StatusPill>
                  </div>
                  <ol className="mt-3 flex flex-col gap-3 text-sm">
                    <li className="flex gap-3">
                      <Store className={cn('mt-0.5 size-4 shrink-0', picked ? 'text-[#15803D]' : 'text-brand-deep')} aria-hidden="true" />
                      <span>
                        <span className="block font-semibold">Pick up · {order.shopName}</span>
                        <span className="block text-xs text-muted-ink">{order.shopVillage || 'Shop address shared on call'}</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-brand-deep" aria-hidden="true" />
                      <span>
                        <span className="block font-semibold">Drop · {order.customerName}</span>
                        <span className="block text-xs text-muted-ink">{order.address}</span>
                      </span>
                    </li>
                  </ol>

                  {markers.length > 0 && <div className="mt-3"><TrackingMap markers={markers} route={riderTracking?.tracking.route} height={180} fitKey={order.id} /></div>}
                  {riderTracking?.tracking.etaMinutes != null && (
                    <p className="mt-2 text-xs font-semibold text-brand-deep">
                      {riderTracking.tracking.etaTarget === 'pickup' ? 'Pickup' : 'Customer'} ETA · {riderTracking.tracking.etaMinutes} min · road route
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {destination && (
                      <a href={mapsDirections(destination)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-xs font-semibold">
                        <MapPin className="size-4" aria-hidden="true" /> Open in Google Maps
                      </a>
                    )}
                    {order.shopPhone && !picked && <a href={`tel:${order.shopPhone}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-xs font-semibold">Call shop</a>}
                    {order.customerPhone && picked && <a href={`tel:${order.customerPhone}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-xs font-semibold">Call customer</a>}
                  </div>

                  {!picked ? (
                    <PrimaryButton disabled={busy === `${order.id}:pickup`} onClick={() => void act(order.id, 'pickup')} className="mt-3 h-11">
                      {busy === `${order.id}:pickup` ? 'Marking…' : 'Mark picked up'}
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton disabled={busy === `${order.id}:deliver`} onClick={() => void act(order.id, 'deliver')} className="mt-3 h-11">
                      {busy === `${order.id}:deliver` ? 'Completing…' : 'Mark delivered'}
                    </PrimaryButton>
                  )}
                  <p className="mt-2 text-[10px] leading-4 text-muted-ink">Location is shared only while this trip is active. Cash collection is not enabled in this build.</p>
                </article>
              )
            })}

            <section aria-labelledby="available" className="mt-5">
              <h2 id="available" className="text-sm font-bold">Available pickups</h2>
              <div className="mt-2 flex flex-col gap-2.5">
                {!online ? (
                  <Empty Icon={Power} title="You are offline" detail="Go online to see orders that are packed and ready." />
                ) : available.length === 0 ? (
                  <Empty Icon={Bike} title="No pickups right now" detail="Packed orders appear here in real time." />
                ) : available.map(order => (
                  <article key={order.id} className="rounded-2xl border border-line bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{order.shopName}</p>
                      <p className="text-sm font-bold text-[#15803D]">+{rupee(order.riderPayout)}</p>
                    </div>
                    <p className="text-xs text-muted-ink">#{order.id} · {order.routeDistanceKm == null ? 'Distance unavailable' : `${order.routeDistanceKm} km`} · drop at {order.address || 'nearby'}</p>
                    <PrimaryButton onClick={() => void act(order.id, 'claim')} disabled={Boolean(activeId) || busy === `${order.id}:claim`} className="mt-3 h-10 text-xs">
                      {activeId ? 'Finish your active trip first' : busy === `${order.id}:claim` ? 'Accepting…' : 'Accept trip'}
                    </PrimaryButton>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'earnings' && (
          <section className="mt-4" aria-labelledby="earnings-heading">
            <h2 id="earnings-heading" className="text-sm font-bold">Earnings</h2>
            <div className="mt-2 rounded-2xl bg-ink p-5 text-white">
              <p className="text-xs text-white/70">Delivered trips</p>
              <p className="text-3xl font-bold">{rupee(totalEarned)}</p>
              <p className="mt-1 text-xs text-white/70">{completed.length} trips · payout varies by distance</p>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {completed.length === 0 && <Empty Icon={IndianRupee} title="No completed trips yet" detail="Delivered orders appear here." />}
              {completed.map(order => (
                <li key={order.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-sm">
                  <span>#{order.id} · {order.shopName}</span>
                  <span className="font-semibold text-[#15803D]">+{rupee(order.riderPayout)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'account' && <PartnerAccount role="Delivery partner" onExit={onExit} />}
      </div>
      <BottomNav
        items={[
          { key: 'trips', label: 'Trips', Icon: Bike, badge: online ? available.length || undefined : undefined },
          { key: 'earnings', label: 'Earnings', Icon: IndianRupee },
          { key: 'account', label: 'Account', Icon: UserRound },
        ]}
        active={tab}
        onSelect={setTab}
      />
    </div>
  )
}

function makeClosedWeek(): ShopHourDraft[] {
  return WEEKDAYS.map((_, day_of_week) => ({ day_of_week, opens_at: null, closes_at: null, is_closed: true }))
}

function ShopHoursSettings() {
  const { data: savedSettings, error: loadError, isLoading, mutate } = useSWR('seller-shop-hours', async () => {
    const response = await fetch('/api/shop-hours', { cache: 'no-store' })
    if (!response.ok) throw new Error('Sign in with an approved seller account to load shop hours.')
    return response.json() as Promise<ShopSettingsResponse>
  })
  const savedHours = savedSettings?.hours
  const [settings, setSettings] = useState<ShopSettings>(defaultShopSettings)
  const [draft, setDraft] = useState<ShopHourDraft[]>(makeClosedWeek)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!savedSettings) return
    const byDay = new Map(savedSettings.hours.map(hours => [hours.day_of_week, hours]))
    setDraft(WEEKDAYS.map((_, day_of_week) => byDay.get(day_of_week) ?? { day_of_week, opens_at: null, closes_at: null, is_closed: true }))
    setSettings(savedSettings.settings ?? defaultShopSettings)
  }, [savedSettings])

  const updateSettings = (patch: Partial<ShopSettings>) => setSettings(current => ({ ...current, ...patch }))

  const updateDay = (day: number, patch: Partial<ShopHourDraft>) => {
    setDraft(current => current.map(hours => hours.day_of_week === day ? { ...hours, ...patch } : hours))
  }

  const saveHours = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true); setFailure(''); setMessage('')
    const invalidDay = draft.find(hours => !hours.is_closed && (!hours.opens_at || !hours.closes_at || hours.opens_at === hours.closes_at))
    if (invalidDay) {
      setSaving(false)
      setFailure(`Add different opening and closing times for ${WEEKDAYS[invalidDay.day_of_week]}.`)
      return
    }
    const response = await fetch('/api/shop-hours', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: draft, settings }),
    })
    setSaving(false)
    if (!response.ok) {
      setFailure('Shop hours could not be saved. Confirm your seller account is approved, then try again.')
      return
    }
    setMessage('Weekly hours saved.')
    setEditing(false)
    await mutate()
  }

  const configured = Boolean(savedHours?.length)

  return (
    <section className="rounded-2xl border border-line bg-white p-4 sm:p-5" aria-labelledby="shop-hours-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="shop-hours-heading" className="text-base font-bold">Weekly shop hours</h3><p className="mt-1 text-xs leading-5 text-muted-ink">Local shop time · India Standard Time (Asia/Kolkata)</p></div>
        {!editing && <button type="button" onClick={() => setEditing(true)} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">{configured ? 'Edit hours' : 'Set hours'}</button>}
      </div>
      {loadError && <p role="alert" className="mt-3 text-sm text-red-700">Shop hours could not be loaded. Refresh and try again.</p>}
      {isLoading ? <p className="mt-3 text-sm text-muted-ink">Loading shop hours…</p> : !editing ? (
        configured ? <ul className="mt-4 grid gap-2 sm:grid-cols-2">{WEEKDAYS.map((day, index) => { const hours = savedHours?.find(row => row.day_of_week === index); return <li key={day} className="flex items-center justify-between gap-3 rounded-lg bg-cream px-3 py-2 text-sm"><span className="font-medium">{day}</span><span className="text-right text-muted-ink">{!hours || hours.is_closed ? 'Closed' : `${hours.opens_at?.slice(0, 5)} – ${hours.closes_at?.slice(0, 5)}`}</span></li> })}</ul> : <p className="mt-3 rounded-xl bg-cream px-3 py-3 text-sm text-muted-ink">Not configured yet. Add your usual opening and closing times for each day.</p>
      ) : (
        <form onSubmit={saveHours} className="mt-4 flex flex-col gap-2">
          <p className="rounded-lg bg-[#FFF7ED] px-3 py-2 text-xs leading-5 text-[#7C2D12]">Automatic status follows these hours unless you choose a manual override. Customer availability updates from this VPS-backed setting.</p>
          <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">Shop timezone<input required value={settings.shop_timezone} onChange={event => updateSettings({ shop_timezone: event.target.value })} placeholder="Asia/Kolkata" className="h-10 rounded-lg border border-line px-3 text-sm" /><span className="font-normal text-muted-ink">Use an IANA timezone, such as Asia/Kolkata.</span></label>
            <label className="flex flex-col gap-1 text-xs font-semibold">Open status<select value={settings.shop_is_open_override === null ? 'automatic' : settings.shop_is_open_override ? 'open' : 'closed'} onChange={event => updateSettings({ shop_is_open_override: event.target.value === 'automatic' ? null : event.target.value === 'open' })} className="h-10 rounded-lg border border-line bg-white px-3 text-sm"><option value="automatic">Follow weekly hours</option><option value="open">Manually open</option><option value="closed">Manually closed</option></select></label>
            <label className="flex flex-col gap-1 text-xs font-semibold">Delivery estimate (minutes, minimum)<input type="number" min="1" max="240" value={settings.delivery_estimate_min ?? ''} onChange={event => updateSettings({ delivery_estimate_min: event.target.value ? Number(event.target.value) : null })} placeholder="30" className="h-10 rounded-lg border border-line px-3 text-sm" /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold">Delivery estimate (minutes, maximum)<input type="number" min="1" max="240" value={settings.delivery_estimate_max ?? ''} onChange={event => updateSettings({ delivery_estimate_max: event.target.value ? Number(event.target.value) : null })} placeholder="45" className="h-10 rounded-lg border border-line px-3 text-sm" /></label>
          </div>
          {draft.map(hours => <fieldset key={hours.day_of_week} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[minmax(76px,1fr)_auto_minmax(90px,1fr)_minmax(90px,1fr)]">
            <legend className="sr-only">{WEEKDAYS[hours.day_of_week]} schedule</legend>
            <span className="text-xs font-semibold sm:text-sm">{WEEKDAYS[hours.day_of_week]}</span>
            <label className="flex items-center gap-1.5 text-xs text-muted-ink"><input type="checkbox" checked={hours.is_closed} onChange={event => updateDay(hours.day_of_week, { is_closed: event.target.checked })} className="size-4 accent-brand" />Closed</label>
            <label className="flex min-w-0 flex-col gap-1 text-[10px] text-muted-ink">Opens<input aria-label={`${WEEKDAYS[hours.day_of_week]} opening time`} type="time" value={hours.opens_at?.slice(0, 5) ?? ''} disabled={hours.is_closed} required={!hours.is_closed} onChange={event => updateDay(hours.day_of_week, { opens_at: event.target.value || null })} className="h-9 min-w-0 rounded-lg border border-line bg-white px-2 text-xs text-ink disabled:bg-muted" /></label>
            <label className="flex min-w-0 flex-col gap-1 text-[10px] text-muted-ink">Closes<input aria-label={`${WEEKDAYS[hours.day_of_week]} closing time`} type="time" value={hours.closes_at?.slice(0, 5) ?? ''} disabled={hours.is_closed} required={!hours.is_closed} onChange={event => updateDay(hours.day_of_week, { closes_at: event.target.value || null })} className="h-9 min-w-0 rounded-lg border border-line bg-white px-2 text-xs text-ink disabled:bg-muted" /></label>
          </fieldset>)}
          {failure && <p role="alert" className="text-sm text-red-700">{failure}</p>}
          <div className="flex gap-2"><button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save weekly hours'}</button><button type="button" onClick={() => { setEditing(false); setFailure('') }} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold">Cancel</button></div>
        </form>
      )}
      {message && <p role="status" className="mt-3 text-sm font-medium text-green-700">{message}</p>}
    </section>
  )
}

function PartnerAccount({ role, onExit }: { role: string; onExit: () => void }) {
  const { profile, setProfile } = useLazyHand()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const whatsappNumber = profile.whatsappNumber.replace(/\D/g, '').slice(-10)
  const validWhatsappNumber = /^[6-9]\d{9}$/.test(whatsappNumber)
  const signOut = async () => {
    setSigningOut(true)
    setSignOutError('')
    const { error } = await createClient().auth.signOut()
    setSigningOut(false)
    if (error) {
      setSignOutError('We couldn’t sign you out. Please try again.')
      return
    }
    onExit()
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="account-heading">
      <div><h2 id="account-heading" className="text-xl font-bold">Account & shop settings</h2><p className="mt-1 text-sm text-muted-ink">Your seller profile and shop preferences.</p></div>
      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5" aria-labelledby="profile-heading">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#FCE8E8] text-[#B91F1F]"><UserRound className="size-5" aria-hidden="true" /></span><div><h3 id="profile-heading" className="text-base font-bold">Seller profile</h3><p className="text-sm text-muted-ink">Account details</p></div></div>
        <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"><div><dt className="text-xs font-medium text-muted-ink">Name</dt><dd className="mt-1 text-sm font-semibold">{profile.name || 'Not provided'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Phone</dt><dd className="mt-1 text-sm font-semibold">{profile.phone ? `+91 ${profile.phone}` : 'Not provided'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Shop</dt><dd className="mt-1 text-sm font-semibold">{profile.shopName || 'Not provided'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Business category</dt><dd className="mt-1 text-sm font-semibold capitalize">{profile.shopType || 'Not assigned'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Shop address</dt><dd className="mt-1 text-sm font-semibold">{[profile.village, profile.landmark].filter(Boolean).join(' · ') || 'Not provided'}</dd></div></dl>
      </section>
      {role === 'Shopkeeper' && <ShopHoursSettings />}

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Shop availability and payments">
          <div className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center gap-2"><Store className="size-4 text-brand" aria-hidden="true" /><h3 className="text-sm font-bold">Shop availability</h3></div><p className="mt-2 text-sm font-semibold">Managed by your weekly hours</p><p className="mt-1 text-xs leading-5 text-muted-ink">Set an automatic schedule or manually open/close your shop in the hours settings above. Customers see your live status and delivery estimate.</p></div>
        <div className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center gap-2"><Banknote className="size-4 text-brand" aria-hidden="true" /><h3 className="text-sm font-bold">Payments & settlements</h3></div><p className="mt-2 text-sm font-semibold">No verified payout account</p><p className="mt-1 text-xs leading-5 text-muted-ink">Settlement history and bank details aren&apos;t available for this account.</p></div>
      </section>

      {role === 'Shopkeeper' && (
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5" aria-labelledby="whatsapp-alerts-heading">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F7F8FA] text-brand-deep"><MessageCircle className="size-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><h3 id="whatsapp-alerts-heading" className="text-base font-bold">WhatsApp order alerts</h3><p className="mt-1 text-sm leading-5 text-muted-ink">Save a contact preference for when seller alerts are available.</p></div></div>
          <label htmlFor="seller-whatsapp" className="mt-4 block text-sm font-semibold">Shop WhatsApp number</label>
          <div className="mt-1.5 flex h-12 items-center rounded-xl border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"><span className="border-r border-line px-3 text-sm text-muted-ink">+91</span><input id="seller-whatsapp" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={whatsappNumber} onChange={event => setProfile({ ...profile, whatsappNumber: event.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="98765 43210" aria-describedby="seller-whatsapp-help" aria-invalid={Boolean(whatsappNumber) && !validWhatsappNumber} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" /></div>
          <p id="seller-whatsapp-help" className="mt-1.5 text-xs leading-5 text-muted-ink">Use a valid 10-digit Indian mobile number starting with 6–9.</p>
          {Boolean(whatsappNumber) && !validWhatsappNumber && <p role="alert" className="mt-1 text-sm text-[#B91F1F]">Enter a valid 10-digit mobile number starting with 6–9.</p>}
          <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl bg-[#F7F8FA] px-3"><input type="checkbox" checked={profile.whatsappAlertsEnabled} disabled={!validWhatsappNumber} onChange={event => setProfile({ ...profile, whatsappAlertsEnabled: event.target.checked })} className="size-4 accent-[#D62828]" aria-describedby="seller-alerts-status" /><span className="text-sm"><strong>Order notifications preference</strong><span className="mt-0.5 block text-xs text-muted-ink">{profile.whatsappAlertsEnabled && validWhatsappNumber ? 'Preference saved' : 'Off'}</span></span></label>
          <p id="seller-alerts-status" role="status" className="mt-3 rounded-xl border border-dashed border-line bg-[#F7F8FA] p-3 text-xs leading-5 text-muted-ink">WhatsApp delivery is unavailable until the messaging connection is enabled. No alerts are sent by this setting today.</p>
        </section>
      )}

      <SecondaryButton onClick={onExit} className="h-12">Return to customer app</SecondaryButton>
      <button type="button" onClick={() => void signOut()} disabled={signingOut} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-[#B91F1F] disabled:opacity-60">{signingOut ? 'Signing out…' : 'Sign out'}</button>
      {signOutError && <p role="alert" className="text-sm text-[#B91F1F]">{signOutError}</p>}
    </section>
  )
}
