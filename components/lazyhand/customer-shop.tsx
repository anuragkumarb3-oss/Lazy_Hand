'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock, MapPin, Search, Share2, ShoppingBag, Star, Store, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categories, categoryById, rupee, type CategoryId, type Product } from './data'
import { useLazyHand } from './store'
import { BackButton, PrimaryButton, ProductTile, QtyControl, SecondaryButton, StatusPill } from './ui'

function ProductRow({ product, showShop }: { product: Product; showShop?: boolean }) {
  const { cart, addItem, removeItem, shopById } = useLazyHand()
  const shop = shopById[product.shopId]
  const unavailable = !product.inStock || !shop.open
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <ProductTile category={product.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{product.name}</p>
        <p className="text-xs text-muted-ink">
          {product.unit}
          {showShop && <> · {shop.name}</>}
        </p>
        <p className="mt-0.5 text-sm font-semibold">{rupee(product.price)}</p>
        {!product.inStock && <p className="text-[11px] font-medium text-[#B91C1C]">Out of stock</p>}
        {product.inStock && !shop.open && <p className="text-[11px] font-medium text-[#B91C1C]">Shop closed · opens {shop.opensAt}</p>}
      </div>
      <QtyControl qty={cart.items[product.id] ?? 0} onAdd={() => addItem(product.id)} onRemove={() => removeItem(product.id)} disabled={unavailable} label={product.name} />
    </li>
  )
}

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const { cartCount, cartTotal, cart, shopById } = useLazyHand()
  if (!cartCount || !cart.shopId) return null
  return (
    <div className="fixed inset-x-0 bottom-[68px] z-10 px-4">
      <button
        type="button"
        onClick={onOpen}
        className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-brand px-4 text-white shadow-[0_12px_28px_-12px_#9A3412] transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-3 text-left">
          <ShoppingBag className="size-5" aria-hidden="true" />
          <span>
            <span className="block text-sm font-semibold">
              {cartCount} item{cartCount > 1 ? 's' : ''} · {rupee(cartTotal)}
            </span>
            <span className="block text-[11px] text-white/85">From {shopById[cart.shopId].name}</span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold">
          View cart <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </button>
    </div>
  )
}

export function ConflictSheet() {
  const { conflictProductId, resolveConflict, cart, shopById, productById } = useLazyHand()
  if (!conflictProductId || !cart.shopId) return null
  const current = shopById[cart.shopId]
  const next = shopById[productById[conflictProductId].shopId]
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" role="presentation" onClick={() => resolveConflict(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3"
      >
        <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-peach text-brand-deep">
          <ShoppingBag className="size-5" aria-hidden="true" />
        </span>
        <h2 id="conflict-title" className="mt-3 text-center text-lg font-bold">Start a new cart?</h2>
        <p className="mt-2 text-center text-sm leading-6 text-muted-ink text-pretty">
          Your cart has items from <span className="font-semibold text-ink">{current.name}</span>. One rider picks up from one shop, so adding from{' '}
          <span className="font-semibold text-ink">{next.name}</span> clears the current cart.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <PrimaryButton onClick={() => resolveConflict(true)}>Clear cart &amp; add</PrimaryButton>
          <SecondaryButton onClick={() => resolveConflict(false)}>Keep current cart</SecondaryButton>
        </div>
      </div>
    </div>
  )
}

export function CustomerHome({ area, onChangeLocation, onOpenStore, onOpenCategory }: { area: string; onChangeLocation: () => void; onOpenStore: (id: string) => void; onOpenCategory: (id: CategoryId) => void }) {
  const { shops, products } = useLazyHand()
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<CategoryId | 'all'>('all')
  const term = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (!term && chip === 'all') return null
    return products.filter(p => (chip === 'all' || p.category === chip) && (!term || p.name.toLowerCase().includes(term) || categoryById[p.category].name.toLowerCase().includes(term)))
  }, [products, term, chip])

  const sortedShops = [...shops].sort((a, b) => Number(b.open) - Number(a.open))

  return (
    <div className="pb-40">
      <header className="bg-gradient-to-br from-brand to-[#FFA94D] px-4 pb-4 pt-[max(env(safe-area-inset-top),16px)] text-white">
        <div className="mx-auto max-w-md">
          <p className="text-[11px] font-medium text-white/85">Delivering to</p>
          <button type="button" onClick={onChangeLocation} className="flex max-w-full items-center gap-1 text-left text-base font-bold" aria-label={`Delivering to ${area}. Change location`}>
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{area}</span>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
          <div className="mt-3 flex h-11 items-center gap-2.5 rounded-xl bg-white px-3.5 text-muted-ink">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <label htmlFor="home-search" className="sr-only">Search products</label>
            <input
              id="home-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='Search "milk", "atta", "chips"'
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-[#A3A7AD]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by category">
            {(['all', 'snacks', 'drinks', 'dairy', 'staples', 'veg'] as const).map(id => (
              <button
                key={id}
                type="button"
                aria-pressed={chip === id}
                onClick={() => setChip(id)}
                className={cn('h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition', chip === id ? 'bg-white text-brand-deep' : 'bg-white/20 text-white')}
              >
                {id === 'all' ? 'All' : categoryById[id].short}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4">
        {results ? (
          <section aria-labelledby="results-heading" className="mt-5">
            <h2 id="results-heading" className="text-base font-bold">
              {results.length} result{results.length === 1 ? '' : 's'}
              {term && <span className="font-normal text-muted-ink"> for &ldquo;{query.trim()}&rdquo;</span>}
            </h2>
            {results.length ? (
              <ul className="mt-2 rounded-2xl border border-line bg-white px-3">
                {results.map(p => (
                  <ProductRow key={p.id} product={p} showShop />
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl border border-line bg-white p-5 text-center text-sm text-muted-ink">No products found. Try another word.</p>
            )}
          </section>
        ) : (
          <>
            <section aria-labelledby="bestsellers-heading" className="mt-5">
              <div className="flex items-end justify-between">
                <h2 id="bestsellers-heading" className="text-base font-bold">Bestsellers</h2>
                <button type="button" onClick={() => onOpenCategory('snacks')} className="text-xs font-semibold text-brand-deep">
                  See all
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {categories.slice(0, 6).map(c => (
                  <button key={c.id} type="button" onClick={() => onOpenCategory(c.id)} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-2 py-3 text-center transition active:scale-95">
                    <span className={cn('grid size-12 place-items-center rounded-xl', c.tone)}>
                      <c.Icon className="size-6" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-medium leading-4">{c.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="shops-heading" className="mt-6">
              <h2 id="shops-heading" className="text-base font-bold">Shops near you</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {sortedShops.map(shop => {
                  const count = products.filter(p => p.shopId === shop.id && p.inStock).length
                  return (
                    <li key={shop.id}>
                      <button type="button" onClick={() => onOpenStore(shop.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition active:scale-[0.99]">
                        <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', shop.open ? 'bg-peach text-brand-deep' : 'bg-[#F1EFEB] text-muted-ink')}>
                          <Store className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{shop.name}</span>
                            <StatusPill tone={shop.open ? 'open' : 'closed'}>{shop.open ? 'Open' : 'Closed'}</StatusPill>
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-muted-ink">
                            <span className="flex items-center gap-0.5">
                              <Star className="size-3 fill-[#F59E0B] text-[#F59E0B]" aria-hidden="true" /> {shop.rating}
                            </span>
                            <span aria-hidden="true">·</span>
                            {shop.open ? shop.eta : `Opens ${shop.opensAt}`}
                            <span aria-hidden="true">·</span>
                            {count} items
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-ink" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export function CategoriesScreen({ active, onSelect }: { active: CategoryId; onSelect: (id: CategoryId) => void }) {
  const { products } = useLazyHand()
  const list = products.filter(p => p.category === active)
  return (
    <div className="flex min-h-svh flex-col pb-40">
      <header className="sticky top-0 z-10 border-b border-line bg-white px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)]">
        <h1 className="text-lg font-bold">Categories</h1>
      </header>
      <div className="flex flex-1">
        <nav aria-label="Categories" className="w-24 shrink-0 border-r border-line bg-white">
          <ul>
            {categories.map(c => {
              const selected = c.id === active
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelect(c.id)}
                    className={cn('relative flex w-full flex-col items-center gap-1.5 px-1 py-3 text-center text-[10px] font-medium leading-3', selected ? 'bg-peach text-brand-deep' : 'text-muted-ink')}
                  >
                    {selected && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-brand" aria-hidden="true" />}
                    <span className={cn('grid size-10 place-items-center rounded-xl', c.tone)}>
                      <c.Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    {c.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <section className="min-w-0 flex-1 px-3 pt-3" aria-labelledby="cat-heading">
          <h2 id="cat-heading" className="text-sm font-bold">{categoryById[active].name}</h2>
          <p className="text-xs text-muted-ink">{list.length} items from nearby shops</p>
          {list.length ? (
            <ul className="mt-2 rounded-2xl border border-line bg-white px-3">
              {list.map(p => (
                <ProductRow key={p.id} product={p} showShop />
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl border border-line bg-white p-5 text-center text-sm text-muted-ink">No nearby shop sells this yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}

export function StoreScreen({ shopId, onBack }: { shopId: string; onBack: () => void }) {
  const { shopById, products } = useLazyHand()
  const shop = shopById[shopId]
  const shopProducts = products.filter(p => p.shopId === shopId)
  const shopCats = Array.from(new Set(shopProducts.map(p => p.category)))
  const [filter, setFilter] = useState<CategoryId | 'all'>('all')
  const [shared, setShared] = useState(false)
  const visible = filter === 'all' ? shopProducts : shopProducts.filter(p => p.category === filter)

  const share = async () => {
    const data = { title: shop.name, text: `Order from ${shop.name} on LazyHand`, url: window.location.href }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(data.url)
        setShared(true)
      }
    } catch {
      /* user dismissed the share sheet */
    }
  }

  return (
    <div className="pb-40">
      <header className="bg-gradient-to-br from-brand to-[#FFA94D] px-4 pb-5 pt-[max(env(safe-area-inset-top),16px)] text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <BackButton onClick={onBack} className="border-white/30 bg-white/20 text-white" />
            <button type="button" onClick={share} aria-label={`Share ${shop.name}`} className="grid size-9 place-items-center rounded-full border border-white/30 bg-white/20">
              <Share2 className="size-4" aria-hidden="true" />
            </button>
          </div>
          {shared && <p role="status" className="mt-2 text-xs text-white/90">Link copied</p>}
          <h1 className="mt-4 text-2xl font-bold">{shop.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/90">
            <span className="flex items-center gap-1">
              <Star className="size-3 fill-white" aria-hidden="true" /> {shop.rating}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" /> {shop.hours}
            </span>
            <span aria-hidden="true">·</span>
            {shop.kind}
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-md px-4">
        {!shop.open && (
          <p role="status" className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#991B1B]">
            This shop is closed right now. It opens at {shop.opensAt}.
          </p>
        )}
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="Filter products">
          {(['all', ...shopCats] as const).map(id => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn('h-8 shrink-0 rounded-full border px-3.5 text-xs font-semibold', filter === id ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink')}
            >
              {id === 'all' ? 'All' : categoryById[id].short}
            </button>
          ))}
        </div>
        <ul className="mt-3 rounded-2xl border border-line bg-white px-3">
          {visible.map(p => (
            <ProductRow key={p.id} product={p} />
          ))}
        </ul>
      </div>
    </div>
  )
}
