'use client'

import { useState } from 'react'
import { Bike, Check, ClipboardList, IndianRupee, MapPin, Package, Power, Store, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RIDER_PAY_PER_TRIP, rupee, type Order } from './data'
import { useLazyHand } from './store'
import { BottomNav, PrimaryButton, ProductTile, SecondaryButton, StatusPill, Toggle } from './ui'

const MANAGED_SHOP_ID = 'gupta'

function PartnerHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="bg-ink px-4 pb-5 pt-[max(env(safe-area-inset-top),18px)] text-white">
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
  const { orders, products, shopById, toggleShopOpen, toggleStock, setOrderStatus } = useLazyHand()
  const [tab, setTab] = useState<'orders' | 'products' | 'account'>('orders')
  const shop = shopById[MANAGED_SHOP_ID]
  const shopOrders = orders.filter(o => o.shopId === MANAGED_SHOP_ID && o.placedAt === 'Today')
  const incoming = shopOrders.filter(o => o.status === 'placed')
  const packing = shopOrders.filter(o => o.status === 'accepted')
  const handedOver = shopOrders.filter(o => ['ready', 'picked', 'delivered'].includes(o.status))
  const revenue = shopOrders.filter(o => o.status !== 'rejected').reduce((s, o) => s + o.itemTotal, 0)
  const myProducts = products.filter(p => p.shopId === MANAGED_SHOP_ID)

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

        {tab === 'products' && (
          <section aria-labelledby="products-heading" className="mt-4">
            <h2 id="products-heading" className="text-sm font-bold">Your products</h2>
            <p className="text-xs leading-5 text-muted-ink">Stock switches immediately affect the demo shop&apos;s customer catalog. Changes are temporary; product edits and real listings are not connected.</p>
            <ul className="mt-3 rounded-2xl border border-line bg-white px-3">
              {myProducts.map(p => (
                <li key={p.id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                  <ProductTile category={p.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-ink">
                      {p.unit} · {rupee(p.price)}
                    </p>
                  </div>
                  <span className={cn('text-[11px] font-semibold', p.inStock ? 'text-[#15803D]' : 'text-muted-ink')}>{p.inStock ? 'In stock' : 'Out'}</span>
                  <Toggle checked={p.inStock} onChange={() => toggleStock(p.id)} label={`${p.name} in stock`} />
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
          { key: 'account', label: 'Account', Icon: UserRound },
        ]}
        active={tab}
        onSelect={setTab}
      />
    </div>
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
              <Stat label="Earned" value={rupee(completed.length * RIDER_PAY_PER_TRIP)} />
              <Stat label="Per trip" value={rupee(RIDER_PAY_PER_TRIP)} />
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
                        <p className="text-sm font-bold text-[#15803D]">+{rupee(RIDER_PAY_PER_TRIP)}</p>
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
              <p className="text-3xl font-bold">{rupee(completed.length * RIDER_PAY_PER_TRIP)}</p>
              <p className="mt-1 text-xs text-white/70">
                {completed.length} trips × {rupee(RIDER_PAY_PER_TRIP)}
              </p>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {completed.length === 0 && <Empty Icon={IndianRupee} title="No completed trips yet" detail="Each delivered order adds ₹20 here." />}
              {completed.map(o => (
                <li key={o.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-sm">
                  <span>
                    #{o.id} · {shopById[o.shopId].name}
                  </span>
                  <span className="font-semibold text-[#15803D]">+{rupee(RIDER_PAY_PER_TRIP)}</span>
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

function PartnerAccount({ role, onExit }: { role: string; onExit: () => void }) {
  const { profile } = useLazyHand()
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
      <SecondaryButton onClick={onExit}>Switch to customer app</SecondaryButton>
    </section>
  )
}
