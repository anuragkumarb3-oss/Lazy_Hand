'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { CakeSlice, Carrot, ChevronDown, ChevronRight, Clock, Cookie, CupSoda, House, IceCreamCone, MapPin, Milk, Package, Pizza, Sandwich, Search, Share2, ShoppingBag, ShoppingBasket, Soup, Star, Store, Utensils, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categories, categoryById, rupee, type CategoryId, type Product, type Shop } from './data'
import { useLazyHand } from './store'
import { BackButton, PrimaryButton, ProductTile, QtyControl, SecondaryButton } from './ui'

function ProductRow({ product, showShop }: { product: Product; showShop?: boolean }) {
  const { cart, addItem, removeItem, shopById, allowDemoOrders } = useLazyHand()
  const shop = shopById[product.shopId]
  const unavailable = (product.demoOnly && !allowDemoOrders) || !product.inStock || !shop.open
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-[#EFE4D8] bg-gradient-to-r from-white via-white to-[#FFF9F2] p-3 shadow-[0_6px_18px_-16px_#6B4A34]">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[1.1rem] border border-white bg-white shadow-sm">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" /> : <ProductTile category={product.category} />}
      </span>
      <div className="min-w-0 flex-1">
        {product.featured && <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.13em] text-brand-deep">Neighborhood favorite</p>}
        <p className="truncate text-sm font-semibold tracking-tight">{product.name}</p>
        {product.demoOnly && <p className="text-[10px] font-semibold text-brand-deep">Preview sample · test checkout only</p>}
        <p className="text-xs text-muted-ink">
          {product.unit}
          {showShop && <> · {shop.name}</>}
        </p>
        <p className="mt-1 text-base font-extrabold tracking-tight">{rupee(product.price)}</p>
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
        <h2 id="conflict-title" className="mt-3 text-center text-lg font-bold">Add another store?</h2>
        <p className="mt-2 text-center text-sm leading-6 text-muted-ink text-pretty">
          Add items from <span className="font-semibold text-ink">{next.name}</span> alongside {current.name}. Multi-store checkout adds one ₹39 fee total; delivery and platform fees are free.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <PrimaryButton onClick={() => resolveConflict(true)}>Add store to cart</PrimaryButton>
          <SecondaryButton onClick={() => resolveConflict(false)}>Keep current cart</SecondaryButton>
        </div>
      </div>
    </div>
  )
}

type DynamicCategory = { id: string; name: string; scope: 'general' | 'restaurant'; image_url: string | null; icon: string | null; display_order: number }

type HomeSection = 'All' | 'Grocery & Kitchen' | 'Snacks & Drinks' | 'Fresh' | 'Essentials'
type CatalogResponse = { categories: BrowserCategory[]; products: BrowserProduct[] }

async function fetchCatalog(url = '/api/catalog'): Promise<CatalogResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Catalog could not be loaded.')
  return response.json() as Promise<CatalogResponse>
}

function catalogUrlForArea(area: string) {
  const locality = area === 'Set your location' ? '' : area.split(',')[0].trim()
  return `/api/catalog?area=${encodeURIComponent(locality)}`
}

const homeSections: { name: HomeSection; label: string; categories: string[]; Icon: typeof Store }[] = [
  { name: 'All', label: 'All', categories: [], Icon: Store },
  { name: 'Grocery & Kitchen', label: 'Grocery', categories: ['staples', 'instant'], Icon: Store },
  { name: 'Snacks & Drinks', label: 'Snacks', categories: ['snacks', 'drinks', 'bakery', 'icecream'], Icon: ShoppingBag },
  { name: 'Fresh', label: 'Fresh', categories: ['veg', 'dairy', 'eggs'], Icon: MapPin },
  { name: 'Essentials', label: 'Essentials', categories: ['staples', 'dairy', 'bakery', 'instant'], Icon: Clock },
]

function categoryIdForName(name: string) {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (normalizedName === 'groceries') return 'staples'
  return Object.values(categoryById).find(category => {
    const normalizedCategory = category.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    return normalizedName === normalizedCategory || normalizedName.includes(category.short.toLowerCase()) || normalizedCategory.includes(normalizedName)
  })?.id
}

function MoreProducts({ products, loading, area, onChangeLocation }: { products: Product[]; loading: boolean; area: string; onChangeLocation: () => void }) {
  const { cart, addItem, shopById, allowDemoOrders } = useLazyHand()
  const featuredProducts = [...products]
    .filter(product => product.inStock && shopById[product.shopId])
    .sort((first, second) => Number(shopById[second.shopId].open) - Number(shopById[first.shopId].open))
    .filter((product, index, sorted) => sorted.findIndex(candidate => `${candidate.name.trim().toLowerCase()}|${candidate.unit.trim().toLowerCase()}` === `${product.name.trim().toLowerCase()}|${product.unit.trim().toLowerCase()}`) === index)
    .slice(0, 8)

  return (
    <section aria-labelledby="more-products-heading" className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Fresh picks</p><h2 id="more-products-heading" className="mt-0.5 text-lg font-extrabold tracking-tight">More Products</h2></div>
        <a href="/categories" className="pb-0.5 text-[11px] font-semibold text-brand-deep">See all <ChevronRight className="inline size-3" aria-hidden="true" /></a>
      </div>
      {featuredProducts.length ? <ul className="-mx-3.5 mt-2 flex snap-x gap-2.5 overflow-x-auto px-3.5 pb-2 [scrollbar-width:none]">{featuredProducts.map(product => {
        const shop = shopById[product.shopId]
        const canAdd = (!product.demoOnly || allowDemoOrders) && shop.open && product.inStock
        const quantity = cart.items[product.id] ?? 0
        return <li key={product.id} className="flex w-[9.25rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#EFE4D8] bg-white shadow-[0_5px_18px_-14px_#6B4A34]">
          <div className="relative aspect-square bg-[#F7F7F8]">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><ProductTile category={product.category} size="sm" /></div>}
            <span className={cn('absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold', product.demoOnly ? 'bg-white/95 text-brand-deep' : canAdd ? 'bg-white/95 text-[#15803D]' : 'bg-white/95 text-[#B91C1C]')}>{product.demoOnly ? 'Test item' : canAdd ? 'Available' : 'Shop closed'}</span>
          </div>
          <div className="flex flex-1 flex-col p-2">
            <p className="line-clamp-2 min-h-8 text-[11px] font-semibold leading-4">{product.name}</p>
            {product.demoOnly && <p className="mt-0.5 text-[9px] font-semibold leading-3 text-brand-deep">Preview sample · test only</p>}
            <p className="mt-0.5 truncate text-[10px] text-muted-ink">{shop.name}</p>
            <div className="mt-auto flex items-center justify-between gap-1.5 pt-2">
              <span className="text-[13px] font-extrabold">{rupee(product.price)}</span>
              <button type="button" disabled={!canAdd} onClick={() => addItem(product.id)} className="min-h-8 min-w-12 rounded-lg bg-brand px-2 text-[10px] font-bold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-muted-ink" aria-label={product.demoOnly ? `${quantity ? 'Add another ' : 'Add '}${product.name} for preview test checkout` : `${quantity ? `Add another ${product.name}` : `Add ${product.name}`} to cart`}>
                {product.demoOnly && !quantity ? 'TEST' : quantity ? `+ ${quantity}` : 'ADD'}
              </button>
            </div>
          </div>
        </li>
      })}</ul> : loading ? <p role="status" className="mt-3 rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted-ink">Loading products…</p> : <div className="mt-3 rounded-2xl border border-dashed border-line bg-white p-5 text-center"><p className="text-sm text-muted-ink">No in-stock products were found near {area}.</p><button type="button" onClick={onChangeLocation} className="mt-3 min-h-10 rounded-xl border border-line px-4 text-xs font-semibold text-brand-deep">Change delivery location</button></div>}
    </section>
  )
}

function GroceryRail({ products }: { products: Product[] }) {
  const { cart, addItem, removeItem, shopById, allowDemoOrders } = useLazyHand()
  const essentials = products
    .filter(product => product.inStock && shopById[product.shopId]?.open && (product.category === 'staples' || product.category === 'instant'))
    .slice(0, 10)
  if (!essentials.length) return null

  return (
    <section aria-labelledby="grocery-heading" className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Everyday essentials</p><h2 id="grocery-heading" className="mt-0.5 text-lg font-extrabold tracking-tight">Grocery &amp; Kitchen</h2></div>
        <a href="/categories" className="pb-0.5 text-[11px] font-semibold text-brand-deep">See all <ChevronRight className="inline size-3" aria-hidden="true" /></a>
      </div>
      <ul className="-mx-3.5 mt-2 flex snap-x gap-2.5 overflow-x-auto px-3.5 pb-2 [scrollbar-width:none]">
        {essentials.map(product => {
          const shop = shopById[product.shopId]
          const canAdd = (!product.demoOnly || allowDemoOrders) && shop.open && product.inStock
          return (
            <li key={product.id} className="flex w-[9.25rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#EFE4D8] bg-white shadow-[0_5px_18px_-14px_#6B4A34]">
              <div className="relative aspect-square bg-[#F7F7F8]">
                {product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><ProductTile category={product.category} size="sm" /></div>}
              </div>
              <div className="flex flex-1 flex-col p-2">
                <p className="line-clamp-2 min-h-8 text-[11px] font-semibold leading-4">{product.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-ink">{product.unit}</p>
                <div className="mt-auto flex items-center justify-between gap-1.5 pt-2">
                  <span className="text-[13px] font-extrabold">{rupee(product.price)}</span>
                  <QtyControl qty={cart.items[product.id] ?? 0} onAdd={() => addItem(product.id)} onRemove={() => removeItem(product.id)} disabled={!canAdd} label={product.name} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CategorySheet({ category, siblings, products, groupLabel, onSelect, onClose }: {
  category: BrowserCategory
  siblings: BrowserCategory[]
  products: BrowserProduct[]
  groupLabel: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const { cart, addCatalogItem, removeItem, shopById, allowDemoOrders } = useLazyHand()
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragYRef = useRef(0)
  const dragStart = useRef<number | null>(null)
  const railRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [category.id])

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setEntered(false)
    window.setTimeout(onClose, 280)
  }

  const setDrag = (value: number) => {
    dragYRef.current = value
    setDragY(value)
  }

  const endDrag = () => {
    if (dragYRef.current > 90) requestClose()
    setDrag(0)
    dragStart.current = null
  }

  const categoryProducts = products
    .filter(product => product.category_id === category.id && product.product_type === 'retail')
    .sort((first, second) => Number(second.is_available && second.stock > 0) - Number(first.is_available && first.stock > 0))

  const addProduct = (item: BrowserProduct) => {
    const shop = shopById[item.owner_id] ?? {
      id: item.owner_id,
      name: item.shop_name,
      kind: 'Local store',
      hours: item.shop_open ? 'Open now' : 'Closed',
      opensAt: item.shop_opens_at ?? 'later',
      rating: 0,
      eta: item.delivery_estimate_min ? `${item.delivery_estimate_min}+ min` : 'Estimate unavailable',
      open: item.shop_open,
    }
    addCatalogItem({
      id: item.id,
      shopId: item.owner_id,
      name: item.name,
      unit: item.unit,
      price: Number(item.price),
      category: categoryIdForName(category.name) ?? 'snacks',
      inStock: item.is_available && item.stock > 0,
      stock: item.stock,
      imageUrl: item.images?.[0],
      demoOnly: item.demo_only,
    }, shop)
  }

  const thumbFor = (item: BrowserCategory) => item.image_url
    ?? products.find(product => product.category_id === item.id && product.images?.[0])?.images[0]

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        role="presentation"
        aria-hidden="true"
        onClick={requestClose}
        className={cn('absolute inset-0 bg-ink/50 transition-opacity duration-300', entered && !closing ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-sheet-heading"
        className="relative w-full max-w-md transition-transform duration-300 ease-out sm:max-w-lg"
        style={{
          transform: closing || !entered ? 'translateY(100%)' : `translateY(${dragY}px)`,
          transition: dragY > 0 && !closing ? 'none' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close categories"
          className="absolute -top-12 right-1 grid size-10 place-items-center rounded-full bg-white text-ink shadow-lg transition active:scale-95"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <div className="flex h-[85svh] max-h-[85svh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
          <div
            className="shrink-0 touch-none border-b border-[#EFEFEF] px-4 pb-3 pt-2 shadow-[0_2px_8px_-6px_#111827]"
            onTouchStart={event => { dragStart.current = event.touches[0]?.clientY ?? null; setDrag(0) }}
            onTouchMove={event => {
              if (dragStart.current === null) return
              setDrag(Math.max(0, (event.touches[0]?.clientY ?? dragStart.current) - dragStart.current))
            }}
            onTouchEnd={endDrag}
            onTouchCancel={() => { setDrag(0); dragStart.current = null }}
          >
            <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-[#D8D8DC]" />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Browse category</p>
                <h2 id="category-sheet-heading" className="truncate text-lg font-extrabold tracking-tight">{groupLabel}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-[#F4F4F5] px-2.5 py-1 text-[10px] font-semibold text-muted-ink">{categoryProducts.length} item{categoryProducts.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <aside ref={railRef} aria-label="Category list" className="w-[22%] min-w-[82px] shrink-0 overflow-y-auto border-r border-[#EFEFEF] bg-[#FAFAFA] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <nav className="flex flex-col gap-0.5 p-1.5">
                {siblings.map(item => {
                  const isActive = item.id === category.id
                  const thumb = thumbFor(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-active={isActive ? 'true' : 'false'}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => onSelect(item.id)}
                      className={cn('relative flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition', isActive ? 'bg-white text-ink shadow-sm' : 'text-muted-ink hover:bg-white/70')}
                    >
                      {isActive && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-full bg-[#15803D]" />}
                      <span className={cn('grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border bg-[#FCE8E8]', isActive ? 'border-[#15803D]' : 'border-transparent')}>
                        {thumb ? <img src={thumb} alt="" loading="lazy" className="size-full object-cover" /> : <span className="text-brand-deep"><CategoryIcon category={item} restaurant={false} /></span>}
                      </span>
                      <span className={cn('line-clamp-2 text-[10px] leading-3', isActive ? 'font-bold' : 'font-medium')}>{item.name}</span>
                    </button>
                  )
                })}
              </nav>
            </aside>
            <section aria-label={`${category.name} products`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 [scrollbar-width:thin]">
              {categoryProducts.length ? (
                <ul className="grid grid-cols-2 gap-2.5 pb-4">
                  {categoryProducts.map(item => {
                    const quantity = cart.items[item.id] ?? 0
                    const price = Number(item.price)
                    const mrp = Number(item.mrp ?? 0)
                    const optionCount = item.variants?.length ?? 0
                    const shop = shopById[item.owner_id]
                    const rating = Number(item.rating ?? shop?.rating ?? 0)
                    const canAdd = (!item.demo_only || allowDemoOrders) && item.shop_open && item.is_available && item.stock > 0
                    return (
                      <li key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#E9E9EC] bg-white shadow-[0_3px_12px_-10px_#111827]">
                        <div className="relative aspect-square bg-[#F7F7F8]">
                          {item.images?.[0] ? <img src={item.images[0]} alt={item.name} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-[10px] font-semibold text-muted-ink">Product</div>}
                          {item.stock <= 0 && <span className="absolute inset-x-0 bottom-0 bg-ink/75 px-2 py-1 text-center text-[9px] font-semibold text-white">Out of stock</span>}
                        </div>
                        <div className="flex flex-1 flex-col p-2">
                          <p className="line-clamp-2 min-h-8 text-[11px] font-semibold leading-4">{item.name}</p>
                          <p className="mt-0.5 truncate text-[9px] text-muted-ink">{item.unit || item.shop_name}</p>
                          <div className="mt-1 flex items-center gap-1 text-[10px]">
                            <Star className="size-3 fill-[#F59E0B] text-[#F59E0B]" aria-hidden="true" />
                            <span className="font-semibold">{rating > 0 ? rating.toFixed(1) : 'New'}</span>
                          </div>
                          <div className="mt-auto pt-1.5">
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-extrabold">{rupee(price)}</span>
                              {mrp > price && <span className="text-[9px] text-muted-ink line-through">{rupee(mrp)}</span>}
                            </div>
                            {mrp > price && <p className="text-[9px] font-semibold text-[#15803D]">{Math.round(((mrp - price) / mrp) * 100)}% OFF</p>}
                            <div className="mt-1.5">
                              {quantity > 0 ? (
                                <div className="flex h-8 items-center justify-between rounded-lg bg-[#15803D] px-1 text-white">
                                  <button type="button" onClick={() => removeItem(item.id)} aria-label={`Remove one ${item.name}`} className="grid size-6 place-items-center text-base leading-none">−</button>
                                  <span className="text-[11px] font-bold">{quantity}</span>
                                  <button type="button" onClick={() => addProduct(item)} disabled={!canAdd} aria-label={`Add another ${item.name}`} className="grid size-6 place-items-center text-base leading-none disabled:opacity-40">+</button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => addProduct(item)} disabled={!canAdd} aria-label={`Add ${item.name}`} className="h-8 w-full rounded-lg border border-[#16A34A] bg-white text-[10px] font-bold uppercase tracking-wide text-[#15803D] transition hover:bg-[#F0FDF4] disabled:cursor-not-allowed disabled:border-[#D1D5DB] disabled:text-[#9CA3AF]">ADD</button>
                              )}
                            </div>
                            {optionCount > 0 && <p className="mt-1 text-center text-[9px] text-muted-ink">{optionCount} option{optionCount === 1 ? '' : 's'}</p>}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="mt-8 rounded-xl border border-dashed border-line bg-white p-5 text-center">
                  <p className="text-sm font-semibold">No items in this category yet</p>
                  <p className="mt-1 text-xs text-muted-ink">Tap another category on the left.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CustomerHome({ area, onChangeLocation }: { area: string; onChangeLocation: () => void }) {
  const { shops, products, setCatalogData } = useLazyHand()
  const { data: catalog, error: catalogError } = useSWR(catalogUrlForArea(area), fetchCatalog, { refreshInterval: 30_000, revalidateOnFocus: true })
  useEffect(() => {
    if (!catalog && !catalogError) return
    if (!catalog) {
      setCatalogData([], [])
      return
    }
    const shopsById = new Map<string, Shop>()
    const liveProducts = catalog.products.filter(item => item.product_type === 'retail').map(item => {
      const eta = item.delivery_estimate_min && item.delivery_estimate_max
        ? `${item.delivery_estimate_min}–${item.delivery_estimate_max} min`
        : item.delivery_estimate_min ? `${item.delivery_estimate_min}+ min` : 'Estimate unavailable'
      if (!shopsById.has(item.owner_id)) {
        shopsById.set(item.owner_id, {
          id: item.owner_id,
          name: item.shop_name,
          kind: item.product_type === 'restaurant' ? 'Restaurant' : 'Local store',
          hours: item.shop_open ? 'Open now' : 'Closed',
          opensAt: item.shop_opens_at ?? 'later',
          rating: 0,
          eta,
          open: item.shop_open,
        })
      }
      const categoryName = catalog.categories.find(category => category.id === item.category_id)?.name ?? ''
      return {
        id: item.id,
        shopId: item.owner_id,
        name: item.name,
        unit: item.unit,
        price: Number(item.price),
        category: categoryIdForName(categoryName) ?? 'snacks',
        inStock: item.is_available && item.stock > 0,
        stock: item.stock,
        imageUrl: item.images?.[0],
        demoOnly: item.demo_only,
      } as Product
    })
    setCatalogData([...shopsById.values()], liveProducts)
  }, [catalog, catalogError, setCatalogData])
  const liveCategories = catalog?.categories.filter(category => category.scope === 'general') ?? []
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const searchSuggestions = ['atta', 'cold drinks', 'chips', 'milk', 'pizza', 'ice cream']
  useEffect(() => {
    if (query || searchFocused) return
    const timer = window.setInterval(() => {
      setSuggestionIndex(index => (index + 1) % searchSuggestions.length)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [query, searchFocused, searchSuggestions.length])
  const [activeSection, setActiveSection] = useState<HomeSection>('All')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const term = query.trim().toLowerCase()
  const sortedShops = [...shops].sort((a, b) => Number(b.open) - Number(a.open))

  const homeCategories = useMemo(() => liveCategories.length ? liveCategories : categories.map((category, index) => ({
    id: category.id,
    name: category.name,
    scope: 'general' as const,
    parent_id: null,
    image_url: null,
    icon: category.short,
    display_order: index,
  })), [liveCategories])

  const sectionCategories = useMemo(() => {
    const section = homeSections.find(item => item.name === activeSection)
    return homeCategories.filter(category => !section?.categories.length || section.categories.includes(categoryIdForName(category.name) ?? ''))
  }, [activeSection, homeCategories])

  const visibleCategories = sectionCategories

  const results = useMemo(() => {
    if (term) return products.filter(product => product.name.toLowerCase().includes(term) || categoryById[product.category].name.toLowerCase().includes(term))
    if (activeSection === 'All') return null
    const selectedNames = visibleCategories.map(category => category.name.toLowerCase())
    return products.filter(product => selectedNames.some(name => categoryById[product.category].name.toLowerCase() === name))
  }, [activeSection, products, term, visibleCategories])

  const sheetCategory = activeCategory ? homeCategories.find(category => category.id === activeCategory) ?? null : null
  const sheetSiblings = sheetCategory && sectionCategories.some(category => category.id === sheetCategory.id) ? sectionCategories : homeCategories

  return (
    <div className="pb-40">
      <header className="bg-gradient-to-b from-[#FECACA] via-[#FEE2E2] to-[#FFF5F5] px-3.5 pb-3 pt-[max(env(safe-area-inset-top),12px)] text-ink">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold text-ink/75">{sortedShops.some(shop => shop.open) ? 'Local shops are ready' : 'Please come back when your store opens'}</p>
              <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight">{sortedShops.some(shop => shop.open) ? 'Shop nearby' : 'Store closed'}</h1>
              <button type="button" onClick={onChangeLocation} className="mt-0.5 flex max-w-full items-center gap-1 text-left text-[13px] font-medium" aria-label={`Delivering to ${area}. Change location`}>
                <span className="truncate">{area}</span>
                <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
            <a href="#profile" aria-label="Your profile" className="mt-2.5 grid size-10 shrink-0 place-items-center rounded-full border border-white bg-white text-ink shadow-sm"><span className="text-base font-bold">U</span></a>
          </div>
          <div className="mt-2.5 flex h-10 items-center gap-2 rounded-xl border border-[#E9E3D5] bg-white px-3 text-muted-ink shadow-sm">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <label htmlFor="home-search" className="sr-only">Search products</label>
            <input
              id="home-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={`Search "${searchSuggestions[suggestionIndex]}"...`}
              className="search-placeholder-fade h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted-ink/70"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X className="size-4" aria-hidden="true" /></button>}
          </div>
        </div>
      </header>

      <nav aria-label="Shop sections" className="sticky top-0 z-[5] border-b border-line bg-[#FFF5F5]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md justify-between gap-4 overflow-x-auto px-3.5 [scrollbar-width:none]">
          {homeSections.map(({ name, label, Icon }) => (
            <button key={name} type="button" onClick={() => { setActiveSection(name); setActiveCategory(null) }} aria-pressed={activeSection === name} className={cn('relative flex min-h-[58px] shrink-0 flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-medium transition', activeSection === name ? 'text-ink' : 'text-muted-ink')}>
              <Icon className={cn('size-5', activeSection === name && 'fill-[#DC2626]/20')} strokeWidth={activeSection === name ? 2.4 : 1.8} aria-hidden="true" />
              <span className="max-w-24 truncate">{label}</span>
              {activeSection === name && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-ink" />}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-md px-3.5 pb-8">
        <p role={catalogError ? 'alert' : 'status'} className={catalogError ? 'pt-2 text-[11px] leading-4 text-[#B91C1C]' : 'sr-only'}>{catalogError ? 'Live shop availability could not be loaded. Please try again shortly.' : 'Shop status and delivery estimates update from each shop’s saved hours and settings.'}</p>
        {term ? (
          <section aria-labelledby="results-heading" className="mt-5">
            <h2 id="results-heading" className="text-xl font-bold">{results?.length ?? 0} result{results?.length === 1 ? '' : 's'}<span className="font-normal text-muted-ink"> for &ldquo;{query.trim()}&rdquo;</span></h2>
            {results?.length ? <ul className="mt-3 flex flex-col gap-2">{results.map(product => <ProductRow key={product.id} product={product} showShop />)}</ul> : <p className="mt-3 rounded-2xl border border-line bg-white p-5 text-center text-sm text-muted-ink">No products found. Try another word.</p>}
          </section>
        ) : (
          <>
            <section aria-labelledby="bestsellers-heading" className="mt-3">
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Picked for your neighborhood</p><h2 id="bestsellers-heading" className="mt-0.5 text-lg font-extrabold tracking-tight">Bestsellers</h2></div>
                <a href="/categories" className="pb-0.5 text-[11px] font-semibold text-brand-deep">All categories <ChevronRight className="inline size-3" aria-hidden="true" /></a>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {sectionCategories.slice(0, 6).map(category => {
                  const categoryId = categoryIdForName(category.name)
                  const matchedProducts = catalog?.products
                    .filter(product => product.category_id === category.id && product.product_type === 'retail' && product.is_available && product.stock > 0)
                    .sort((first, second) => Number(second.shop_open) - Number(first.shop_open)) ?? []
                  const tileImages = Array.from(new Set(matchedProducts.flatMap(product => product.images ?? []).filter(Boolean))).slice(0, 4)
                  return (
                    <button key={category.id} type="button" aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)} className={cn('flex min-w-0 flex-col items-center rounded-2xl border p-1.5 text-center transition active:scale-[0.98]', activeCategory === category.id ? 'border-brand bg-[#FFF5E7] shadow-md' : 'border-[#F0EFF3] bg-[#F5F5F8]')}>
                      <span className={cn('relative grid aspect-square w-full gap-1 overflow-hidden rounded-[1rem] bg-white p-1', tileImages.length === 1 ? 'grid-cols-1 grid-rows-1' : tileImages.length === 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2')}>
                        {tileImages.length ? tileImages.map((image, index) => <span key={`${image}-${index}`} className="min-w-0 overflow-hidden rounded-[0.8rem] bg-white"><img src={image} alt="" loading="lazy" className="size-full object-cover" /></span>) : category.image_url ? <img src={category.image_url} alt="" className="col-span-2 size-full rounded-[0.8rem] object-cover" /> : <span className="col-span-2 row-span-2 grid place-items-center rounded-[0.8rem] bg-peach text-brand-deep"><CategoryIcon category={category} restaurant={false} /></span>}
                        {matchedProducts.length > 4 && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 text-[10px] font-semibold text-muted-ink shadow-sm">+{matchedProducts.length - 4} more</span>}
                      </span>
                      <span className="mt-1.5 line-clamp-2 min-h-7 text-[11.5px] font-semibold leading-[0.9rem]">{category.name}</span>
                    </button>
                  )
                })}
                {sectionCategories.length === 0 && <p className="col-span-3 rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted-ink">Categories for this section will appear here as they are added to the catalog.</p>}
              </div>
            </section>

            <GroceryRail products={products} />

            {results && results.length > 0 && <section aria-labelledby="collection-heading" className="mt-8"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Fresh picks</p><h2 id="collection-heading" className="mt-1 text-xl font-extrabold tracking-tight">{activeCategory ? homeCategories.find(category => category.id === activeCategory)?.name : activeSection === 'All' ? 'Grocery & Kitchen' : activeSection}</h2></div><a href="/categories" className="text-xs font-semibold text-brand-deep">See all</a></div><ul className="mt-3 flex flex-col gap-2">{results.map(product => <ProductRow key={product.id} product={product} showShop />)}</ul></section>}

            <MoreProducts products={catalog ? products : []} loading={!catalog && !catalogError} area={area} onChangeLocation={onChangeLocation} />
            <section aria-label="More ways to shop" className="mt-6 grid grid-cols-2 gap-3"><a href="/restaurants" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold"><ShoppingBag className="size-4 text-brand-deep" aria-hidden="true" />Restaurants</a><a href="/categories" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold"><Store className="size-4 text-brand-deep" aria-hidden="true" />Browse stores</a></section>
          </>
        )}
      </main>
      {sheetCategory && (
        <CategorySheet
          category={sheetCategory}
          siblings={sheetSiblings}
          products={catalog?.products ?? []}
          groupLabel={activeSection === 'All' ? 'All categories' : activeSection}
          onSelect={setActiveCategory}
          onClose={() => setActiveCategory(null)}
        />
      )}
    </div>
  )
}

type BrowserCategory = { id: string; name: string; scope: 'general' | 'restaurant'; parent_id: string | null; image_url: string | null; icon: string | null; display_order: number }
type BrowserProduct = { id: string; owner_id: string; shop_name: string; category_id: string; product_type: 'retail' | 'restaurant'; name: string; description: string; unit: string; price: number; mrp?: number | null; rating?: number | null; stock: number; images: string[]; variants: { name?: string }[]; is_vegetarian: boolean | null; is_available: boolean; addons: { name?: string }[]; shop_open: boolean; shop_opens_at: string | null; delivery_estimate_min: number | null; delivery_estimate_max: number | null; shop_timezone: string; demo_only?: boolean }

const categoryIcons: Record<string, LucideIcon> = {
  'cake-slice': CakeSlice, carrot: Carrot, cookie: Cookie, 'cup-soda': CupSoda, house: House,
  'ice-cream-cone': IceCreamCone, milk: Milk, package: Package, pizza: Pizza, sandwich: Sandwich,
  'shopping-basket': ShoppingBasket, soup: Soup, utensils: Utensils,
}

function CategoryIcon({ category, restaurant }: { category: BrowserCategory; restaurant: boolean }) {
  const Icon = (category.icon ? categoryIcons[category.icon] : undefined)
    ?? (categoryIdForName(category.name) ? categoryById[categoryIdForName(category.name)!].Icon : undefined)
    ?? (restaurant ? Utensils : Package)
  return <Icon className="size-5" aria-hidden="true" />
}

export function CategoriesScreen({ area }: { area: string }) {
  const { data: catalog, error: catalogError, isLoading } = useSWR(catalogUrlForArea(area), fetchCatalog, { refreshInterval: 30_000, revalidateOnFocus: true })
  const categories = catalog?.categories ?? []
  const products = catalog?.products ?? []
  const categoryError = catalogError
  const productError = catalogError
  const categoriesLoading = isLoading
  const productsLoading = isLoading
  const { cart, addCatalogItem, removeItem } = useLazyHand()
  const [scope, setScope] = useState<'general' | 'restaurant'>('general')
  const [selectedByScope, setSelectedByScope] = useState<Record<'general' | 'restaurant', string | null>>({ general: null, restaurant: null })
  const scopedCategories = categories.filter(category => category.scope === scope)
  const selectedId = selectedByScope[scope]
  const activeCategory = scopedCategories.some(category => category.id === selectedId) ? selectedId : scopedCategories[0]?.id ?? null
  const selectedCategory = scopedCategories.find(category => category.id === activeCategory)
  const visibleCategories = scopedCategories
  const visibleProducts = products.filter(product => product.category_id === activeCategory && product.product_type === (scope === 'restaurant' ? 'restaurant' : 'retail'))

  const add = (item: BrowserProduct) => {
    const estimate = item.delivery_estimate_min && item.delivery_estimate_max
      ? `${item.delivery_estimate_min}–${item.delivery_estimate_max} min`
      : item.delivery_estimate_min
        ? `${item.delivery_estimate_min}+ min`
        : 'Estimate unavailable'
    const shop: Shop = { id: item.owner_id, name: item.shop_name, kind: scope === 'restaurant' ? 'Restaurant' : 'Local store', hours: item.shop_open ? 'Open now' : 'Closed', opensAt: item.shop_opens_at ?? 'later', rating: 0, eta: estimate, open: item.shop_open }
    const product: Product = { id: item.id, shopId: item.owner_id, name: item.name, unit: item.unit, price: Number(item.price), category: 'snacks', inStock: item.is_available && item.stock > 0, stock: item.stock, imageUrl: item.images?.[0], demoOnly: item.demo_only }
    addCatalogItem(product, shop)
  }

  return (
    <main className="flex h-[calc(100svh-70px)] min-h-[540px] flex-col bg-[#FAFAFA] pb-[max(env(safe-area-inset-bottom),8px)] text-ink">
      <header className="shrink-0 border-b border-line bg-white px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)]">
        <h1 className="text-xl font-extrabold tracking-tight">Explore</h1>
        <p className="mt-1 text-xs text-muted-ink">Browse in-stock shops and restaurant menus near {area}.</p>
        <div className="mt-3 grid h-11 grid-cols-2 rounded-full bg-[#F1F1F1] p-1" role="tablist" aria-label="Shopping destination">
          {(['general', 'restaurant'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={scope === value} onClick={() => setScope(value)} className={cn('rounded-full px-3 text-sm font-semibold transition-colors duration-200', scope === value ? 'bg-brand text-white shadow-sm' : 'text-[#4B5563] hover:text-[#1F2937]')}>{value === 'general' ? 'Stores' : 'Restaurants'}</button>)}
        </div>
      </header>
      {(categoryError || productError) ? <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Catalog data couldn&apos;t be loaded. Please try again shortly.</p> : categoriesLoading || productsLoading ? <p role="status" className="m-4 text-sm text-muted-ink">Loading catalog…</p> : scopedCategories.length === 0 ? <div className="m-4 rounded-2xl border border-dashed border-line bg-white p-6 text-center"><h2 className="font-semibold">No {scope === 'general' ? 'store' : 'restaurant'} categories yet</h2><p className="mt-2 text-sm text-muted-ink">Categories published by LazyHand will appear here.</p></div> : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(78px,24%)_1fr] overflow-hidden">
          <aside aria-label={`${scope === 'general' ? 'Store' : 'Restaurant'} categories`} className="min-h-0 overflow-y-auto border-r border-line bg-white [scrollbar-width:thin]">
            <nav className="flex flex-col gap-1 p-1.5" aria-label="Catalog categories">
              {visibleCategories.map(category => <button key={category.id} type="button" aria-current={activeCategory === category.id ? 'true' : undefined} onClick={() => setSelectedByScope(current => ({ ...current, [scope]: category.id }))} className={cn('relative flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center transition', activeCategory === category.id ? 'bg-[#FCE8E8] text-brand-deep' : 'text-muted-ink hover:bg-[#F8F8F8]')}>
                {activeCategory === category.id && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" />}
                {category.image_url ? <img src={category.image_url} alt="" className="size-10 rounded-lg object-cover" /> : <span className="grid size-10 place-items-center rounded-lg bg-[#FCE8E8] text-brand-deep"><CategoryIcon category={category} restaurant={scope === 'restaurant'} /></span>}
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{category.name}</span>
              </button>)}
            </nav>
          </aside>
          <section aria-labelledby="catalog-category-heading" className="min-h-0 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin] sm:px-4">
            <h2 id="catalog-category-heading" className="mb-3 text-sm font-bold leading-tight">{selectedCategory?.name ?? (scope === 'general' ? 'Stores' : 'Restaurants')}</h2>
            {visibleProducts.length ? <ul className="grid grid-cols-2 gap-2.5 sm:gap-3">{visibleProducts.map(item => {
              const qty = cart.items[item.id] ?? 0
              return <li key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#E9E9EC] bg-white shadow-[0_3px_12px_-10px_#111827]">
                <div className="relative aspect-square bg-[#F7F7F8]">
                  {item.images?.[0] ? <img src={item.images[0]} alt={item.name} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-xs font-semibold text-muted-ink">{scope === 'restaurant' ? 'Menu item' : 'Product'}</div>}
                  {item.product_type === 'restaurant' && item.is_vegetarian !== null && <span className={cn('absolute left-1.5 top-1.5 rounded border bg-white/95 px-1.5 py-0.5 text-[9px] font-bold', item.is_vegetarian ? 'border-green-600 text-green-700' : 'border-red-600 text-red-700')}>{item.is_vegetarian ? 'VEG' : 'NON-VEG'}</span>}
                  {item.stock <= 0 && <span className="absolute inset-x-0 bottom-0 bg-ink/75 px-2 py-1 text-center text-[10px] font-semibold text-white">Out of stock</span>}
                </div>
                <div className="flex min-h-[112px] flex-1 flex-col p-2">
                  <p className="line-clamp-2 min-h-8 text-xs font-semibold leading-4">{item.name}</p>
                  {item.demo_only && <p className="mt-0.5 text-[9px] font-semibold text-brand-deep">Preview sample · not for sale</p>}
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-ink">{item.unit || item.shop_name}</p>
                  {item.variants?.length > 0 && <p className="mt-1 line-clamp-1 text-[9px] text-muted-ink">Options: {item.variants.map(option => option.name).filter(Boolean).join(', ')}</p>}
                  {item.addons?.length > 0 && <p className="line-clamp-1 text-[9px] text-muted-ink">Add-ons: {item.addons.map(option => option.name).filter(Boolean).join(', ')}</p>}
                  <div className="mt-auto flex items-center justify-between gap-1 pt-2"><span className="text-xs font-extrabold">{rupee(Number(item.price))}</span><QtyControl qty={qty} onAdd={() => add(item)} onRemove={() => removeItem(item.id)} disabled={item.demo_only || !item.is_available || item.stock <= 0 || !item.shop_open} label={item.name} /></div>
                  {!item.shop_open && <p className="mt-1 text-[10px] font-medium text-[#B91C1C]">Closed · opens {item.shop_opens_at ?? 'later'}</p>}
                  {item.shop_open && <p className="mt-1 text-[10px] text-muted-ink">Delivery: {item.delivery_estimate_min && item.delivery_estimate_max ? `${item.delivery_estimate_min}–${item.delivery_estimate_max} min` : item.delivery_estimate_min ? `${item.delivery_estimate_min}+ min` : 'Estimate unavailable'}</p>}
                </div>
              </li>
            })}</ul> : <div className="rounded-xl border border-dashed border-line bg-white p-4 text-center"><p className="text-xs font-semibold">No available items near {area}</p><p className="mt-1 text-[10px] leading-4 text-muted-ink">Try another delivery location or check back later.</p></div>}
          </section>
        </div>
      )}
    </main>
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
        <ul className="mt-3 flex flex-col gap-2">
          {visible.map(p => (
            <ProductRow key={p.id} product={p} />
          ))}
        </ul>
      </div>
    </div>
  )
}
