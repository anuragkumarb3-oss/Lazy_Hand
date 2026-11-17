'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { CakeSlice, Carrot, ChevronDown, ChevronRight, Clock, Cookie, CupSoda, House, IceCreamCone, MapPin, Milk, Package, Pizza, Sandwich, Search, Share2, ShoppingBag, ShoppingBasket, Soup, Star, Store, Utensils, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categories, categoryById, rupee, type CategoryId, type Product, type Shop } from './data'
import { useLazyHand } from './store'
import { BackButton, PrimaryButton, ProductTile, QtyControl, SecondaryButton, StatusPill } from './ui'

function ProductRow({ product, showShop }: { product: Product; showShop?: boolean }) {
  const { cart, addItem, removeItem, shopById } = useLazyHand()
  const shop = shopById[product.shopId]
  const unavailable = !product.inStock || !shop.open
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-[#EFE4D8] bg-gradient-to-r from-white via-white to-[#FFF9F2] p-3 shadow-[0_6px_18px_-16px_#6B4A34]">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[1.1rem] border border-white bg-white shadow-sm">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" /> : <ProductTile category={product.category} />}
      </span>
      <div className="min-w-0 flex-1">
        {product.featured && <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.13em] text-brand-deep">Neighborhood favorite</p>}
        <p className="truncate text-sm font-semibold tracking-tight">{product.name}</p>
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

type HomeSection = 'All' | 'Grocery & Kitchen' | 'Snacks & Drinks' | 'Fresh' | 'Daily essentials'
type CatalogResponse = { categories: BrowserCategory[]; products: BrowserProduct[] }

async function fetchCatalog(): Promise<CatalogResponse> {
  const response = await fetch('/api/catalog', { cache: 'no-store' })
  if (!response.ok) throw new Error('Catalog could not be loaded.')
  return response.json() as Promise<CatalogResponse>
}

const homeSections: { name: HomeSection; categories: string[]; Icon: typeof Store }[] = [
  { name: 'All', categories: [], Icon: Store },
  { name: 'Grocery & Kitchen', categories: ['staples', 'instant'], Icon: Store },
  { name: 'Snacks & Drinks', categories: ['snacks', 'drinks', 'bakery', 'icecream'], Icon: ShoppingBag },
  { name: 'Fresh', categories: ['veg', 'dairy', 'eggs'], Icon: MapPin },
  { name: 'Daily essentials', categories: ['staples', 'dairy', 'bakery', 'instant'], Icon: Clock },
]

function categoryIdForName(name: string) {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return Object.values(categoryById).find(category => {
    const normalizedCategory = category.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    return normalizedName === normalizedCategory || normalizedName.includes(category.short.toLowerCase()) || normalizedCategory.includes(normalizedName)
  })?.id
}

function MoreProducts({ products }: { products: Product[] }) {
  const { cart, addItem, shopById } = useLazyHand()
  const featuredProducts = [...products]
    .filter(product => product.inStock && shopById[product.shopId])
    .sort((first, second) => Number(shopById[second.shopId].open) - Number(shopById[first.shopId].open))
    .slice(0, 8)

  return (
    <section aria-labelledby="more-products-heading" className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Fresh picks</p><h2 id="more-products-heading" className="mt-1 text-xl font-extrabold tracking-tight">More Products</h2></div>
        <a href="/categories" className="pb-1 text-xs font-semibold text-brand-deep">See all <ChevronRight className="inline size-3.5" aria-hidden="true" /></a>
      </div>
      {featuredProducts.length ? <ul className="mt-3 grid grid-cols-2 gap-3">{featuredProducts.map(product => {
        const shop = shopById[product.shopId]
        const canAdd = shop.open && product.inStock
        const quantity = cart.items[product.id] ?? 0
        return <li key={product.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#EFE4D8] bg-white shadow-[0_5px_18px_-14px_#6B4A34]">
          <div className="relative aspect-square bg-[#F7F7F8]">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><ProductTile category={product.category} size="sm" /></div>}
            <span className={cn('absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-semibold', canAdd ? 'bg-white/95 text-[#15803D]' : 'bg-white/95 text-[#B91C1C')}>{canAdd ? 'Available' : 'Shop closed'}</span>
          </div>
          <div className="flex min-h-32 flex-1 flex-col p-2.5">
            <p className="line-clamp-2 min-h-9 text-xs font-semibold leading-4">{product.name}</p>
            <p className="mt-1 truncate text-[10px] text-muted-ink">{shop.name}</p>
            <div className="mt-auto flex items-center justify-between gap-2 pt-3">
              <span className="text-sm font-extrabold">{rupee(product.price)}</span>
              <button type="button" disabled={!canAdd} onClick={() => addItem(product.id)} className="min-h-9 min-w-14 rounded-lg bg-brand px-3 text-[11px] font-bold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-muted-ink" aria-label={`${quantity ? `Add another ${product.name}` : `Add ${product.name}`} to cart`}>
                {quantity ? `+ ${quantity}` : 'ADD'}
              </button>
            </div>
          </div>
        </li>
      })}</ul> : <p className="mt-3 rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted-ink">Available seller products will appear here.</p>}
    </section>
  )
}

export function CustomerHome({ area, onChangeLocation }: { area: string; onChangeLocation: () => void }) {
  const { shops, products, setCatalogData } = useLazyHand()
  const { data: catalog, error: catalogError } = useSWR('home-catalog-categories', fetchCatalog, { refreshInterval: 30_000, revalidateOnFocus: true })
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
        imageUrl: item.images?.[0],
      } as Product
    })
    setCatalogData([...shopsById.values()], liveProducts)
  }, [catalog, catalogError, setCatalogData])
  const liveCategories = catalog?.categories.filter(category => category.scope === 'general') ?? []
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState<HomeSection>('All')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const term = query.trim().toLowerCase()
  const sortedShops = [...shops].sort((a, b) => Number(b.open) - Number(a.open))

  const homeCategories = useMemo(() => liveCategories.length ? liveCategories : categories.map((category, index) => ({
    id: category.id,
    name: category.name,
    scope: 'general' as const,
    image_url: null,
    icon: category.short,
    display_order: index,
  })), [liveCategories])

  const sectionCategories = useMemo(() => {
    const section = homeSections.find(item => item.name === activeSection)
    return homeCategories.filter(category => !section?.categories.length || section.categories.includes(categoryIdForName(category.name) ?? ''))
  }, [activeSection, homeCategories])

  const visibleCategories = activeCategory
    ? sectionCategories.filter(category => category.id === activeCategory)
    : sectionCategories

  const results = useMemo(() => {
    if (term) return products.filter(product => product.name.toLowerCase().includes(term) || categoryById[product.category].name.toLowerCase().includes(term))
    if (!activeCategory && activeSection === 'All') return null
    const selectedNames = visibleCategories.map(category => category.name.toLowerCase())
    return products.filter(product => selectedNames.some(name => categoryById[product.category].name.toLowerCase() === name))
  }, [activeCategory, activeSection, products, term, visibleCategories])

  return (
    <div className="pb-40">
      <header className="bg-gradient-to-b from-[#FECACA] via-[#FEE2E2] to-[#FFF5F5] px-4 pb-5 pt-[max(env(safe-area-inset-top),16px)] text-ink">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink/75">{sortedShops.some(shop => shop.open) ? 'Local shops are ready' : 'Please come back when your store opens'}</p>
              <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight">{sortedShops.some(shop => shop.open) ? 'Shop nearby' : 'Store closed'}</h1>
              <button type="button" onClick={onChangeLocation} className="mt-1 flex max-w-full items-center gap-1 text-left text-base font-medium" aria-label={`Delivering to ${area}. Change location`}>
                <span className="truncate">{area}</span>
                <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
              </button>
            </div>
            <a href="#profile" aria-label="Your profile" className="mt-5 grid size-12 shrink-0 place-items-center rounded-full border border-white bg-white text-ink shadow-sm"><span className="text-xl font-bold">U</span></a>
          </div>
          <div className="mt-4 flex h-12 items-center gap-3 rounded-2xl border border-[#E9E3D5] bg-white px-4 text-muted-ink shadow-sm">
            <Search className="size-5 shrink-0" aria-hidden="true" />
            <label htmlFor="home-search" className="sr-only">Search products</label>
            <input
              id="home-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='Search "milk", "atta", "chips"'
              className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted-ink/70"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X className="size-4" aria-hidden="true" /></button>}
          </div>
        </div>
      </header>

      <nav aria-label="Shop sections" className="sticky top-0 z-[5] border-b border-line bg-[#FFF5F5]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-5 overflow-x-auto px-4 [scrollbar-width:none]">
          {homeSections.map(({ name, Icon }) => (
            <button key={name} type="button" onClick={() => { setActiveSection(name); setActiveCategory(null) }} aria-pressed={activeSection === name} className={cn('relative flex min-h-[76px] shrink-0 flex-col items-center justify-center gap-1.5 px-1 text-[11px] font-medium transition', activeSection === name ? 'text-ink' : 'text-muted-ink')}>
              <Icon className={cn('size-6', activeSection === name && 'fill-[#DC2626]/20')} strokeWidth={activeSection === name ? 2.4 : 1.8} aria-hidden="true" />
              <span className="max-w-24 truncate">{name}</span>
              {activeSection === name && <span className="absolute inset-x-0 bottom-0 h-1 rounded-t-full bg-ink" />}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-md px-4 pb-8">
        <p role={catalogError ? 'alert' : 'status'} className="pt-3 text-[11px] leading-4 text-muted-ink">{catalogError ? 'Live shop availability could not be loaded. Please try again shortly.' : 'Shop status and delivery estimates update from each shop’s saved hours and settings.'}</p>
        {term ? (
          <section aria-labelledby="results-heading" className="mt-5">
            <h2 id="results-heading" className="text-xl font-bold">{results?.length ?? 0} result{results?.length === 1 ? '' : 's'}<span className="font-normal text-muted-ink"> for &ldquo;{query.trim()}&rdquo;</span></h2>
            {results?.length ? <ul className="mt-3 flex flex-col gap-2">{results.map(product => <ProductRow key={product.id} product={product} showShop />)}</ul> : <p className="mt-3 rounded-2xl border border-line bg-white p-5 text-center text-sm text-muted-ink">No products found. Try another word.</p>}
          </section>
        ) : (
          <>
            <section aria-labelledby="bestsellers-heading" className="mt-5">
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Picked for your neighborhood</p><h2 id="bestsellers-heading" className="mt-1 text-xl font-extrabold tracking-tight">Bestsellers</h2></div>
                <a href="/categories" className="pb-1 text-xs font-semibold text-brand-deep">All categories <ChevronRight className="inline size-3.5" aria-hidden="true" /></a>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {sectionCategories.slice(0, 9).map(category => {
                  const categoryId = categoryIdForName(category.name)
                  const matchedProducts = categoryId ? products.filter(product => product.category === categoryId && product.inStock) : []
                  const tileProducts = [...matchedProducts]
                    .filter(product => product.imageUrl)
                    .sort((first, second) => Number(shopById[second.shopId]?.open) - Number(shopById[first.shopId]?.open))
                    .slice(0, 4)
                  return (
                    <button key={category.id} type="button" aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)} className={cn('flex min-w-0 flex-col items-center rounded-[1.35rem] border p-2 text-center transition active:scale-[0.98]', activeCategory === category.id ? 'border-brand bg-[#FFF5E7] shadow-md' : 'border-[#F0EFF3] bg-[#F5F5F8]')}>
                      <span className="relative grid aspect-square w-full grid-cols-2 gap-1 overflow-hidden rounded-[1rem] bg-white p-1">
                        {tileProducts.length ? tileProducts.map((product, index) => <span key={product.id} className={cn('min-w-0 overflow-hidden rounded-[0.8rem] bg-white', tileProducts.length === 1 && 'col-span-2 row-span-2')}><img src={product.imageUrl} alt="" loading="lazy" className="size-full object-cover" /></span>) : category.image_url ? <img src={category.image_url} alt="" className="col-span-2 size-full rounded-[0.8rem] object-cover" /> : <span className="col-span-2 grid place-items-center rounded-[0.8rem] bg-peach text-brand-deep"><CategoryIcon category={category} restaurant={false} /></span>}
                        {matchedProducts.length > 4 && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 text-[10px] font-semibold text-muted-ink shadow-sm">+{matchedProducts.length - 4} more</span>}
                      </span>
                      <span className="mt-3 line-clamp-2 min-h-9 text-[13px] font-semibold leading-[1.15rem]">{category.name}</span>
                    </button>
                  )
                })}
                {sectionCategories.length === 0 && <p className="col-span-3 rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted-ink">Categories for this section will appear here as they are added to the catalog.</p>}
              </div>
            </section>

            {results && results.length > 0 && <section aria-labelledby="collection-heading" className="mt-8"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Fresh picks</p><h2 id="collection-heading" className="mt-1 text-xl font-extrabold tracking-tight">{activeCategory ? homeCategories.find(category => category.id === activeCategory)?.name : activeSection === 'All' ? 'Grocery & Kitchen' : activeSection}</h2></div><a href="/categories" className="text-xs font-semibold text-brand-deep">See all</a></div><ul className="mt-3 flex flex-col gap-2">{results.map(product => <ProductRow key={product.id} product={product} showShop />)}</ul></section>}

            <MoreProducts products={products} />
            <section aria-label="More ways to shop" className="mt-6 grid grid-cols-2 gap-3"><a href="/restaurants" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold"><ShoppingBag className="size-4 text-brand-deep" aria-hidden="true" />Restaurants</a><a href="/categories" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold"><Store className="size-4 text-brand-deep" aria-hidden="true" />Browse stores</a></section>
          </>
        )}
      </main>
    </div>
  )
}

type BrowserCategory = { id: string; name: string; scope: 'general' | 'restaurant'; parent_id: string | null; image_url: string | null; icon: string | null; display_order: number }
type BrowserProduct = { id: string; owner_id: string; shop_name: string; category_id: string; product_type: 'retail' | 'restaurant'; name: string; description: string; unit: string; price: number; stock: number; images: string[]; variants: { name?: string }[]; is_vegetarian: boolean | null; is_available: boolean; addons: { name?: string }[]; shop_open: boolean; shop_opens_at: string | null; delivery_estimate_min: number | null; delivery_estimate_max: number | null; shop_timezone: string }

const categoryIcons: Record<string, LucideIcon> = {
  'cake-slice': CakeSlice, carrot: Carrot, cookie: Cookie, 'cup-soda': CupSoda, house: House,
  'ice-cream-cone': IceCreamCone, milk: Milk, package: Package, pizza: Pizza, sandwich: Sandwich,
  'shopping-basket': ShoppingBasket, soup: Soup, utensils: Utensils,
}

function CategoryIcon({ category, restaurant }: { category: BrowserCategory; restaurant: boolean }) {
  const Icon = category.icon ? categoryIcons[category.icon] : undefined
  if (!Icon) return <span className="text-xs font-bold">{category.icon?.slice(0, 2).toUpperCase() || (restaurant ? 'FO' : 'ST')}</span>
  return <Icon className="size-5" aria-hidden="true" />
}

export function CategoriesScreen() {
  const { data: catalog, error: catalogError, isLoading } = useSWR('/api/catalog', fetchCatalog, { refreshInterval: 30_000, revalidateOnFocus: true })
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
    const product: Product = { id: item.id, shopId: item.owner_id, name: item.name, unit: item.unit, price: Number(item.price), category: 'snacks', inStock: item.is_available && item.stock > 0 }
    addCatalogItem(product, shop)
  }

  return (
    <main className="flex h-[calc(100svh-70px)] min-h-[540px] flex-col bg-[#FAFAFA] pb-[max(env(safe-area-inset-bottom),8px)] text-ink">
      <header className="shrink-0 border-b border-line bg-white px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)]">
        <h1 className="text-xl font-extrabold tracking-tight">Explore</h1>
        <p className="mt-1 text-xs text-muted-ink">Browse local shops and restaurant menus.</p>
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
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-ink">{item.unit || item.shop_name}</p>
                  {item.variants?.length > 0 && <p className="mt-1 line-clamp-1 text-[9px] text-muted-ink">Options: {item.variants.map(option => option.name).filter(Boolean).join(', ')}</p>}
                  {item.addons?.length > 0 && <p className="line-clamp-1 text-[9px] text-muted-ink">Add-ons: {item.addons.map(option => option.name).filter(Boolean).join(', ')}</p>}
                  <div className="mt-auto flex items-center justify-between gap-1 pt-2"><span className="text-xs font-extrabold">{rupee(Number(item.price))}</span><QtyControl qty={qty} onAdd={() => add(item)} onRemove={() => removeItem(item.id)} disabled={!item.is_available || item.stock <= 0 || !item.shop_open} label={item.name} /></div>
                  {!item.shop_open && <p className="mt-1 text-[10px] font-medium text-[#B91C1C]">Closed · opens {item.shop_opens_at ?? 'later'}</p>}
                  {item.shop_open && <p className="mt-1 text-[10px] text-muted-ink">Delivery: {item.delivery_estimate_min && item.delivery_estimate_max ? `${item.delivery_estimate_min}–${item.delivery_estimate_max} min` : item.delivery_estimate_min ? `${item.delivery_estimate_min}+ min` : 'Estimate unavailable'}</p>}
                </div>
              </li>
            })}</ul> : <div className="rounded-xl border border-dashed border-line bg-white p-4 text-center"><p className="text-xs font-semibold">No items in this category yet</p><p className="mt-1 text-[10px] leading-4 text-muted-ink">Available listings will appear here when a seller adds them.</p></div>}
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
