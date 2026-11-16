'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
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

type DynamicCategory = { id: string; name: string; scope: 'general' | 'restaurant'; image_url: string | null; icon: string | null; display_order: number }

type HomeSection = 'All' | 'Grocery & Kitchen' | 'Snacks & Drinks' | 'Fresh' | 'Daily essentials'

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

export function CustomerHome({ area, onChangeLocation, onOpenStore }: { area: string; onChangeLocation: () => void; onOpenStore: (id: string) => void }) {
  const { shops, products } = useLazyHand()
  const { data: liveCategories = [] } = useSWR('home-catalog-categories', async () => {
    const { data, error } = await createClient().from('catalog_categories').select('id,name,scope,image_url,icon,display_order').eq('scope', 'general').eq('is_active', true).eq('is_visible', true).order('display_order')
    if (error) throw error
    return data as DynamicCategory[]
  })
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
      <header className="bg-gradient-to-b from-[#F9D66D] via-[#FCE8A6] to-[#FFF9E8] px-4 pb-5 pt-[max(env(safe-area-inset-top),16px)] text-ink">
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

      <nav aria-label="Shop sections" className="sticky top-0 z-[5] border-b border-line bg-[#FFF9E8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-5 overflow-x-auto px-4 [scrollbar-width:none]">
          {homeSections.map(({ name, Icon }) => (
            <button key={name} type="button" onClick={() => { setActiveSection(name); setActiveCategory(null) }} aria-pressed={activeSection === name} className={cn('relative flex min-h-[76px] shrink-0 flex-col items-center justify-center gap-1.5 px-1 text-[11px] font-medium transition', activeSection === name ? 'text-ink' : 'text-muted-ink')}>
              <Icon className={cn('size-6', activeSection === name && 'fill-[#F4CA4F]/35')} strokeWidth={activeSection === name ? 2.4 : 1.8} aria-hidden="true" />
              <span className="max-w-24 truncate">{name}</span>
              {activeSection === name && <span className="absolute inset-x-0 bottom-0 h-1 rounded-t-full bg-ink" />}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-md px-4 pb-8">
        <p role="status" className="pt-3 text-[11px] leading-4 text-muted-ink">Demo catalog: sample shops and legacy products are examples. Category lists come from your live catalog.</p>
        {term ? (
          <section aria-labelledby="results-heading" className="mt-5">
            <h2 id="results-heading" className="text-xl font-bold">{results?.length ?? 0} result{results?.length === 1 ? '' : 's'}<span className="font-normal text-muted-ink"> for &ldquo;{query.trim()}&rdquo;</span></h2>
            {results?.length ? <ul className="mt-3 rounded-2xl border border-line bg-white px-3">{results.map(product => <ProductRow key={product.id} product={product} showShop />)}</ul> : <p className="mt-3 rounded-2xl border border-line bg-white p-5 text-center text-sm text-muted-ink">No products found. Try another word.</p>}
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
                  const matchedProducts = categoryId ? products.filter(product => product.category === categoryId) : []
                  const tileProducts = matchedProducts.slice(0, 4)
                  return (
                    <button key={category.id} type="button" aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)} className={cn('flex min-w-0 flex-col items-center rounded-[1.35rem] border p-2 text-center transition active:scale-[0.98]', activeCategory === category.id ? 'border-brand bg-[#FFF5E7] shadow-md' : 'border-[#F0EFF3] bg-[#F5F5F8]')}>
                      <span className="relative grid aspect-square w-full grid-cols-2 gap-1 overflow-hidden rounded-[1rem] bg-white p-1">
                        {tileProducts.length ? tileProducts.map(product => <span key={product.id} className="grid min-w-0 place-items-center overflow-hidden rounded-[0.8rem] bg-white"><ProductTile category={product.category} size="sm" /></span>) : category.image_url ? <img src={category.image_url} alt="" className="col-span-2 size-full rounded-[0.8rem] object-cover" /> : <span className="col-span-2 grid place-items-center rounded-[0.8rem] bg-peach text-lg font-bold text-brand-deep">{category.icon?.slice(0, 2).toUpperCase() || 'LH'}</span>}
                        {matchedProducts.length > 4 && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 text-[10px] font-semibold text-muted-ink shadow-sm">+{matchedProducts.length - 4} more</span>}
                      </span>
                      <span className="mt-3 line-clamp-2 min-h-9 text-[13px] font-semibold leading-[1.15rem]">{category.name}</span>
                    </button>
                  )
                })}
                {sectionCategories.length === 0 && <p className="col-span-3 rounded-2xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted-ink">Categories for this section will appear here as they are added to the catalog.</p>}
              </div>
            </section>

            {results && results.length > 0 && <section aria-labelledby="collection-heading" className="mt-8"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Fresh picks</p><h2 id="collection-heading" className="mt-1 text-xl font-extrabold tracking-tight">{activeCategory ? homeCategories.find(category => category.id === activeCategory)?.name : activeSection === 'All' ? 'Grocery & Kitchen' : activeSection}</h2></div><a href="/categories" className="text-xs font-semibold text-brand-deep">See all</a></div><ul className="mt-3 rounded-2xl border border-line bg-white px-3">{results.map(product => <ProductRow key={product.id} product={product} showShop />)}</ul></section>}

            <section aria-labelledby="shops-heading" className="mt-8">
              <div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-deep">Your neighborhood</p><h2 id="shops-heading" className="mt-1 text-xl font-extrabold tracking-tight">Shops near you</h2></div><a href="/categories" className="text-xs font-semibold text-brand-deep">View all</a></div>
              <ul className="mt-3 flex flex-col gap-2.5">{sortedShops.map(shop => {
                const count = products.filter(product => product.shopId === shop.id && product.inStock).length
                return <li key={shop.id}><button type="button" onClick={() => onOpenStore(shop.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left shadow-[0_5px_18px_-14px_#6B4A34] transition active:scale-[0.99]">
                  <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', shop.open ? 'bg-peach text-brand-deep' : 'bg-[#F1EFEB] text-muted-ink')}><Store className="size-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{shop.name}</span><StatusPill tone={shop.open ? 'open' : 'closed'}>{shop.open ? 'Open' : 'Closed'}</StatusPill></span><span className="mt-1 flex items-center gap-2 text-xs text-muted-ink"><span className="flex items-center gap-0.5"><Star className="size-3 fill-[#F59E0B] text-[#F59E0B]" aria-hidden="true" /> {shop.rating}</span><span aria-hidden="true">·</span>{shop.open ? shop.eta : `Opens ${shop.opensAt}`}<span aria-hidden="true">·</span>{count} items</span></span>
                  <ChevronRight className="size-4 shrink-0 text-muted-ink" aria-hidden="true" />
                </button></li>
              })}</ul>
            </section>
            <section aria-label="More ways to shop" className="mt-6 grid grid-cols-2 gap-3"><a href="/restaurants" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold"><ShoppingBag className="size-4 text-brand-deep" aria-hidden="true" />Restaurants</a><a href="/categories" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold"><Store className="size-4 text-brand-deep" aria-hidden="true" />Browse stores</a></section>
          </>
        )}
      </main>
    </div>
  )
}

export function CategoriesScreen() {
  return (
    <div className="flex min-h-svh flex-col gap-4 px-4 pb-40 pt-[max(env(safe-area-inset-top),20px)]">
      <header>
        <h1 className="text-lg font-bold">Explore</h1>
        <p className="mt-1 text-xs text-muted-ink">Choose what you&apos;re looking for.</p>
      </header>
      <a href="/categories" className="flex min-h-24 items-center justify-between rounded-3xl border border-line bg-white p-4 shadow-[0_6px_22px_-18px_#6B4A34] transition hover:border-brand/40 hover:shadow-md">
        <span><span className="block font-semibold">Stores</span><span className="mt-1 block text-xs text-muted-ink">Groceries, daily essentials and more</span></span>
        <span className="grid size-11 place-items-center rounded-2xl bg-peach text-brand-deep"><Store className="size-5" aria-hidden="true" /></span>
      </a>
      <a href="/restaurants" className="flex min-h-24 items-center justify-between rounded-3xl border border-line bg-white p-4 shadow-[0_6px_22px_-18px_#6B4A34] transition hover:border-brand/40 hover:shadow-md">
        <span><span className="block font-semibold">Restaurants</span><span className="mt-1 block text-xs text-muted-ink">Browse restaurant menus</span></span>
        <span className="grid size-11 place-items-center rounded-2xl bg-[#FCEEDB] text-brand-deep"><ShoppingBag className="size-5" aria-hidden="true" /></span>
      </a>
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
