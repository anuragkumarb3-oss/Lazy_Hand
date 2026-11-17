'use client'

import { useState, type FormEvent } from 'react'
import { Banknote, Bike, Calculator, Check, ClipboardList, Clock3, Eye, IndianRupee, MapPin, MessageCircle, Package, Pencil, Plus, Power, Search, Store, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { billFor, categories, categoryById, DEFAULT_DELIVERY_DISTANCE_KM, DELIVERY_SLABS, PLATFORM_FEE_SLABS, deliverySlabFor, rupee, seedHistory, type CategoryId, type Order, type Product } from './data'
import { useLazyHand } from './store'
import { BottomNav, PrimaryButton, ProductTile, SecondaryButton, StatusPill, Toggle } from './ui'

const MANAGED_SHOP_ID = 'gupta'

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

export function ShopkeeperDashboard({ onExit, previewMode = false }: { onExit: () => void; previewMode?: boolean }) {
  const { products, shopById, profile, toggleShopOpen, toggleStock, addProduct, updateProduct } = useLazyHand()
  const [tab, setTab] = useState<'orders' | 'products' | 'earnings' | 'account'>('orders')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productQuery, setProductQuery] = useState('')
  const [showProfitCalculator, setShowProfitCalculator] = useState(false)
  const [previewOrders, setPreviewOrders] = useState(() => seedHistory.filter(order => order.shopId === MANAGED_SHOP_ID))
  const shop = shopById[MANAGED_SHOP_ID]
  const shopOrders = previewMode ? previewOrders.filter(order => order.placedAt === 'Today') : []
  const setPreviewOrderStatus = (orderId: string, status: Order['status']) => {
    setPreviewOrders(current => current.map(order => order.id === orderId ? { ...order, status } : order))
  }
  const incoming = shopOrders.filter(order => order.status === 'placed')
  const packing = shopOrders.filter(order => order.status === 'accepted')
  const ready = shopOrders.filter(order => order.status === 'ready')
  const outForDelivery = shopOrders.filter(order => order.status === 'picked')
  const completed = shopOrders.filter(order => order.status === 'delivered')
  const revenue = shopOrders.filter(order => order.status !== 'rejected').reduce((sum, order) => sum + order.itemTotal, 0)
  const myProducts = previewMode ? products.filter(product => product.shopId === MANAGED_SHOP_ID) : []
  const visibleProducts = myProducts.filter(product => product.name.toLowerCase().includes(productQuery.toLowerCase()))
  const inStockCount = myProducts.filter(product => product.inStock).length
  const openProductForm = () => {
    if (!previewMode) return
    setTab('products')
    setEditingProduct(null)
    setShowProductForm(true)
  }

  return (
    <div className="min-h-svh bg-[#F7F8FA] pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-ink">
      <PartnerHeader
        eyebrow={previewMode ? 'Seller workspace · preview' : 'Seller workspace'}
        title={previewMode ? shop.name : profile.shopName || 'Your shop'}
        right={previewMode ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-[#F7F8FA] px-3 py-2">
            <span className="text-xs font-semibold">{shop.open ? 'Open' : 'Closed'}</span>
            <Toggle checked={shop.open} onChange={() => toggleShopOpen(shop.id)} label="Shop open for orders" />
          </div>
        ) : <span className="rounded-full bg-[#FCE8E8] px-3 py-1.5 text-xs font-semibold text-[#B91F1F]">Status unavailable</span>}
      />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7">
        <section className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-ink">Welcome back</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Here&apos;s your shop at a glance</h1>
        </section>

        {previewMode && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-[#F4C7C7] bg-[#FCE8E8] px-4 py-3 text-sm text-[#7F1D1D]">
            <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p><strong>Preview data</strong> · Orders and product changes shown here are temporary examples, not live seller records.</p>
          </div>
        )}

        <section aria-label="Shop visibility" className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-[0_2px_12px_-10px_#20212433] sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', previewMode && shop.open ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FCE8E8] text-[#B91F1F]')}>
              {previewMode && shop.open ? <Eye className="size-5" aria-hidden="true" /> : <Store className="size-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{previewMode ? shop.open ? 'Shop is visible' : 'Shop is closed' : 'Shop visibility isn’t connected'}</p>
              <p className="mt-1 text-xs leading-5 text-muted-ink">{previewMode ? `${inStockCount} sample products · ordering status is local to this preview` : 'Live availability and product totals are not available in this workspace yet.'}</p>
            </div>
          </div>
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', previewMode && shop.open ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FCE8E8] text-[#991B1B]')}>{previewMode ? shop.open ? 'LIVE' : 'CLOSED' : 'UNAVAILABLE'}</span>
        </section>

        <section aria-labelledby="quick-actions-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 id="quick-actions-heading" className="text-lg font-bold">Quick actions</h2><p className="mt-0.5 text-sm text-muted-ink">Common tasks, right at hand.</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button type="button" onClick={() => previewMode ? openProductForm() : window.location.assign('/seller/catalog')} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-[#E9B6B6] active:scale-[0.99]">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FCE8E8] text-[#B91F1F]"><Plus className="size-5" aria-hidden="true" /></span><span className="text-sm font-semibold">Add product</span>
            </button>
            <button type="button" onClick={() => setTab('products')} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-[#E9B6B6] active:scale-[0.99]">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F7F8FA] text-[#4B5563]"><Package className="size-5" aria-hidden="true" /></span><span className="text-sm font-semibold">Manage products</span>
            </button>
            <button type="button" onClick={() => setTab('earnings')} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-[#E9B6B6] active:scale-[0.99]">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F7F8FA] text-[#4B5563]"><Banknote className="size-5" aria-hidden="true" /></span><span className="text-sm font-semibold">View earnings</span>
            </button>
            <button type="button" onClick={() => setTab('account')} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-[#E9B6B6] active:scale-[0.99]">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F7F8FA] text-[#4B5563]"><Store className="size-5" aria-hidden="true" /></span><span className="text-sm font-semibold">Shop settings</span>
            </button>
          </div>
        </section>

        {tab === 'orders' && (
          <>
            <section aria-labelledby="overview-heading">
              <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="overview-heading" className="text-lg font-bold">Today&apos;s overview</h2><p className="mt-0.5 text-sm text-muted-ink">A quick read on today&apos;s shop activity.</p></div></div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="New orders" value={previewMode ? String(incoming.length) : '—'} />
                <Stat label="Today’s orders" value={previewMode ? String(shopOrders.length) : '—'} />
                <Stat label="Today’s sales" value={previewMode ? rupee(revenue) : '—'} />
                <Stat label="Pending orders" value={previewMode ? String(incoming.length + packing.length + ready.length + outForDelivery.length) : '—'} />
              </dl>
              {!previewMode && <p className="mt-2 text-xs text-muted-ink">Live order and financial reporting isn&apos;t connected to seller accounts yet.</p>}
            </section>

            <section aria-labelledby="order-management-heading">
              <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="order-management-heading" className="text-lg font-bold">Order management</h2><p className="mt-0.5 text-sm text-muted-ink">Keep every order moving to the next step.</p></div>{previewMode && <span className="rounded-full bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold text-[#9A3412]">Preview</span>}</div>
              {previewMode ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[['New', incoming, ClipboardList], ['Preparing', packing, Package], ['Ready for pickup', ready, Bike], ['Out for delivery', outForDelivery, Bike], ['Completed', completed, Check]].map(([label, group, Icon]) => {
                    const ordersForStatus = group as Order[]
                    const StatusIcon = Icon as typeof Package
                    return <section key={label as string} className="rounded-2xl border border-line bg-white p-3 sm:p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{label as string}</h3><span className="grid size-8 place-items-center rounded-lg bg-[#FCE8E8] text-[#B91F1F]"><StatusIcon className="size-4" aria-hidden="true" /></span></div><p className="mt-2 text-2xl font-bold tabular-nums">{ordersForStatus.length}</p><p className="mt-1 text-xs text-muted-ink">{ordersForStatus.length ? 'Sample orders below' : 'No orders in this stage'}</p></section>
                  })}
                </div>
              ) : (
                <Empty Icon={ClipboardList} title="Seller orders aren’t connected yet" detail="Orders placed by customers will appear here once seller order access is enabled. No sample orders are shown." />
              )}
              {previewMode && <div className="mt-3 flex flex-col gap-3">
                {incoming.map(order => <article key={order.id} className="rounded-2xl border border-[#F0BABA] bg-white p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Order #{order.id}</p><p className="mt-1 text-xs text-muted-ink">{order.customerName} · Cash on delivery · {order.placedAt}</p></div><p className="text-base font-bold">{rupee(order.itemTotal)}</p></div><OrderLines order={order} /><p className="mt-3 rounded-xl bg-[#F7F8FA] px-3 py-2 text-xs leading-5 text-muted-ink">Preview totals · seller payout {rupee(order.sellerPayout)} · delivery contribution {rupee(order.sellerDeliveryDeduction)}</p><div className="mt-3 flex gap-2"><SecondaryButton onClick={() => setPreviewOrderStatus(order.id, 'rejected')} className="h-11 text-sm text-[#B91F1F]">Decline</SecondaryButton><PrimaryButton onClick={() => setPreviewOrderStatus(order.id, 'accepted')} className="h-11 text-sm">Accept order</PrimaryButton></div></article>)}
                {packing.map(order => <article key={order.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center justify-between"><p className="text-sm font-bold">Order #{order.id}</p><StatusPill tone="warn">Preparing</StatusPill></div><OrderLines order={order} /><PrimaryButton onClick={() => setPreviewOrderStatus(order.id, 'ready')} className="mt-3 h-11">Mark ready for pickup</PrimaryButton></article>)}
                {ready.map(order => <article key={order.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">Order #{order.id}</p><StatusPill tone="info">{order.status === 'ready' ? 'Ready for pickup' : 'Out for delivery'}</StatusPill></div>{order.status === 'ready' && order.pickupOtp && <p className="mt-2 text-sm text-muted-ink">Pickup code <strong className="tracking-widest text-ink">{order.pickupOtp}</strong></p>}</article>)}
                {outForDelivery.map(order => <article key={order.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">Order #{order.id}</p><StatusPill tone="info">Out for delivery</StatusPill></div><p className="mt-1 text-sm text-muted-ink">Picked up by {order.riderName || 'rider'}</p></article>)}
                {!incoming.length && !packing.length && !ready.length && !outForDelivery.length && <Empty Icon={ClipboardList} title="No new orders" detail="New orders will appear here when they are placed." />}
              </div>}
            </section>

            <section aria-labelledby="recent-activity-heading">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 id="recent-activity-heading" className="text-lg font-bold">Recent activity</h2>{previewMode && <span className="text-xs font-medium text-muted-ink">Preview</span>}</div>
              {previewMode && shopOrders.length ? <ul className="divide-y divide-line rounded-2xl border border-line bg-white px-4">{shopOrders.slice(0, 3).map(order => <li key={order.id} className="flex items-center gap-3 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FCE8E8] text-[#B91F1F]"><Clock3 className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Order #{order.id} · {order.status}</p><p className="mt-0.5 text-xs text-muted-ink">{order.placedAt} · {rupee(order.itemTotal)}</p></div></li>)}</ul> : <p className="rounded-xl border border-dashed border-line bg-white px-4 py-3 text-sm text-muted-ink">{previewMode ? 'No recent activity yet.' : 'Recent activity will appear here when seller events are connected.'}</p>}
            </section>
          </>
        )}

        {tab === 'products' && (
          <section aria-labelledby="products-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="products-heading" className="text-xl font-bold">Products & inventory</h2><p className="mt-1 text-sm text-muted-ink">Manage the items customers can order from your shop.</p></div>{previewMode ? <button type="button" onClick={openProductForm} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep"><Plus className="size-4" aria-hidden="true" /> Add sample product</button> : <a href="/seller/catalog" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep"><Plus className="size-4" aria-hidden="true" /> Open catalog</a>}</div>
            {previewMode ? <>
              <label className="flex h-12 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"><Search className="size-4 text-muted-ink" aria-hidden="true" /><span className="sr-only">Search sample products</span><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-ink" /></label>
              <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#FCE8E8] px-3 py-1.5 text-xs font-semibold text-[#B91F1F]">All products · {myProducts.length}</span><span className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted-ink">In stock · {inStockCount}</span><span className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted-ink">Unavailable · {myProducts.length - inStockCount}</span></div>
              {showProductForm && <ProductEditor key={editingProduct?.id ?? 'new-product'} initial={editingProduct ?? undefined} onCancel={() => { setShowProductForm(false); setEditingProduct(null) }} onSave={product => { if (editingProduct) updateProduct({ ...editingProduct, ...product }); else addProduct(product); setShowProductForm(false); setEditingProduct(null) }} />}
              {visibleProducts.length ? <ul className="grid gap-3 sm:grid-cols-2">{visibleProducts.map(product => <li key={product.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-3.5"><ProductTile category={product.category} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.name}</p><p className="mt-1 text-xs text-muted-ink">{categoryById[product.category].short} · {product.unit}</p><p className="mt-1 text-base font-bold">{rupee(product.price)}</p><p className={cn('mt-1 text-xs font-semibold', product.inStock ? 'text-[#15803D]' : 'text-muted-ink')}>{product.inStock ? 'Available' : 'Out of stock'}</p></div><div className="flex shrink-0 flex-col items-end gap-2"><Toggle checked={product.inStock} onChange={() => toggleStock(product.id)} label={`${product.name} in stock`} /><button type="button" onClick={() => { setEditingProduct(product); setShowProductForm(true) }} aria-label={`Edit ${product.name}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-deep hover:bg-[#FCE8E8]"><Pencil className="size-3.5" aria-hidden="true" /> Edit</button></div></li>)}</ul> : <Empty Icon={Package} title="No matching products" detail="Try another search or add a product to your catalog." />}
              <p className="text-xs text-muted-ink">These preview listings reset when you leave. Use the catalog route to manage connected listings.</p>
              <a href="/seller/catalog" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink">Manage connected catalog</a>
            </> : <Empty Icon={Package} title="Live catalog isn’t available in this workspace" detail="No product data is shown as live. Seller catalog storage and management need to be connected before listing changes can be saved." />}
          </section>
        )}

        {tab === 'earnings' && (
          <section className="flex flex-col gap-4" aria-labelledby="earnings-heading">
            <div><h2 id="earnings-heading" className="text-xl font-bold">Earnings</h2><p className="mt-1 text-sm text-muted-ink">Sales and seller payouts are shown separately.</p></div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Total sales" value={previewMode ? rupee(revenue) : '—'} /><Stat label="Seller earnings" value="—" /><Stat label="Platform fees" value="—" /><Stat label="Pending settlements" value="—" /></dl>
            <div role="status" className="rounded-2xl border border-line bg-white p-4"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FCE8E8] text-[#B91F1F]"><Banknote className="size-5" aria-hidden="true" /></span><div><h3 className="text-sm font-bold">Settlement information unavailable</h3><p className="mt-1 text-sm leading-5 text-muted-ink">This account doesn&apos;t have verified seller settlement history yet. Sales are not profit, and no payout is marked complete.</p></div></div></div>
            {previewMode && <div className="rounded-xl bg-[#FCE8E8] px-4 py-3 text-xs leading-5 text-[#7F1D1D]">Preview sales use example orders only. They do not represent real transactions or earnings.</div>}
            <button type="button" onClick={() => setShowProfitCalculator(value => !value)} aria-expanded={showProfitCalculator} className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-white px-4 text-sm font-semibold"><span className="flex items-center gap-2"><Calculator className="size-4 text-brand" aria-hidden="true" /> Open profit calculator</span><span className="text-xs text-muted-ink">{showProfitCalculator ? 'Hide' : 'Show'}</span></button>
            {showProfitCalculator && <SmartProfitCalculator />}
          </section>
        )}

        {tab === 'account' && <PartnerAccount role="Shopkeeper" onExit={onExit} />}
      </main>
      <BottomNav wide items={[{ key: 'orders', label: 'Orders', Icon: ClipboardList, badge: previewMode ? incoming.length || undefined : undefined }, { key: 'products', label: 'Products', Icon: Package }, { key: 'earnings', label: 'Earnings', Icon: Banknote }, { key: 'account', label: 'Account', Icon: UserRound }]} active={tab} onSelect={setTab} />
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
        <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"><div><dt className="text-xs font-medium text-muted-ink">Name</dt><dd className="mt-1 text-sm font-semibold">{profile.name || 'Not provided'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Phone</dt><dd className="mt-1 text-sm font-semibold">{profile.phone ? `+91 ${profile.phone}` : 'Not provided'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Shop</dt><dd className="mt-1 text-sm font-semibold">{profile.shopName || 'Not provided'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Business category</dt><dd className="mt-1 text-sm font-semibold capitalize">{profile.shopType || 'Not assigned'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Shop address</dt><dd className="mt-1 text-sm font-semibold">{[profile.village, profile.landmark].filter(Boolean).join(' · ') || 'Not provided'}</dd></div><div><dt className="text-xs font-medium text-muted-ink">Shop hours</dt><dd className="mt-1 text-sm font-semibold">Not configured</dd></div></dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Shop availability and payments">
        <div className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center gap-2"><Store className="size-4 text-brand" aria-hidden="true" /><h3 className="text-sm font-bold">Shop availability</h3></div><p className="mt-2 text-sm font-semibold">Not connected</p><p className="mt-1 text-xs leading-5 text-muted-ink">Live open/closed controls aren&apos;t linked to a seller shop record yet.</p></div>
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
