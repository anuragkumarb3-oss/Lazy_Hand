'use client'

import { useEffect, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { Banknote, Bike, Calculator, Check, ClipboardList, IndianRupee, MapPin, MessageCircle, Package, Plus, Power, Search, Store, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { billFor, categories, DEFAULT_DELIVERY_DISTANCE_KM, DELIVERY_SLABS, PLATFORM_FEE_SLABS, deliverySlabFor, rupee, type CategoryId, type Order, type Product } from './data'
import { useLazyHand } from './store'
import { BottomNav, PrimaryButton, SecondaryButton, StatusPill, Toggle } from './ui'

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

export function ShopkeeperDashboard({ onExit }: { onExit: () => void; previewMode?: boolean }) {
  const { profile } = useLazyHand()
  const [tab, setTab] = useState<'orders' | 'products' | 'earnings' | 'account'>('orders')
  const [productQuery, setProductQuery] = useState('')
  const [productAvailability, setProductAvailability] = useState('all')
  const [productCategory, setProductCategory] = useState('all')
  const [showProfitCalculator, setShowProfitCalculator] = useState(false)
  const [earningsRange, setEarningsRange] = useState<'today' | '7d' | '30d'>('7d')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [orderDateFilter, setOrderDateFilter] = useState('all')
  const [actionError, setActionError] = useState('')
  const { data: sellerData, error: sellerDataError, isLoading: sellerDataLoading, mutate: refreshSellerData } = useSWR('/api/seller', async () => {
    const response = await fetch('/api/seller')
    if (!response.ok) throw new Error('Seller workspace could not be loaded.')
    return response.json() as Promise<{ products: Array<{ id: string; category_id: string; name: string; unit: string; price: number | string; stock: number; is_available: boolean; low_stock_threshold: number; images: string[] }>; categories: Array<{ id: string; name: string }>; orders: Array<{ id: string; lines: Order['lines']; item_total: number | string; delivery_fee: number | string; platform_fee: number | string; seller_delivery_deduction: number | string; seller_payout: number | string; total: number | string; payment: 'cod'; status: Order['status']; customer_name: string; address: string; rider_name: string | null; placed_at: string }> }>
  })
  const shopOrders: Order[] = (sellerData?.orders ?? []).map(order => ({
    id: order.id, shopId: '', lines: order.lines, itemTotal: Number(order.item_total), deliveryFee: Number(order.delivery_fee),
    platformFee: Number(order.platform_fee), deliveryDistanceKm: 0, riderPayout: 0,
    sellerDeliveryDeduction: Number(order.seller_delivery_deduction), sellerPayout: Number(order.seller_payout),
    total: Number(order.total), payment: order.payment, status: order.status,
    placedAt: order.placed_at, customerName: order.customer_name,
    address: order.address, riderName: order.rider_name ?? undefined,
  }))
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
        {tab === 'orders' && <>
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

        {tab === 'orders' && (
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
          </section>
        )}

        {tab === 'earnings' && (
          <section className="flex flex-col gap-4" aria-labelledby="earnings-heading">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="earnings-heading" className="text-xl font-bold">Earnings</h2><p className="mt-1 text-sm text-muted-ink">Actual order totals, not profit estimates.</p></div><label className="flex flex-col gap-1 text-xs font-medium text-muted-ink">Period<select value={earningsRange} onChange={event => setEarningsRange(event.target.value as 'today' | '7d' | '30d')} className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label></div>
            <dl className="grid grid-cols-2 gap-3"><Stat label="Gross sales" value={rupee(periodOrders.reduce((total, order) => total + Number(order.item_total), 0))} /><Stat label="Seller earnings" value={rupee(periodOrders.reduce((total, order) => total + Number(order.seller_payout), 0))} /><Stat label="Platform fees" value={rupee(periodOrders.reduce((total, order) => total + Number(order.platform_fee), 0))} /><Stat label="Settlements" value="Not configured" /></dl>
            <section className="rounded-2xl border border-line bg-white p-4" aria-labelledby="sales-chart-heading"><h3 id="sales-chart-heading" className="text-sm font-bold">Daily gross sales</h3><div className="mt-4 flex h-36 items-end gap-2" role="img" aria-label="Daily gross sales chart for the selected period">{salesByDay.map(day => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1 text-center"><span className="truncate text-[10px] font-medium text-muted-ink">{day.total ? rupee(day.total) : '—'}</span><div className="min-h-1 rounded-t-md bg-brand" style={{ height: `${Math.max(4, (day.total / Math.max(1, ...salesByDay.map(item => item.total))) * 80)}%` }} /><span className="text-[10px] text-muted-ink">{day.label}</span></div>)}</div></section>
            <section className="rounded-2xl border border-line bg-white p-4"><h3 className="text-sm font-bold">Order financial breakdown</h3><dl className="mt-3 flex flex-col gap-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-ink">Gross product sales</dt><dd className="font-semibold">{rupee(periodOrders.reduce((total, order) => total + Number(order.item_total), 0))}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-ink">Platform fees recorded</dt><dd className="font-semibold">{rupee(periodOrders.reduce((total, order) => total + Number(order.platform_fee), 0))}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-ink">Seller delivery deductions</dt><dd className="font-semibold">{rupee(periodOrders.reduce((total, order) => total + Number(order.seller_delivery_deduction), 0))}</dd></div><div className="flex justify-between gap-3 border-t border-line pt-3"><dt className="font-semibold">Net seller earnings recorded</dt><dd className="font-bold">{rupee(periodOrders.reduce((total, order) => total + Number(order.seller_payout), 0))}</dd></div><div className="text-xs leading-5 text-muted-ink">Discounts, refunds and adjustments are not recorded in the current order schema; they are excluded. Platform fees are order fees, not seller commission.</div></dl></section>
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
  const sellerTakeHome = productProfit - bill.sellerDeliveryDeduction
  const deliveryContribution = bill.deliveryFee + bill.sellerDeliveryDeduction - bill.riderPayout
  const lazyHandRevenue = deliveryContribution + bill.platformFee
  const riderTransfer = Math.max(0, lazyHandRevenue)
  const marginPercent = sale > 0 ? (sellerTakeHome / sale) * 100 : 0

  return (
    <section className="mt-4 flex flex-col gap-3 pb-4" aria-labelledby="profit-calculator-heading">
      <div>
        <h2 id="profit-calculator-heading" className="text-lg font-bold">Smart Profit Calculator</h2>
        <p className="mt-1 text-xs leading-5 text-muted-ink">Preview customer charges, rider pay and LazyHand revenue separately. No seller commission.</p>
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
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Seller delivery contribution</dt><dd className="font-semibold">−{rupee(bill.sellerDeliveryDeduction)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-dashed border-line pt-2.5 font-bold"><dt>Seller take-home</dt><dd>{rupee(sellerTakeHome)} <span className="text-xs font-medium text-muted-ink">({marginPercent.toFixed(1)}%)</span></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Customer pays</dt><dd className="font-semibold">{rupee(bill.total)}{shopSelfDelivers && <span className="text-xs font-normal text-muted-ink"> · free delivery</span>}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-ink">Platform fee</dt><dd className="font-semibold">{rupee(bill.platformFee)}</dd></div>
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
            <li className="flex justify-between gap-3"><span>Shop keeps item value</span><strong>{rupee(sale)}</strong></li>
            <li className="flex justify-between gap-3 border-t border-white/15 pt-2"><span>LazyHand platform fee</span><strong>{rupee(bill.platformFee)}</strong></li>
            <li className="flex justify-between gap-3"><span>Rider payout</span><strong>{rupee(0)}</strong></li>
          </ol>
        ) : (
          <ol className="mt-3 flex flex-col gap-2 text-xs leading-5 text-white/85">
            <li className="flex justify-between gap-3"><span>Rider collects from customer</span><strong>{rupee(bill.total)}</strong></li>
            <li className="flex justify-between gap-3"><span>Rider keeps distance-based payout</span><strong>−{rupee(bill.riderPayout)}</strong></li>
            <li className="flex justify-between gap-3 border-t border-white/15 pt-2"><span>Rider remits delivery spread + platform fee</span><strong>{rupee(riderTransfer)}</strong></li>
            <li className="flex justify-between gap-3"><span>Seller receives item value</span><strong>{rupee(sale)}</strong></li>
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

export function RiderDashboard({ onExit }: { onExit: () => void }) {
  const { orders, shopById, profile, setOrderStatus, verifyOrderOtp, confirmOrderPayment, remitOrderToSeller } = useLazyHand()
  const [tab, setTab] = useState<'trips' | 'earnings' | 'account'>('trips')
  const [online, setOnline] = useState(true)
  const [handoffCode, setHandoffCode] = useState('')
  const [handoffError, setHandoffError] = useState('')
  const riderName = profile.role === 'rider' && profile.name ? profile.name : 'Sunil (you)'
  const available = orders.filter(o => o.status === 'ready' && !o.riderName)
  const active = orders.filter(o => o.riderName === riderName && ['ready', 'picked'].includes(o.status))
  const completed = orders.filter(o => o.riderName === riderName && o.status === 'delivered')
  const pendingSellerDeposits = completed.filter(order => order.paymentConfirmed && !order.cashRemittedToSeller)
  const totalEarned = completed.reduce((total, order) => total + order.riderPayout, 0)
  const averagePayout = completed.length ? totalEarned / completed.length : deliverySlabFor(DEFAULT_DELIVERY_DISTANCE_KM).riderPayout

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
      <PreviewNote detail="Go online to see demo pickups, accept one trip, then mark it picked up and delivered." />
      <div className="mx-auto max-w-md px-4">
        {tab === 'trips' && (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Trips today" value={String(completed.length)} />
              <Stat label="Earned" value={rupee(totalEarned)} />
              <Stat label="Avg / trip" value={rupee(averagePayout)} />
            </dl>

            {active.map(order => {
              const shop = shopById[order.shopId]
              const picked = order.status === 'picked'
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
                        <span className="block font-semibold">Pick up · {shop.name}</span>
                        <span className="block text-xs text-muted-ink">{order.lines.reduce((s, l) => s + l.qty, 0)} items, packed</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-brand-deep" aria-hidden="true" />
                      <span>
                        <span className="block font-semibold">Drop · {order.customerName}</span>
                        <span className="block text-xs text-muted-ink">{order.address || 'Address shared on pickup'}</span>
                      </span>
                    </li>
                  </ol>
                  {!picked ? (
                    <div className="mt-3 rounded-xl bg-[#FFF8F1] p-3">
                      <label htmlFor={`pickup-code-${order.id}`} className="text-xs font-semibold">Enter the pickup code from the seller</label>
                      <input id={`pickup-code-${order.id}`} inputMode="numeric" maxLength={4} value={handoffCode} onChange={event => { setHandoffCode(event.target.value.replace(/\\D/g, '').slice(0, 4)); setHandoffError('') }} className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3 text-center text-lg tracking-[0.4em] outline-none focus:border-brand" />
                      {handoffError && <p role="alert" className="mt-2 text-xs text-[#B91C1C]">{handoffError}</p>}
                      <PrimaryButton onClick={() => { const verified = verifyOrderOtp(order.id, 'pickup', handoffCode); setHandoffError(verified ? '' : 'That code does not match. Ask the seller to confirm the code.'); if (verified) setHandoffCode('') }} className="mt-3 h-11">Verify pickup code</PrimaryButton>
                    </div>
                  ) : !order.paymentConfirmed ? (
                    <div className="mt-3 rounded-xl bg-[#FEF3C7] p-3 text-xs text-[#92400E]">
                      <p className="font-semibold">Collect {rupee(order.total)} from the customer</p>
                      <p className="mt-1 leading-5">This preview supports cash confirmation only. Never direct a customer to your personal QR or a third-party QR. An approved in-app payment provider must be connected before digital collection.</p>
                      <PrimaryButton onClick={() => confirmOrderPayment(order.id)} className="mt-3 h-11">Confirm cash received</PrimaryButton>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl bg-[#F0FDF4] p-3">
                      <p className="text-xs font-semibold text-[#166534]">Payment confirmed · ask the customer for their delivery code</p>
                      <label htmlFor={`delivery-code-${order.id}`} className="mt-3 block text-xs font-semibold">Customer delivery code</label>
                      <input id={`delivery-code-${order.id}`} inputMode="numeric" maxLength={4} value={handoffCode} onChange={event => { setHandoffCode(event.target.value.replace(/\\D/g, '').slice(0, 4)); setHandoffError('') }} className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3 text-center text-lg tracking-[0.4em] outline-none focus:border-brand" />
                      {handoffError && <p role="alert" className="mt-2 text-xs text-[#B91C1C]">{handoffError}</p>}
                      <PrimaryButton onClick={() => { const verified = verifyOrderOtp(order.id, 'delivery', handoffCode); setHandoffError(verified ? '' : 'Payment must be confirmed and the delivery code must match.'); if (verified) setHandoffCode('') }} className="mt-3 h-11">Verify and complete delivery</PrimaryButton>
                    </div>
                  )}
                </article>
              )
            })}

            {pendingSellerDeposits.length > 0 && (
              <section aria-labelledby="seller-remittance" className="mt-5 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
                <h2 id="seller-remittance" className="text-sm font-bold text-[#9A3412]">Settle with the seller before another trip</h2>
                <p className="mt-1 text-xs leading-5 text-[#9A3412]">Return the order value collected for the seller. Your trip payout stays separate.</p>
                {pendingSellerDeposits.map(order => (
                  <div key={order.id} className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-xs">
                    <span>#{order.id} · seller amount <strong>{rupee(order.itemTotal)}</strong></span>
                    <button type="button" onClick={() => remitOrderToSeller(order.id)} className="min-h-10 rounded-lg bg-brand px-3 font-semibold text-white">Deposit returned</button>
                  </div>
                ))}
                <p className="mt-2 text-[10px] leading-4 text-muted-ink">Demo confirmation only; no funds move or deposit is verified in this preview.</p>
              </section>
            )}

            <section aria-labelledby="available" className="mt-5">
              <h2 id="available" className="text-sm font-bold">Available pickups</h2>
              <div className="mt-2 flex flex-col gap-2.5">
                {!online ? (
                  <Empty Icon={Power} title="You are offline" detail="Go online to see orders that are packed and ready near you." />
                ) : available.length === 0 ? (
                  <Empty Icon={Bike} title="No pickups right now" detail="Demo pickups appear when the sample shop marks an order packed. Accepting one changes only this preview." />
                ) : (
                  available.map(order => (
                    <article key={order.id} className="rounded-2xl border border-line bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold">{shopById[order.shopId].name}</p>
                        <p className="text-sm font-bold text-[#15803D]">+{rupee(order.riderPayout)}</p>
                      </div>
                      <p className="text-xs text-muted-ink">
                        #{order.id} · drop at {order.address || 'nearby'}
                      </p>
                      <PrimaryButton onClick={() => setOrderStatus(order.id, 'ready', riderName)} disabled={active.length > 0 || pendingSellerDeposits.length > 0} className="mt-3 h-10 text-xs">
                        {active.length > 0 ? 'Finish your active trip first' : pendingSellerDeposits.length > 0 ? 'Return seller cash first' : 'Accept trip'}
                      </PrimaryButton>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {tab === 'earnings' && (
          <section className="mt-4" aria-labelledby="earnings-heading">
            <h2 id="earnings-heading" className="text-sm font-bold">Earnings</h2>
            <div className="mt-2 rounded-2xl bg-ink p-5 text-white">
              <p className="text-xs text-white/70">Today</p>
              <p className="text-3xl font-bold">{rupee(totalEarned)}</p>
              <p className="mt-1 text-xs text-white/70">
                {completed.length} delivered trips · payout varies by distance
              </p>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {completed.length === 0 && <Empty Icon={IndianRupee} title="No completed trips yet" detail="Each delivered order adds ₹20 here." />}
              {completed.map(o => (
                <li key={o.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-sm">
                  <span>
                    #{o.id} · {shopById[o.shopId].name}
                  </span>
                  <span className="font-semibold text-[#15803D]">+{rupee(o.riderPayout)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'earnings' && <RiderEarningsSimulator />}
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
