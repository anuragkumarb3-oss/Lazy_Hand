'use client'

import { useState, type FormEvent } from 'react'
import { Banknote, Bike, Calculator, Check, ClipboardList, Eye, IndianRupee, MapPin, MessageCircle, Package, Pencil, Plus, Power, Store, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { billFor, categories, DEFAULT_DELIVERY_DISTANCE_KM, DELIVERY_SLABS, PLATFORM_FEE_SLABS, deliverySlabFor, rupee, type CategoryId, type Order, type Product } from './data'
import { useLazyHand } from './store'
import { BottomNav, PrimaryButton, ProductTile, SecondaryButton, StatusPill, Toggle } from './ui'

const MANAGED_SHOP_ID = 'gupta'

function PartnerHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="bg-gradient-to-br from-brand to-[#FFA94D] px-4 pb-5 pt-[max(env(safe-area-inset-top),18px)] text-white">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-white/70">{eyebrow}</p>
          <h1 className="truncate text-lg font-bold">{title}</h1>
        </div>
        {right}
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <dt className="text-[11px] text-muted-ink">{label}</dt>
      <dd className="text-lg font-bold">{value}</dd>
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

export function ShopkeeperDashboard({ onExit }: { onExit: () => void }) {
  const { orders, products, shopById, toggleShopOpen, toggleStock, addProduct, updateProduct, setOrderStatus } = useLazyHand()
  const [tab, setTab] = useState<'orders' | 'products' | 'calculator' | 'account'>('products')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const shop = shopById[MANAGED_SHOP_ID]
  const shopOrders = orders.filter(o => o.shopId === MANAGED_SHOP_ID && o.placedAt === 'Today')
  const incoming = shopOrders.filter(o => o.status === 'placed')
  const packing = shopOrders.filter(o => o.status === 'accepted')
  const handedOver = shopOrders.filter(o => ['ready', 'picked', 'delivered'].includes(o.status))
  const revenue = shopOrders.filter(o => o.status !== 'rejected').reduce((s, o) => s + o.itemTotal, 0)
  const myProducts = products.filter(p => p.shopId === MANAGED_SHOP_ID)
  const inStockCount = myProducts.filter(product => product.inStock).length
  const openProductForm = () => {
    setTab('products')
    setEditingProduct(null)
    setShowProductForm(true)
  }

  return (
    <div className="pb-24">
      <PartnerHeader
        eyebrow="Shopkeeper · sample shop"
        title={shop.name}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{shop.open ? 'Open' : 'Closed'}</span>
            <Toggle checked={shop.open} onChange={() => toggleShopOpen(shop.id)} label="Shop open for orders" />
          </div>
        }
      />
      <PreviewNote detail="Shop status pauses customer orders; accept new orders, pack them, and hand them off to a rider." />
      <div className="mx-auto max-w-md px-4">
        {tab === 'orders' && (
          <section aria-label="Shop visibility" className="mt-4 rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', shop.open ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#B91C1C]')}>
                  {shop.open ? <Eye className="size-5" aria-hidden="true" /> : <Store className="size-5" aria-hidden="true" />}
                </span>
                <div>
                  <p className="text-sm font-bold">{shop.open ? 'Your shop is visible' : 'Your shop is hidden from orders'}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-ink">{shop.open ? `${inStockCount} products are available for customers to browse.` : 'Open your shop to let nearby customers place orders.'}</p>
                </div>
              </div>
              <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', shop.open ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]')}>{shop.open ? 'LIVE' : 'CLOSED'}</span>
            </div>
            <button type="button" onClick={openProductForm} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white transition hover:bg-brand-deep">
              <Plus className="size-4" aria-hidden="true" /> Add a product
            </button>
          </section>
        )}
        {tab === 'orders' && (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="New" value={String(incoming.length)} />
              <Stat label="Today" value={String(shopOrders.length)} />
              <Stat label="Sales" value={rupee(revenue)} />
            </dl>
            {!shop.open && (
              <p className="mt-3 rounded-xl bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">Your shop is closed. Customers can see it but can&apos;t order until you switch it on.</p>
            )}
            <section aria-labelledby="new-orders" className="mt-5">
              <h2 id="new-orders" className="text-sm font-bold">New orders</h2>
              <div className="mt-2 flex flex-col gap-2.5">
                {incoming.length === 0 && <Empty Icon={ClipboardList} title="No new orders" detail="Accept or decline a demo order. Accepted orders move to Packing; no customer is notified." />}
                {incoming.map(order => (
                  <article key={order.id} className="rounded-2xl border-2 border-brand bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">#{order.id}</p>
                      <p className="text-sm font-bold">{rupee(order.itemTotal)}</p>
                    </div>
                    <p className="text-xs text-muted-ink">
                      {order.customerName} · Cash on delivery
                    </p>
                    <OrderLines order={order} />
                    <p className="mt-3 rounded-xl bg-[#FFF8F1] px-3 py-2 text-xs leading-5 text-brand-deep">
                      Customer pays {rupee(order.total)} · seller receives {rupee(order.itemTotal)} · rider payout {rupee(order.riderPayout)} · LazyHand keeps {rupee(order.deliveryFee - order.riderPayout + order.platformFee)}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <SecondaryButton onClick={() => setOrderStatus(order.id, 'rejected')} className="h-10 text-xs text-[#B91C1C]">
                        <X className="size-4" aria-hidden="true" /> Decline
                      </SecondaryButton>
                      <PrimaryButton onClick={() => setOrderStatus(order.id, 'accepted')} className="h-10 text-xs">
                        <Check className="size-4" aria-hidden="true" /> Accept
                      </PrimaryButton>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section aria-labelledby="packing" className="mt-5">
              <h2 id="packing" className="text-sm font-bold">Packing</h2>
              <div className="mt-2 flex flex-col gap-2.5">
                {packing.length === 0 && <p className="text-xs text-muted-ink">Accepted orders wait here until you pack them.</p>}
                {packing.map(order => (
                  <article key={order.id} className="rounded-2xl border border-line bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">#{order.id}</p>
                      <StatusPill tone="warn">Packing</StatusPill>
                    </div>
                    <OrderLines order={order} />
                    <PrimaryButton onClick={() => setOrderStatus(order.id, 'ready')} className="mt-3 h-10 text-xs">
                      <Package className="size-4" aria-hidden="true" /> Packed · call rider
                    </PrimaryButton>
                  </article>
                ))}
              </div>
            </section>
            {handedOver.length > 0 && (
              <section aria-labelledby="done" className="mt-5">
                <h2 id="done" className="text-sm font-bold">Handed to rider</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {handedOver.map(order => (
                    <li key={order.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-sm">
                      <span>#{order.id}</span>
                      <StatusPill tone={order.status === 'delivered' ? 'open' : 'info'}>{order.status === 'ready' ? 'Awaiting rider' : order.status === 'picked' ? 'On the way' : 'Delivered'}</StatusPill>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {tab === 'calculator' && <SmartProfitCalculator />}

        {tab === 'products' && (
          <section aria-labelledby="products-heading" className="mt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="products-heading" className="text-lg font-bold">Products & inventory</h2>
                <p className="mt-1 text-xs leading-5 text-muted-ink">Customers can see in-stock items while your shop is open.</p>
                <a href="/seller/catalog" className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-brand-deep">Manage live catalog</a>
              </div>
              <button type="button" onClick={() => { setEditingProduct(null); setShowProductForm(true) }} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-deep">
                <Plus className="size-4" aria-hidden="true" /> Add product
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#FFF8F1] px-3 py-2.5 text-xs text-brand-deep">
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              <span><strong>{inStockCount} visible</strong> to customers · {myProducts.length - inStockCount} out of stock</span>
            </div>
            <p role="status" className="mt-2 text-[11px] text-muted-ink">Preview only: product changes update the sample catalog immediately and reset when you leave.</p>
            {showProductForm && (
              <ProductEditor
                key={editingProduct?.id ?? 'new-product'}
                initial={editingProduct ?? undefined}
                onCancel={() => { setShowProductForm(false); setEditingProduct(null) }}
                onSave={product => {
                  if (editingProduct) updateProduct({ ...editingProduct, ...product })
                  else addProduct(product)
                  setShowProductForm(false)
                  setEditingProduct(null)
                }}
              />
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {myProducts.map(p => (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
                  <ProductTile category={p.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-ink">{p.unit} · {rupee(p.price)}</p>
                    <p className={cn('mt-1 text-[11px] font-semibold', p.inStock ? 'text-[#15803D]' : 'text-muted-ink')}>{p.inStock ? 'Visible in catalog' : 'Out of stock'}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Toggle checked={p.inStock} onChange={() => toggleStock(p.id)} label={`${p.name} in stock`} />
                    <button type="button" onClick={() => { setEditingProduct(p); setShowProductForm(true) }} aria-label={`Edit ${p.name}`} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-deep hover:bg-[#FFF8F1]">
                      <Pencil className="size-3.5" aria-hidden="true" /> Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'account' && <PartnerAccount role="Shopkeeper" onExit={onExit} />}
      </div>
      <BottomNav
        items={[
          { key: 'orders', label: 'Orders', Icon: ClipboardList, badge: incoming.length || undefined },
          { key: 'products', label: 'Products', Icon: Package },
          { key: 'calculator', label: 'Profit', Icon: Calculator },
          { key: 'account', label: 'Account', Icon: UserRound },
        ]}
        active={tab}
        onSelect={setTab}
      />
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
  const sellerTakeHome = productProfit
  const deliveryContribution = bill.deliveryFee - bill.riderPayout
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
  const { orders, shopById, profile, setOrderStatus } = useLazyHand()
  const [tab, setTab] = useState<'trips' | 'earnings' | 'account'>('trips')
  const [online, setOnline] = useState(true)
  const riderName = profile.role === 'rider' && profile.name ? profile.name : 'Sunil (you)'
  const available = orders.filter(o => o.status === 'ready' && !o.riderName)
  const active = orders.filter(o => o.riderName === riderName && ['ready', 'picked'].includes(o.status))
  const completed = orders.filter(o => o.riderName === riderName && o.status === 'delivered')
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
                  {order.payment === 'cod' && (
                    <p className="mt-3 rounded-xl bg-[#FEF3C7] px-3 py-2 text-xs font-medium text-[#92400E]">Collect {rupee(order.total)} cash at the door</p>
                  )}
                  <PrimaryButton onClick={() => setOrderStatus(order.id, picked ? 'delivered' : 'picked')} className="mt-3 h-11">
                    {picked ? 'Mark delivered' : 'Picked up from shop'}
                  </PrimaryButton>
                </article>
              )
            })}

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
                      <PrimaryButton onClick={() => setOrderStatus(order.id, 'ready', riderName)} disabled={active.length > 0} className="mt-3 h-10 text-xs">
                        {active.length > 0 ? 'Finish your active trip first' : 'Accept trip'}
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
  const whatsappNumber = profile.whatsappNumber.replace(/\D/g, '').slice(-10)
  const validWhatsappNumber = /^[6-9]\d{9}$/.test(whatsappNumber)

  return (
    <section className="mt-4 flex flex-col gap-3">
      <div className="rounded-2xl border border-line bg-white p-4">
        <p className="text-xs text-muted-ink">Demo profile · not signed in</p>
        <p className="text-sm font-semibold">{profile.name || 'Preview user'}</p>
        <p className="text-xs text-muted-ink">
          {role}
          {profile.phone && ` · +91 ${profile.phone}`}
        </p>
        {profile.shopName && <p className="mt-2 text-xs text-muted-ink">Registered shop: {profile.shopName} ({profile.shopType}) — pending review. You&apos;re managing a sample shop until it&apos;s approved.</p>}
        {profile.vehicle && <p className="mt-2 text-xs text-muted-ink">Vehicle: {profile.vehicle}</p>}
      </div>

      {role === 'Shopkeeper' && (
        <section className="rounded-2xl border border-line bg-white p-4" aria-labelledby="whatsapp-alerts-heading">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E8F7ED] text-[#16803C]">
              <MessageCircle className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="whatsapp-alerts-heading" className="text-sm font-bold">WhatsApp order alerts</h2>
              <p className="mt-1 text-xs leading-5 text-muted-ink">Set the shop&apos;s WhatsApp number. Alerts stay off until a VPS connection is available.</p>
            </div>
          </div>

          <label htmlFor="seller-whatsapp" className="mt-4 block text-xs font-semibold">Shop WhatsApp number</label>
          <div className="mt-1.5 flex h-11 items-center rounded-xl border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
            <span className="border-r border-line px-3 text-sm text-muted-ink">+91</span>
            <input
              id="seller-whatsapp"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={whatsappNumber}
              onChange={event => setProfile({ ...profile, whatsappNumber: event.target.value.replace(/\D/g, '').slice(0, 10) })}
              placeholder="98765 43210"
              aria-describedby="seller-whatsapp-help"
              aria-invalid={Boolean(whatsappNumber) && !validWhatsappNumber}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
            />
          </div>
          <p id="seller-whatsapp-help" className="mt-1.5 text-[11px] leading-4 text-muted-ink">Use a WhatsApp number with a valid 10-digit Indian mobile number.</p>
          {Boolean(whatsappNumber) && !validWhatsappNumber && <p role="alert" className="mt-1 text-xs text-[#B91C1C]">Enter a valid 10-digit mobile number starting with 6–9.</p>}

          <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl bg-[#F7F8F6] px-3">
            <input
              type="checkbox"
              checked={profile.whatsappAlertsEnabled}
              disabled={!validWhatsappNumber}
              onChange={event => setProfile({ ...profile, whatsappAlertsEnabled: event.target.checked })}
              className="size-4 accent-[#16803C]"
              aria-describedby="seller-alerts-status"
            />
            <span className="text-xs"><strong>Order notifications</strong><span className="mt-0.5 block text-[11px] text-muted-ink">{profile.whatsappAlertsEnabled && validWhatsappNumber ? 'Enabled in this preview' : 'Off'}</span></span>
          </label>

          <div id="seller-alerts-status" className="mt-3 rounded-xl border border-dashed border-line bg-[#FAF9F6] p-3" role="status" aria-live="polite">
            <p className="text-xs font-semibold">{validWhatsappNumber ? 'Manual mode · ready for VPS pairing' : 'Add a number to get started'}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-ink">{validWhatsappNumber ? 'This preview does not send WhatsApp messages or show a scannable pairing QR. Until your VPS bridge is connected, use the Orders tab to check new orders manually.' : 'A pairing QR will be shown once a WhatsApp bridge is connected. No QR or messages are simulated here.'}</p>
          </div>
        </section>
      )}

      <SecondaryButton onClick={onExit}>Switch to customer app</SecondaryButton>
    </section>
  )
}
