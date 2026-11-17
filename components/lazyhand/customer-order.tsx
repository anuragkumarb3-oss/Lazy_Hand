'use client'

import { useState } from 'react'
import {
  Banknote,
  Bike,
  Check,
  ChevronRight,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
} from 'lucide-react'
import { Lottie } from 'lottie-react'
import orderSuccessAnimation from '../../public/animations/order-success.json'
import { cn } from '@/lib/utils'
import { billFor, DEFAULT_DELIVERY_DISTANCE_KM, DELIVERY_SLABS, deliverySlabFor, FREE_DELIVERY_THRESHOLD, rupee, type Order, type OrderStatus, type Role } from './data'
import { useLazyHand } from './store'
import { BackButton, PrimaryButton, ProductTile, QtyControl, SecondaryButton, StatusPill } from './ui'

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line/80 bg-white/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] backdrop-blur">
      <BackButton onClick={onBack} />
      <h1 className="text-base font-bold">{title}</h1>
    </header>
  )
}

function DeliveryGoal({ itemTotal }: { itemTotal: number }) {
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD - itemTotal)
  const progress = Math.min(100, (itemTotal / FREE_DELIVERY_THRESHOLD) * 100)

  return (
    <section className="rounded-3xl border border-[#FECACA] bg-[#FFF7F7] p-3.5" aria-label="Delivery discount progress">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[#991B1B]" role="status">
          {remaining > 0 ? `Add ${rupee(remaining)} more for 50% off delivery` : 'You unlocked 50% off delivery'}
        </p>
        <Truck className="size-4 shrink-0 text-[#B91C1C]" aria-hidden="true" />
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#FEE2E2]" role="progressbar" aria-label="Delivery discount progress" aria-valuemin={0} aria-valuemax={FREE_DELIVERY_THRESHOLD} aria-valuenow={Math.min(itemTotal, FREE_DELIVERY_THRESHOLD)}>
        <div className="h-full rounded-full bg-[#DC2626] transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-[#991B1B]">50% off delivery on orders of {rupee(FREE_DELIVERY_THRESHOLD)} or more</p>
    </section>
  )
}

function BillRows({ itemTotal, distanceKm = DEFAULT_DELIVERY_DISTANCE_KM, multiStore = false }: { itemTotal: number; distanceKm?: number; multiStore?: boolean }) {
  const bill = billFor(itemTotal, distanceKm, false, { multiStore })
  return (
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-ink">Item total</dt>
        <dd>{rupee(bill.itemTotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-ink">Delivery</dt>
        <dd className={bill.deliveryFee === 0 ? 'font-semibold text-[#15803D]' : undefined}>{bill.deliveryFee === 0 ? 'Free' : rupee(bill.deliveryFee)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-ink">Platform fee</dt>
        <dd className="font-semibold">{multiStore || bill.platformFee === 0 ? 'Free' : rupee(bill.platformFee)}</dd>
      </div>
      {bill.multiStoreSurcharge > 0 && <div className="flex justify-between"><dt className="text-muted-ink">Multi-store checkout</dt><dd className="font-semibold">{rupee(bill.multiStoreSurcharge)}</dd></div>}
      <div className="mt-1 flex justify-between border-t border-dashed border-line pt-3 text-base font-bold">
        <dt>To pay</dt>
        <dd>{rupee(bill.total)}</dd>
      </div>
    </dl>
  )
}

export function CartScreen({ onBack, onCheckout, onBrowse }: { onBack: () => void; onCheckout: () => void; onBrowse: () => void }) {
  const { cartLines, cartTotal, cart, shopById, products, addItem, removeItem, setDeliveryDistance } = useLazyHand()
  const storeIds = Array.from(new Set(cartLines.map(({ product }) => product.shopId)))
  const multiStore = storeIds.length > 1
  if (!cartLines.length || !cart.shopId) {
    return (
      <div className="flex min-h-svh flex-col">
        <TopBar title="Your cart" onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-peach text-brand-deep">
            <ShoppingBag className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-bold">Your cart is empty</h2>
          <p className="mt-1 text-sm text-muted-ink">Add items from a nearby shop to get started.</p>
          <PrimaryButton onClick={onBrowse} className="mt-6 w-auto px-6">Browse shops</PrimaryButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col pb-28">
      <TopBar title="Your cart" onBack={onBack} />
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-4">
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-white p-3.5 text-sm">
          <Truck className="size-4 shrink-0 text-brand-deep" aria-hidden="true" />
          <p>Fair delivery pricing · <strong className="text-brand-deep">distance-based fees, no seller commission</strong></p>
        </div>

        {!multiStore && <DeliveryGoal itemTotal={cartTotal} />}
        {multiStore && <p className="rounded-2xl border border-line bg-white p-3 text-xs text-muted-ink">One rider collects your separate orders. Delivery and platform fees are free, plus one {rupee(39)} multi-store fee.</p>}

        <section className="rounded-2xl border border-line bg-white px-3.5" aria-label="Cart items">
          <ul>
            {cartLines.map(({ product, qty }, index) => (
              <li key={product.id} className="flex flex-col border-b border-line last:border-b-0">
                {(index === 0 || cartLines[index - 1].product.shopId !== product.shopId) && <p className="flex items-center gap-2 border-b border-line py-3 text-xs font-semibold text-muted-ink"><Store className="size-3.5" aria-hidden="true" />{shopById[product.shopId]?.name ?? 'Local store'}</p>}
                <div className="flex items-center gap-3 py-3">
                <ProductTile category={product.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{product.name}</p>
                  <p className="text-xs text-muted-ink">{product.unit}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <QtyControl qty={qty} onAdd={() => addItem(product.id)} onRemove={() => removeItem(product.id)} label={product.name} />
                  <span className="text-sm font-semibold">{rupee(product.price * qty)}</span>
                </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {(() => {
          const basketCategories = new Set(cartLines.map(({ product }) => product.category))
          const complementaryCategories = new Set(
            cartLines.flatMap(({ product }) => {
              if (product.category === 'snacks') return ['drinks']
              if (product.category === 'drinks') return ['snacks']
              if (product.category === 'dairy') return ['bakery', 'eggs']
              if (product.category === 'bakery') return ['dairy']
              if (product.category === 'staples') return ['veg', 'dairy']
              if (product.category === 'veg') return ['staples']
              if (product.category === 'instant') return ['drinks', 'snacks']
              return ['dairy', 'bakery']
            }),
          )
          const suggestions = products
            .filter(product => product.shopId === cart.shopId && product.inStock && !cart.items[product.id])
            .sort((a, b) => Number(complementaryCategories.has(b.category)) - Number(complementaryCategories.has(a.category)) || Number(basketCategories.has(b.category)) - Number(basketCategories.has(a.category)))
            .slice(0, 2)

          return suggestions.length ? (
            <section className="rounded-2xl border border-line bg-white px-3.5" aria-labelledby="suggestions-heading">
              <h2 id="suggestions-heading" className="flex items-center gap-2 border-b border-line py-3 text-sm font-bold">
                <Sparkles className="size-4 text-brand-deep" aria-hidden="true" /> Goes well with your picks
              </h2>
              <ul>
                {suggestions.map(product => (
                  <li key={product.id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                    <ProductTile category={product.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
                      <p className="text-xs text-muted-ink">{product.unit} · {rupee(product.price)}</p>
                    </div>
                    <QtyControl qty={0} onAdd={() => addItem(product.id)} onRemove={() => removeItem(product.id)} label={product.name} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        })()}

        <section className="rounded-2xl border border-line bg-white p-4" aria-labelledby="distance-heading">
          <label htmlFor="delivery-distance" className="text-xs font-semibold">Estimated shop-to-door distance</label>
          <select id="delivery-distance" value={cart.deliveryDistanceKm} onChange={event => setDeliveryDistance(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
            {DELIVERY_SLABS.map(option => <option key={option.label} value={option.maxDistanceKm}>{option.label} · delivery {rupee(option.customerFee)}</option>)}
          </select>
          <p id="distance-heading" className="mt-2 text-[10px] leading-4 text-muted-ink">Distance is an estimate in this preview; live route measurement is not connected.</p>
        </section>

        <section className="rounded-2xl border border-line bg-white p-4" aria-labelledby="bill-heading">
          <h2 id="bill-heading" className="mb-3 text-sm font-bold">Bill details</h2>
          <BillRows itemTotal={cartTotal} distanceKm={cart.deliveryDistanceKm} multiStore={multiStore} />
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
        <div className="mx-auto max-w-md">
          <PrimaryButton onClick={onCheckout}>
            Proceed to checkout · {rupee(billFor(cartTotal, cart.deliveryDistanceKm, false, { multiStore }).total)}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

export function PaymentScreen({ area, onBack, onPlaced, onEditAddress, canPlaceOrder, onSignIn }: { area: string; onBack: () => void; onPlaced: (order: Order) => void; onEditAddress: () => void; canPlaceOrder: boolean; onSignIn: () => void }) {
  const { cartTotal, cartCount, cartLines, cart, shopById, profile, placeOrder } = useLazyHand()
  const storeIds = Array.from(new Set(cartLines.map(({ product }) => product.shopId)))
  const multiStore = storeIds.length > 1
  const [error, setError] = useState('')
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null)
  const [isPlacing, setIsPlacing] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const address = [profile.village || area, profile.landmark].filter(Boolean).join(', ')
  const addressMissing = !address || address === 'Set your location'
  const shop = cart.shopId ? shopById[cart.shopId] : null

  const place = async () => {
    if (addressMissing) {
      setError('Add a delivery address before placing the order')
      return
    }
    if (shop && !shop.open) {
      setError(`${shop.name} just closed. Try another shop.`)
      return
    }
    setError('')
    setIsSavingOrder(true)
    try {
      const order = await placeOrder('cod', address)
      if (order) {
        setPlacedOrder(order)
        setIsPlacing(true)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your order could not be saved. Please try again.')
    } finally {
      setIsSavingOrder(false)
    }
  }

  if (isPlacing && placedOrder) return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center" aria-live="polite" aria-atomic="true">
      <div className="w-full max-w-56" aria-hidden="true">
        <Lottie src={orderSuccessAnimation} loop={false} autoplay className="w-full" subscriptions={{ complete: () => onPlaced(placedOrder) }} />
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-[#15803D]">Order confirmed</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Your order is placed</h1>
      <p className="mt-2 max-w-xs text-sm leading-6 text-muted-ink">We&apos;re confirming with the shop and finding a nearby rider.</p>
    </main>
  )

  return (
    <div className="flex min-h-svh flex-col pb-28">
      <TopBar title="Checkout" onBack={onBack} />
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-4">
        <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_6px_22px_-18px_#6B4A34]" aria-labelledby="deliver-heading">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-peach text-brand-deep">
              <Home className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="deliver-heading" className="text-xs text-muted-ink">Deliver to {profile.name || 'you'}</h2>
              {addressMissing ? (
                <p className="mt-1 text-sm font-semibold text-brand-deep">Delivery address · Required</p>
              ) : (
                <p className="text-sm font-semibold">{address}</p>
              )}
              {profile.phone && <p className="text-xs text-muted-ink">+91 {profile.phone}</p>}
            </div>
            <button type="button" onClick={onEditAddress} className="text-xs font-semibold text-brand-deep">
              {addressMissing ? 'Add address' : 'Change'}
            </button>
          </div>
          {shop && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-xs text-muted-ink">
              <Bike className="size-4 text-brand-deep" aria-hidden="true" /> Arriving in {shop.eta} from {shop.name}
            </p>
          )}
        </section>

        {!multiStore && <DeliveryGoal itemTotal={cartTotal} />}
        {multiStore && <p className="rounded-2xl border border-line bg-white p-3 text-xs text-muted-ink">One rider collects {storeIds.length} separate store orders. A single ₹39 fee applies; delivery and platform fees are free.</p>}

        <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_6px_22px_-18px_#6B4A34]" aria-labelledby="pay-heading">
          <h2 id="pay-heading" className="mb-2 text-sm font-bold">Payment</h2>
          <div className="flex items-center gap-3 rounded-xl border border-brand bg-[#FFF5EC] p-3">
            <Banknote className="size-5 shrink-0 text-brand-deep" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Cash on delivery</p>
              <p className="text-xs text-muted-ink">Pay the rider in cash. Paytm and other digital payment options aren&apos;t connected in this preview.</p>
            </div>
            <Check className="ml-auto size-4 shrink-0 text-brand-deep" aria-hidden="true" />
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_6px_22px_-18px_#6B4A34]">
          <h2 className="mb-3 text-sm font-bold">
            Order summary <span className="font-normal text-muted-ink">({cartCount} items)</span>
          </h2>
          <ul className="mb-3 flex flex-col gap-2 border-b border-line pb-3 text-xs">
            {cartLines.map(({ product, qty }) => (
              <li key={product.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-muted-ink">{qty} × {product.name}</span>
                <span className="shrink-0">{rupee(product.price * qty)}</span>
              </li>
            ))}
          </ul>
          <BillRows itemTotal={cartTotal} distanceKm={cart.deliveryDistanceKm} multiStore={multiStore} />
        </section>
        {error && (
          <p role="alert" className="rounded-xl bg-[#FEF2F2] p-3 text-sm text-[#991B1B]">
            {error}
          </p>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
        <div className="mx-auto max-w-md">
          {canPlaceOrder ? (
            <PrimaryButton onClick={() => void place()} disabled={isSavingOrder}>{isSavingOrder ? 'Saving order…' : `Place order · ${rupee(billFor(cartTotal, cart.deliveryDistanceKm, false, { multiStore }).total)}`}</PrimaryButton>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-center text-xs leading-5 text-muted-ink">Guest preview only. Sign in to save and place this order.</p>
              <PrimaryButton onClick={onSignIn}>Sign in to place order</PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const trackSteps: { status: OrderStatus; label: string; detail: string }[] = [
  { status: 'placed', label: 'Order placed', detail: 'Waiting for the shop to accept' },
  { status: 'accepted', label: 'Shop is packing', detail: 'Your items are being packed' },
  { status: 'ready', label: 'Ready for pickup', detail: 'Finding a nearby rider' },
  { status: 'picked', label: 'On the way', detail: 'Rider is coming to you' },
  { status: 'delivered', label: 'Delivered', detail: 'Enjoy your order!' },
]
const statusIndex = (s: OrderStatus) => trackSteps.findIndex(t => t.status === s)

export function TrackingScreen({ orderId, onBack, onViewAs }: { orderId: string; onBack: () => void; onViewAs: (role: Role) => void }) {
  const { orders, shopById } = useLazyHand()
  const order = orders.find(o => o.id === orderId)
  if (!order) return null
  const shop = shopById[order.shopId]
  const current = statusIndex(order.status)
  const rejected = order.status === 'rejected'

  return (
    <div className="flex min-h-svh flex-col pb-10">
      <TopBar title={`Order #${order.id}`} onBack={onBack} />
      <div className="relative h-44 overflow-hidden bg-[#F3EDE4]" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#E9E1D6_1px,transparent_1px),linear-gradient(#E9E1D6_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="absolute left-[18%] right-[18%] top-1/2 border-t-[3px] border-dashed border-brand" />
        <span className="absolute left-[12%] top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-brand-deep shadow">
          <Store className="size-5" />
        </span>
        <span
          className="absolute top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-white shadow-lg transition-all duration-700"
          style={{ left: `${18 + (Math.max(current, 0) / 4) * 64}%` }}
        >
          <Bike className="size-5" />
        </span>
        <span className="absolute right-[12%] top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-[#15803D] shadow">
          <Home className="size-5" />
        </span>
      </div>
      <div className="mx-auto -mt-6 flex w-full max-w-md flex-col gap-3 px-4">
        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm" aria-live="polite">
          {rejected ? (
            <>
              <h2 className="text-lg font-bold text-[#B91C1C]">Order declined</h2>
              <p className="mt-1 text-sm text-muted-ink">{shop.name} couldn&apos;t take this order. You were not charged.</p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-ink">{order.status === 'delivered' ? 'Delivered' : `Arriving in ${shop.eta}`}</p>
              <h2 className="text-lg font-bold">{trackSteps[current].label}</h2>
              <ol className="mt-4 flex flex-col">
                {trackSteps.map((step, i) => {
                  const done = i <= current
                  return (
                    <li key={step.status} className="flex gap-3">
                      <span className="flex flex-col items-center">
                        <span className={cn('grid size-6 place-items-center rounded-full border-2', done ? 'border-brand bg-brand text-white' : 'border-line bg-white')}>
                          {done && <Check className="size-3.5" aria-hidden="true" />}
                        </span>
                        {i < trackSteps.length - 1 && <span className={cn('w-0.5 flex-1', i < current ? 'bg-brand' : 'bg-line')} />}
                      </span>
                      <span className="pb-4">
                        <span className={cn('block text-sm font-semibold', !done && 'text-muted-ink')}>{step.label}</span>
                        <span className="block text-xs text-muted-ink">{i === current ? step.detail : done ? 'Done' : ''}</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </section>

        {order.status === 'picked' && order.deliveryOtp && (
          <section className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4" aria-labelledby="delivery-code-heading">
            <h2 id="delivery-code-heading" className="text-sm font-bold">Your delivery code</h2>
            <p className="mt-1 text-xs leading-5 text-[#9A3412]">Pay the rider first. Only then tell them this code to confirm delivery. Never share it before payment is complete.</p>
            <p className="mt-3 text-center text-2xl font-extrabold tracking-[0.45em] text-brand-deep" aria-label={`Delivery code ${order.deliveryOtp}`}>{order.deliveryOtp}</p>
            <p className="mt-2 text-[11px] leading-4 text-muted-ink">In this preview, confirm cash only. Digital/QR collection is not connected; do not pay to a personal or third-party QR.</p>
          </section>
        )}

        {order.riderName && !rejected && (
          <section className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
            <span className="grid size-11 place-items-center rounded-full bg-peach text-sm font-bold text-brand-deep">{order.riderName[0]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{order.riderName}</p>
              <p className="text-xs text-muted-ink">Your delivery partner</p>
            </div>
            <a href="tel:+910000000000" aria-label={`Call ${order.riderName}`} className="grid size-10 place-items-center rounded-full bg-[#DCFCE7] text-[#15803D]">
              <Phone className="size-4" aria-hidden="true" />
            </a>
          </section>
        )}

        {order.status !== 'delivered' && !rejected && (
          <section className="rounded-2xl border border-dashed border-[#F3C9A6] bg-[#FFF8F1] p-4">
            <h2 className="text-sm font-semibold">See the other side of this order</h2>
            <p className="mt-1 text-xs leading-5 text-muted-ink">
              In this preview you can switch roles to accept and pack the order as the shopkeeper, then deliver it as the rider. Each step updates here instantly.
            </p>
            <div className="mt-3 flex gap-2">
              <SecondaryButton onClick={() => onViewAs('shopkeeper')} className="h-10 text-xs">
                <Store className="size-4" aria-hidden="true" /> As shopkeeper
              </SecondaryButton>
              <SecondaryButton onClick={() => onViewAs('rider')} className="h-10 text-xs">
                <Bike className="size-4" aria-hidden="true" /> As rider
              </SecondaryButton>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">Items from {shop.name}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {order.lines.map(l => (
              <li key={l.productId} className="flex justify-between">
                <span className="text-muted-ink">
                  {l.qty} × {l.name}
                </span>
                <span>{rupee(l.qty * l.price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-dashed border-line pt-3">
            <BillRows itemTotal={order.itemTotal} distanceKm={order.deliveryDistanceKm} />
            <p className="mt-2 text-[11px] text-muted-ink">Cash on delivery · pay the rider</p>
          </div>
        </section>
      </div>
    </div>
  )
}

export function OrderAgainScreen({ onTrack, onReordered }: { onTrack: (id: string) => void; onReordered: () => void }) {
  const { orders, shopById, reorder } = useLazyHand()
  const [openBill, setOpenBill] = useState<string | null>(null)

  return (
    <div className="pb-28">
      <header className="sticky top-0 z-10 border-b border-line bg-white px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)]">
        <h1 className="text-lg font-bold">Order again</h1>
        <p className="text-xs text-muted-ink">Your past orders, one tap to reorder</p>
      </header>
      <ul className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-4">
        {orders.map(order => {
          const shop = shopById?.[order.shopId]
          const shopName = shop && typeof shop.name === 'string' ? shop.name : 'Shop no longer available'
          const active = !['delivered', 'rejected'].includes(order.status)
          const count = order.lines.reduce((s, l) => s + l.qty, 0)
          return (
            <li key={order.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{shopName}</p>
                  <p className="text-xs text-muted-ink">
                    {order.placedAt} · {count} items · {rupee(order.total)}
                  </p>
                </div>
                <StatusPill tone={order.status === 'delivered' ? 'open' : order.status === 'rejected' ? 'closed' : 'warn'}>
                  {order.status === 'delivered' ? 'Delivered' : order.status === 'rejected' ? 'Declined' : 'In progress'}
                </StatusPill>
              </div>
              <p className="mt-2 line-clamp-1 text-xs text-muted-ink">{order.lines.map(l => `${l.name} ×${l.qty}`).join(', ')}</p>
              {openBill === order.id && (
                <div className="mt-3 rounded-xl bg-cream p-3">
                  <BillRows itemTotal={order.itemTotal} distanceKm={order.deliveryDistanceKm} />
                </div>
              )}
              <div className="mt-3 flex gap-2">
                {active ? (
                  <PrimaryButton onClick={() => onTrack(order.id)} className="h-10 text-xs">
                    <Package className="size-4" aria-hidden="true" /> Track order
                  </PrimaryButton>
                ) : shop ? (
                  <PrimaryButton
                    onClick={() => {
                      reorder(order)
                      onReordered()
                    }}
                    className="h-10 text-xs"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" /> Reorder
                  </PrimaryButton>
                ) : (
                  <p className="self-center text-xs text-muted-ink">This shop is no longer available</p>
                )}
                <SecondaryButton onClick={() => setOpenBill(openBill === order.id ? null : order.id)} aria-expanded={openBill === order.id} className="h-10 text-xs">
                  <Receipt className="size-4" aria-hidden="true" /> {openBill === order.id ? 'Hide bill' : 'View bill'}
                </SecondaryButton>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ProfileScreen({ area, onSwitchRole, onLogout, onOrders, onEditAddress }: { area: string; onSwitchRole: (role: Role) => void; onLogout: () => void; onOrders: () => void; onEditAddress: () => void }) {
  const { profile, orders } = useLazyHand()
  const name = profile.name || 'Guest'
  const delivered = orders.filter(o => o.status === 'delivered').length
  const rows = [
    { label: 'Saved address', detail: [profile.village || area, profile.landmark].filter(Boolean).join(', '), Icon: MapPin, onClick: onEditAddress },
    { label: 'Your orders', detail: `${orders.length} orders`, Icon: Package, onClick: onOrders },
    { label: 'Become a shopkeeper', detail: 'Manage a shop and accept orders', Icon: Store, onClick: () => onSwitchRole('shopkeeper') },
    { label: 'Become a delivery partner', detail: 'Apply to deliver local shop orders', Icon: Bike, onClick: () => onSwitchRole('rider') },
  ]
  return (
    <div className="pb-28">
      <header className="bg-gradient-to-br from-brand to-[#EF4444] px-4 pb-6 pt-[max(env(safe-area-inset-top),20px)] text-white">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full bg-white text-xl font-bold text-brand-deep">{name[0].toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{name}</h1>
            <p className="text-xs text-white/90">{profile.phone ? `+91 ${profile.phone}` : 'Not signed in'}</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-md px-4">
        <dl className="-mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-line bg-white p-3 text-center">
            <dt className="text-xs text-muted-ink">Orders</dt>
            <dd className="text-lg font-bold">{orders.length}</dd>
          </div>
          <div className="rounded-2xl border border-line bg-white p-3 text-center">
            <dt className="text-xs text-muted-ink">Delivered</dt>
            <dd className="text-lg font-bold">{delivered}</dd>
          </div>
        </dl>
        <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
          {rows.map(({ label, detail, Icon, onClick }) => (
            <li key={label} className="border-b border-line last:border-b-0">
              <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <Icon className="size-5 shrink-0 text-brand-deep" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block truncate text-xs text-muted-ink">{detail}</span>
                </span>
                <ChevronRight className="size-4 text-muted-ink" aria-hidden="true" />
              </button>
            </li>
          ))}
          <li>
            <a href="mailto:help@lazyhand.app" className="flex w-full items-center gap-3 px-4 py-3.5">
              <HelpCircle className="size-5 shrink-0 text-brand-deep" aria-hidden="true" />
              <span className="flex-1 text-sm font-semibold">Help &amp; support</span>
              <ChevronRight className="size-4 text-muted-ink" aria-hidden="true" />
            </a>
          </li>
        </ul>
        <button type="button" onClick={onLogout} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-white text-sm font-semibold text-[#B91C1C]">
          <LogOut className="size-4" aria-hidden="true" /> {profile.phone ? 'Log out' : 'Exit guest mode'}
        </button>
      </div>
    </div>
  )
}
