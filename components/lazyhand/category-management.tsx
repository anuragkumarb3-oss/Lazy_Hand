'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowDown, ArrowUp, Check, ImagePlus, LoaderCircle, Plus, Store, Utensils, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type Category = {
  id: string
  name: string
  scope: 'general' | 'restaurant'
  parent_id: string | null
  business_types: string[]
  is_active: boolean
  is_visible: boolean
  display_order: number
  image_url: string | null
  icon: string | null
}
type CatalogItem = {
  id: string
  owner_id: string
  category_id: string
  product_type: 'retail' | 'restaurant'
  name: string
  description: string
  unit: string
  price: number
  stock: number
  images: string[]
  variants: unknown[]
  is_vegetarian: boolean | null
  is_available: boolean
  addons: unknown[]
  brand: string
  sku: string
  mrp: number | null
  buying_cost: number
  additional_cost: number
  low_stock_threshold: number
}
type SellerApplication = {
  user_id: string
  status: string
  requested_at: string
  profile?: { name: string | null; phone: string | null; shop_name: string | null }
}
type ManagementData = { categories: Category[]; products: CatalogItem[]; applications: SellerApplication[] }
const managementFetcher = async (url: string): Promise<ManagementData> => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Catalog data could not be loaded.')
  return response.json() as Promise<ManagementData>
}

async function mutateCatalog(payload: Record<string, unknown>) {
  const response = await fetch('/api/catalog/manage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(result?.error || 'Catalog update could not be saved.')
  }
}

function useIdentity() {
  return useSWR('catalog-identity', async () => {
    let response = await fetch('/api/admin/me', { cache: 'no-store' })
    let previewAvailable = false
    if (response.status === 401) {
      const preview = await fetch('/api/preview/session', { cache: 'no-store' })
      if (preview.ok) {
        previewAvailable = true
        const current = await preview.json() as { phone: string | null }
        if (current.phone) response = await fetch('/api/admin/me', { cache: 'no-store' })
      }
    }
    if (response.status === 401) {
      return { id: null, admin: false, role: 'customer', businessType: '', phone: null, previewAvailable }
    }
    if (!response.ok) throw new Error('Admin identity could not be loaded.')
    const me = await response.json() as { admin: boolean; phone: string | null; role: string; businessType: string }
    return { id: me.phone, admin: me.admin, role: me.role, businessType: me.businessType, phone: me.phone, previewAvailable }
  })
}

function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-800' : 'bg-red-50 text-red-900'}`}>{children}</p>
}

export function CategoryManagement() {
  const identity = useIdentity()
  const managementKey = identity.data?.admin ? '/api/catalog/manage?view=admin' : null
  const { data: management, error, mutate } = useSWR(managementKey, managementFetcher)
  const categories = management?.categories ?? []
  const sellerApplications = management?.applications ?? []
  const applicationsError = error
  const mutateApplications = mutate
  const [businessTypes, setBusinessTypes] = useState<Record<string, string>>({})
  const [reviewingSeller, setReviewingSeller] = useState<string | null>(null)
  const [draft, setDraft] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [previewPhone, setPreviewPhone] = useState('9798077838')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const startPreviewSession = async (event: React.FormEvent) => {
    event.preventDefault()
    setPreviewBusy(true)
    setPreviewError('')
    try {
      const response = await fetch('/api/preview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: previewPhone }),
      })
      const result = await response.json().catch(() => null) as { error?: string; admin?: boolean } | null
      if (!response.ok) throw new Error(result?.error || 'Preview sign-in failed.')
      if (!result?.admin) throw new Error('That number is not an active admin.')
      await identity.mutate()
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Preview sign-in failed.')
    } finally {
      setPreviewBusy(false)
    }
  }

  const reviewSeller = async (userId: string, approve: boolean) => {
    setReviewingSeller(userId); setFailure(''); setMessage('')
    try {
      await mutateCatalog({ action: 'review-seller', userId, approve, businessType: approve ? businessTypes[userId] || 'grocery' : null })
    } catch (reviewError) {
      setReviewingSeller(null)
      setFailure(reviewError instanceof Error ? reviewError.message : 'Seller request could not be reviewed.')
      return
    }
    setReviewingSeller(null)
    setMessage(approve ? 'Seller approved and registered.' : 'Seller request declined.')
    await mutate()
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    setBusy(true); setFailure(''); setMessage('')
    const payload = { name: draft.name.trim(), scope: draft.scope, parent_id: draft.parent_id || null, business_types: draft.business_types, is_active: draft.is_active, is_visible: draft.is_visible, display_order: draft.display_order, image_url: draft.image_url || null, icon: draft.icon || null }
    try {
      await mutateCatalog({ action: 'save-category', id: draft.id || undefined, ...payload })
    } catch (saveError) {
      setBusy(false)
      setFailure(saveError instanceof Error ? saveError.message : 'Category could not be saved.')
      return
    }
    setBusy(false)
    setDraft(null); setMessage('Category saved. Customer and seller views will use the updated category list.'); await mutate()
  }

  const uploadImage = async (file?: File) => {
    if (!file || !draft) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setFailure('Choose an image under 5 MB.'); return }
    setBusy(true); setFailure('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); setFailure('Sign in again to upload an image.'); return }
    const key = `admin/${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`
    const { error: uploadError } = await supabase.storage.from('catalog-media').upload(key, file, { upsert: false, contentType: file.type })
    setBusy(false)
    if (uploadError) { setFailure(uploadError.message); return }
    const { data } = supabase.storage.from('catalog-media').getPublicUrl(key)
    setDraft({ ...draft, image_url: data.publicUrl })
  }

  const reorder = async (item: Category, direction: -1 | 1) => {
    const peers = categories.filter(category => category.scope === item.scope).sort((a, b) => a.display_order - b.display_order)
    const index = peers.findIndex(category => category.id === item.id)
    const target = peers[index + direction]
    if (!target) return
    setBusy(true)
    try {
      await mutateCatalog({ action: 'reorder-category', id: item.id, targetId: target.id })
      await mutate()
    } catch (reorderError) {
      setFailure(reorderError instanceof Error ? reorderError.message : 'Category order could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (item: Category) => {
    if (!window.confirm(`Delete “${item.name}”? Categories used by menu or product items cannot be deleted; deactivate them instead.`)) return
    try {
      await mutateCatalog({ action: 'delete-category', id: item.id })
      setMessage('Category deleted.')
      await mutate()
    } catch (deleteError) {
      setFailure(deleteError instanceof Error ? deleteError.message : 'Category could not be deleted.')
    }
  }

  if (identity.isLoading) return <div className="grid min-h-svh place-items-center"><LoaderCircle className="size-6 animate-spin" /></div>
  if (identity.error || !identity.data?.admin) return (
    <main className="mx-auto grid min-h-svh max-w-lg content-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Admin access required</h1>
      <p className="text-sm text-muted-ink">Category administration is restricted to accounts with the trusted admin role. Sign in with an authorized admin account.</p>
      {identity.data?.previewAvailable && (
        <form onSubmit={startPreviewSession} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-semibold">Preview sign-in (no OTP)</p>
          <p className="text-xs text-muted-ink">Only numbers on the admin allow-list can continue.</p>
          <input value={previewPhone} onChange={event => setPreviewPhone(event.target.value)} inputMode="numeric" maxLength={10} className="h-11 rounded-xl border border-line px-3 text-sm" aria-label="Admin phone number" />
          {previewError && <p role="alert" className="text-xs text-red-700">{previewError}</p>}
          <button type="submit" disabled={previewBusy} className="h-11 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50">{previewBusy ? 'Signing in…' : 'Enter admin panel'}</button>
        </form>
      )}
    </main>
  )

  return <main className="mx-auto min-h-svh max-w-5xl bg-cream px-4 py-8 text-ink sm:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">LazyHand control center</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Category management</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-ink">One editable catalog powers customer browsing and seller listings. Retail and restaurant menus stay separate.</p></div><a href="/" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold">Customer app</a></header>
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4"><span className="grid size-10 place-items-center rounded-xl bg-peach text-brand-deep"><Store /></span><div><p className="font-semibold">General shops</p><p className="text-xs text-muted-ink">Retail categories assigned by business type</p></div></div><div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4"><span className="grid size-10 place-items-center rounded-xl bg-[#FCE8D6] text-brand-deep"><Utensils /></span><div><p className="font-semibold">Restaurants</p><p className="text-xs text-muted-ink">Independent menus, categories and items</p></div></div></div>
    <section className="mt-6 rounded-2xl border border-line bg-white p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Seller requests</h2><p className="text-xs text-muted-ink">Approve accounts and assign a business type before sellers can list products.</p></div><span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold">{sellerApplications.length} pending</span></div>
      {applicationsError && <div className="mt-4"><Notice error>Could not load seller requests: {applicationsError.message}</Notice></div>}
      {sellerApplications.length ? <div className="mt-4 flex flex-col gap-3">{sellerApplications.map(application => <article key={application.user_id} className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{application.profile?.shop_name || application.profile?.name || 'New shopkeeper request'}</p><p className="text-xs text-muted-ink">{application.profile?.phone || 'No phone'} · requested {new Date(application.requested_at).toLocaleDateString()}</p></div><label className="flex items-center gap-2 text-xs font-semibold">Business type<select value={businessTypes[application.user_id] || 'grocery'} onChange={event => setBusinessTypes(current => ({ ...current, [application.user_id]: event.target.value }))} className="h-10 rounded-lg border border-line bg-white px-2 text-sm"><option value="grocery">Grocery</option><option value="dairy">Dairy</option><option value="general">General store</option><option value="kirana">Kirana</option><option value="restaurant">Restaurant</option></select></label><div className="flex gap-2"><button disabled={reviewingSeller === application.user_id} onClick={() => void reviewSeller(application.user_id, true)} className="h-10 rounded-lg bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button disabled={reviewingSeller === application.user_id} onClick={() => void reviewSeller(application.user_id, false)} className="h-10 rounded-lg border border-line px-3 text-xs font-semibold disabled:opacity-50">Decline</button></div></article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted-ink">No pending seller requests.</p>}
    </section>
    <section className="mt-6 rounded-2xl border border-line bg-white p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">All categories</h2><p className="text-xs text-muted-ink">{categories.length} database-backed categories</p></div><button onClick={() => setDraft({ id: '', name: '', scope: 'general', parent_id: null, business_types: [], is_active: true, is_visible: true, display_order: categories.length * 10 + 10, image_url: null, icon: null })} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white"><Plus /> Add category</button></div>
      {message && <div className="mt-4"><Notice>{message}</Notice></div>}{failure && <div className="mt-4"><Notice error>{failure}</Notice></div>}{error && <div className="mt-4"><Notice error>Could not load categories: {error.message}</Notice></div>}
      {draft && <form onSubmit={save} className="mt-5 grid gap-3 rounded-2xl border border-line bg-cream p-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">Category name<input required maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="h-11 rounded-xl border border-line bg-white px-3 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Shopping section<select value={draft.scope} onChange={e => setDraft({ ...draft, scope: e.target.value as Category['scope'], parent_id: null })} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="general">General shops</option><option value="restaurant">Restaurants</option></select></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Parent category (optional)<select value={draft.parent_id ?? ''} onChange={e => setDraft({ ...draft, parent_id: e.target.value || null })} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">Top level</option>{categories.filter(c => c.scope === draft.scope && !c.parent_id && c.id !== draft.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Business types (comma separated)<input value={draft.business_types.join(', ')} onChange={e => setDraft({ ...draft, business_types: e.target.value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean) })} placeholder={draft.scope === 'restaurant' ? 'restaurant' : 'grocery, dairy, general'} className="h-11 rounded-xl border border-line bg-white px-3 text-sm" /><span className="font-normal text-muted-ink">Empty means any business type in this section.</span></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Display order<input type="number" value={draft.display_order} onChange={e => setDraft({ ...draft, display_order: Number(e.target.value) || 0 })} className="h-11 rounded-xl border border-line bg-white px-3 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Icon key (Lucide)<input value={draft.icon ?? ''} onChange={e => setDraft({ ...draft, icon: e.target.value })} placeholder="cup-soda" className="h-11 rounded-xl border border-line bg-white px-3 text-sm" /></label>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 md:col-span-2">{draft.image_url ? <img src={draft.image_url} alt="Category preview" className="size-12 rounded-lg object-cover" /> : <ImagePlus className="size-8 text-muted-ink" />}<label className="flex-1 text-xs font-semibold">Category image<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => void uploadImage(e.target.files?.[0])} className="mt-1 block max-w-full text-xs" /></label><span className="text-[11px] text-muted-ink">PNG, JPG, WebP · up to 5 MB</span></div>
        <div className="flex flex-wrap gap-4 md:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />Active</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_visible} onChange={e => setDraft({ ...draft, is_visible: e.target.checked })} />Visible to customers</label></div>
        <div className="flex gap-2 md:col-span-2"><button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{draft.id ? 'Save changes' : 'Create category'}</button><button type="button" onClick={() => setDraft(null)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold"><X className="size-4" />Cancel</button></div>
      </form>}
      <div className="mt-4 flex flex-col gap-2">{categories.map(category => <article key={category.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"><div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-peach text-brand-deep">{category.image_url ? <img src={category.image_url} alt="" className="size-full object-cover" /> : <span className="text-xs font-bold">{category.icon?.slice(0, 2).toUpperCase() || 'LH'}</span>}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{category.name}</p><p className="text-xs text-muted-ink">{category.scope === 'general' ? 'General shops' : 'Restaurant menu'} · {category.business_types.join(', ') || 'all businesses'} · order {category.display_order}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${category.is_active && category.is_visible ? 'bg-green-50 text-green-800' : 'bg-muted text-muted-foreground'}`}>{!category.is_active ? 'Inactive' : category.is_visible ? 'Visible' : 'Hidden'}</span><div className="flex items-center gap-1"><button aria-label={`Move ${category.name} up`} onClick={() => void reorder(category, -1)} className="grid size-9 place-items-center rounded-lg border border-line"><ArrowUp className="size-4" /></button><button aria-label={`Move ${category.name} down`} onClick={() => void reorder(category, 1)} className="grid size-9 place-items-center rounded-lg border border-line"><ArrowDown className="size-4" /></button><button onClick={() => { setFailure(''); setDraft({ ...category }) }} className="h-9 rounded-lg border border-line px-3 text-xs font-semibold">Edit</button><button onClick={() => void remove(category)} className="h-9 rounded-lg border border-line px-3 text-xs font-semibold text-red-700">Delete</button></div></article>)}</div>
    </section>
  </main>
}

export function SellerCatalog() {
  const identity = useIdentity()
  const managementKey = identity.data?.role === 'shopkeeper' ? '/api/catalog/manage?view=seller' : null
  const { data: management, error, isLoading, mutate } = useSWR(managementKey, managementFetcher)
  const categories = management?.categories ?? []
  const items = management?.products ?? []
  const categoriesError = error
  const categoriesLoading = isLoading
  const [categoryId, setCategoryId] = useState('')
  const [parentCategoryId, setParentCategoryId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [brand, setBrand] = useState('')
  const [sku, setSku] = useState('')
  const [mrp, setMrp] = useState('')
  const [buyingCost, setBuyingCost] = useState('0')
  const [additionalCost, setAdditionalCost] = useState('0')
  const [lowStockThreshold, setLowStockThreshold] = useState('5')
  const [stock, setStock] = useState('0')
  const [images, setImages] = useState<string[]>([])
  const [vegetarian, setVegetarian] = useState(true)
  const [variants, setVariants] = useState('')
  const [addons, setAddons] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const businessType = identity.data?.businessType ?? ''
  const type: 'retail' | 'restaurant' = businessType.includes('restaurant') ? 'restaurant' : 'retail'
  const typeOptions = useMemo(() => {
    const isRestaurant = businessType.includes('restaurant')
    return categories.filter(category => category.scope === (isRestaurant ? 'restaurant' : 'general') && category.is_active && (category.business_types.length === 0 || category.business_types.includes(businessType)))
  }, [businessType, categories])
  const topLevelOptions = typeOptions.filter(category => !category.parent_id)
  const childOptions = typeOptions.filter(category => category.parent_id === parentCategoryId)
  const myItems = items.filter(item => item.owner_id === identity.data?.id)
  const visibleItems = myItems.filter(item => item.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) && (!filterCategoryId || item.category_id === filterCategoryId))

  const uploadImage = async (file?: File) => {
    if (!file || !identity.data) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setMessage('Choose an image under 5 MB.'); return }
    const key = `${identity.data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`
    const supabase = createClient()
    const { error: uploadError } = await supabase.storage.from('catalog-media').upload(key, file, { contentType: file.type })
    if (uploadError) { setMessage(uploadError.message); return }
    setImages(current => [...current, supabase.storage.from('catalog-media').getPublicUrl(key).data.publicUrl])
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    if (!identity.data) { setMessage('Sign in again to manage listings.'); return }
    const amount = Number(price); const quantity = Number(stock)
    const cost = Number(buyingCost); const otherCost = Number(additionalCost); const threshold = Number(lowStockThreshold)
    const suggestedRetailPrice = mrp.trim() ? Number(mrp) : null
    const variantRows = variants.split('\n').map(row => row.trim()).filter(Boolean).map(row => {
      const [label = '', variantPrice = '', variantStock = ''] = row.split('|').map(part => part.trim())
      return { name: label, price: Number(variantPrice), stock: Number(variantStock) }
    })
    if (!categoryId || !name.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(quantity) || quantity < 0) { setMessage('Select a category and enter a name, positive price, and non-negative stock.'); return }
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(otherCost) || otherCost < 0 || !Number.isInteger(threshold) || threshold < 0 || (suggestedRetailPrice !== null && (!Number.isFinite(suggestedRetailPrice) || suggestedRetailPrice < amount))) { setMessage('Check buying cost, additional expenses, stock threshold, and MRP (MRP must be at least the selling price).'); return }
    if (variantRows.some(variant => !variant.name || !Number.isFinite(variant.price) || variant.price <= 0 || !Number.isInteger(variant.stock) || variant.stock < 0)) { setMessage('Enter each variant as: name | price | stock quantity.'); return }
    const parseList = (value: string) => value.split(',').map(part => part.trim()).filter(Boolean).map(label => ({ name: label }))
    const payload = { owner_id: identity.data.id, category_id: categoryId, product_type: type, name: name.trim(), description: description.trim(), unit: unit.trim(), brand: brand.trim(), sku: sku.trim(), mrp: suggestedRetailPrice, buying_cost: cost, additional_cost: otherCost, low_stock_threshold: threshold, price: amount, stock: quantity, images, variants: variantRows, is_vegetarian: type === 'restaurant' ? vegetarian : null, is_available: quantity > 0, addons: type === 'restaurant' ? parseList(addons) : [] }
    setBusy(true)
    try {
      await mutateCatalog({ action: 'save-product', id: editingItem?.id, ...payload })
    } catch (saveError) {
      setBusy(false)
      setMessage(saveError instanceof Error ? saveError.message : 'Listing could not be saved.')
      return
    }
    setBusy(false)
    setEditingItem(null); setCategoryId(''); setParentCategoryId(''); setName(''); setDescription(''); setUnit(''); setPrice(''); setBrand(''); setSku(''); setMrp(''); setBuyingCost('0'); setAdditionalCost('0'); setLowStockThreshold('5'); setStock('0'); setImages([]); setVariants(''); setAddons(''); setMessage(editingItem ? 'Listing updated.' : 'Listing saved.'); setShowForm(false); await mutate()
  }

  const toggleAvailability = async (item: CatalogItem) => {
    try {
      await mutateCatalog({ action: 'toggle-product', id: item.id, isAvailable: !item.is_available })
      await mutate()
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : 'Availability could not be updated.')
    }
  }

  if (identity.isLoading) return <main className="grid min-h-svh place-items-center"><LoaderCircle className="size-6 animate-spin" /></main>
  if (identity.error || !identity.data || identity.data.role !== 'shopkeeper') return <main className="grid min-h-svh w-full place-items-center bg-[#F7F8FA] px-4 py-8 text-ink"><section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm"><span className="grid size-12 place-items-center rounded-2xl bg-[#FCE8E8] text-brand-deep"><Store className="size-6" aria-hidden="true" /></span><h1 className="mt-5 text-2xl font-bold tracking-tight">Seller sign-in required</h1><p className="mt-2 text-sm leading-6 text-muted-ink">Sign in with a registered shopkeeper account to manage your product listings.</p><a href="/" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-deep">Return to LazyHand</a></section></main>
  const isRestaurant = businessType.includes('restaurant')
  return <main className="mx-auto min-h-svh w-full max-w-5xl bg-[#F7F8FA] px-4 py-6 text-ink sm:px-6 sm:py-8"><header className="rounded-2xl border border-line bg-white p-5 sm:p-6"><a href="/" className="text-sm font-semibold text-brand-deep">← LazyHand</a><p className="mt-5 text-xs font-semibold text-brand-deep">Seller workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{isRestaurant ? 'Restaurant menu' : 'Product catalog'}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-ink">{isRestaurant ? 'Manage your restaurant menu separately from retail products.' : 'Only categories assigned to your business type are available.'}</p><button type="button" onClick={() => { setEditingItem(null); setShowForm(true) }} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white"><Plus className="size-4" aria-hidden="true" />Add product</button></header>
    <div className="mt-5 max-w-md rounded-xl border border-line bg-white px-4 py-3"><p className="text-xs font-semibold">Registered business type</p><p className="mt-1 text-sm font-medium capitalize">{businessType || 'Not assigned'}</p><p className="mt-1 text-xs text-muted-ink">Business type is assigned by an administrator and controls your category access.</p></div>
    {message && <div className="mt-4"><Notice error={message !== 'Listing saved.'}>{message}</Notice></div>}
    {categoriesError && <div className="mt-5"><Notice error>Product categories couldn&apos;t be loaded. Seller catalog storage is unavailable for this account.</Notice></div>}
    {!categoriesError && !categoriesLoading && !typeOptions.length && <div className="mt-5"><Notice error>No active categories are assigned to “{businessType || 'your business type'}”. Ask an administrator to enable categories for this shop type.</Notice></div>}
    {showForm && <form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2"><label className="flex flex-col gap-1 text-xs font-semibold">Category<select required value={parentCategoryId} onChange={e => { const nextParent = e.target.value; setParentCategoryId(nextParent); setCategoryId(typeOptions.some(category => category.parent_id === nextParent) ? '' : nextParent) }} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">Select a category</option>{topLevelOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{parentCategoryId && <label className="flex flex-col gap-1 text-xs font-semibold">Subcategory<select required={childOptions.length > 0} value={childOptions.length > 0 ? categoryId : parentCategoryId} onChange={e => setCategoryId(e.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">{childOptions.length ? 'Select a subcategory' : 'No subcategories'}</option>{childOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label className="flex flex-col gap-1 text-xs font-semibold">Item name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">Brand<input maxLength={100} value={brand} onChange={e => setBrand(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">SKU / product ID<input maxLength={80} value={sku} onChange={e => setSku(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">Description<textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl border border-line p-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">{isRestaurant ? 'Price (₹)' : 'Selling price (₹)'}<input required type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">MRP (₹, optional)<input type="number" min="0" step="0.01" value={mrp} onChange={e => setMrp(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">Buying cost (private, ₹)<input type="number" min="0" step="0.01" value={buyingCost} onChange={e => setBuyingCost(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">Other costs (₹)<input type="number" min="0" step="0.01" value={additionalCost} onChange={e => setAdditionalCost(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">Low-stock warning at<input type="number" min="0" step="1" value={lowStockThreshold} onChange={e => setLowStockThreshold(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">{isRestaurant ? 'Available stock' : 'Available stock'}<input required type="number" min="0" step="1" value={stock} onChange={e => setStock(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label>{!isRestaurant && <label className="flex flex-col gap-1 text-xs font-semibold">Pack / unit<input value={unit} onChange={e => setUnit(e.target.value)} placeholder="500 g, 1 pack" className="h-11 rounded-xl border border-line px-3 text-sm" /></label>}
      {isRestaurant && <label className="flex items-center gap-3 rounded-xl bg-cream p-3 text-sm font-semibold"><input type="checkbox" checked={vegetarian} onChange={e => setVegetarian(e.target.checked)} />Vegetarian</label>}
      {!isRestaurant && <div className="rounded-xl bg-[#F7F8FA] p-3 text-sm sm:col-span-2"><p className="font-semibold">Estimated product profit · ₹{(Number(price || 0) - Number(buyingCost || 0) - Number(additionalCost || 0)).toFixed(2)}{Number(price) > 0 ? ` · ${(((Number(price) - Number(buyingCost || 0) - Number(additionalCost || 0)) / Number(price)) * 100).toFixed(1)}% margin` : ''}</p><p className="mt-1 text-xs text-muted-ink">Buying cost and estimate are private to your seller account and are not included in customer catalog responses.</p></div>}
      <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">Variants (one per line: name | price | stock)<textarea rows={3} value={variants} onChange={e => setVariants(e.target.value)} placeholder={'500 g | 120 | 15\n1 kg | 220 | 8'} className="rounded-xl border border-line px-3 py-2 text-sm" /></label>{isRestaurant && <label className="flex flex-col gap-1 text-xs font-semibold">Optional add-ons (comma separated)<input value={addons} onChange={e => setAddons(e.target.value)} placeholder="Extra cheese, Dip" className="h-11 rounded-xl border border-line px-3 text-sm" /></label>}
      <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">Product images<input multiple type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => { const files = Array.from(e.target.files ?? []); if (images.length + files.length > 8) setMessage('You can attach up to 8 product images.'); files.slice(0, Math.max(0, 8 - images.length)).forEach(file => void uploadImage(file)); e.target.value = '' }} className="mt-2 text-xs" /><span className="text-[11px] font-normal text-muted-ink">Upload up to 8 images, 5 MB each. First image is the main listing image.</span></label>{images.length > 0 && <ul className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">{images.map((image, index) => <li key={`${image}-${index}`} className="rounded-xl border border-line bg-[#F7F8FA] p-2"><img src={image} alt={`Product image ${index + 1}${index === 0 ? ', main image' : ''}`} className="aspect-square w-full rounded-lg object-cover" /><div className="mt-2 flex flex-wrap gap-1"><button type="button" disabled={index === 0} onClick={() => setImages(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next })} aria-label={`Move image ${index + 1} earlier`} className="min-h-8 rounded-md border border-line bg-white px-2 text-xs disabled:opacity-40"><ArrowUp className="size-3.5" aria-hidden="true" /></button><button type="button" disabled={index === images.length - 1} onClick={() => setImages(current => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next })} aria-label={`Move image ${index + 1} later`} className="min-h-8 rounded-md border border-line bg-white px-2 text-xs disabled:opacity-40"><ArrowDown className="size-3.5" aria-hidden="true" /></button><button type="button" onClick={() => setImages(current => current.filter((_, imageIndex) => imageIndex !== index))} className="min-h-8 rounded-md border border-line bg-white px-2 text-xs">Remove</button><span className="self-center text-[10px] font-medium text-muted-ink">{index === 0 ? 'Main' : ''}</span></div></li>)}</ul>}<button disabled={busy || !typeOptions.length} className="h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy ? 'Saving…' : editingItem ? 'Save changes' : `Add ${isRestaurant ? 'menu item' : 'product'}`}</button>{editingItem && <button type="button" onClick={() => { setEditingItem(null); setCategoryId(''); setParentCategoryId(''); setName(''); setDescription(''); setUnit(''); setPrice(''); setStock('0'); setImages([]); setVariants(''); setAddons('') }} className="h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold sm:col-span-2">Cancel edit</button>}
    </form>}
    <section className="mt-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Your listings <span className="text-sm font-medium text-muted-ink">({myItems.length})</span></h2><p className="mt-1 text-sm text-muted-ink">Search and filter your shop items.</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]"><label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3"><span className="sr-only">Search products</span><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search products" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-medium text-muted-ink">Category<select aria-label="Filter by category" value={filterCategoryId} onChange={event => setFilterCategoryId(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"><option value="">All categories</option>{typeOptions.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div><div className="mt-3 flex flex-col gap-3">{visibleItems.map(item => <article key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">{item.images[0] ? <img src={item.images[0]} alt="" className="size-14 rounded-xl object-cover" /> : <div className="grid size-14 place-items-center rounded-xl bg-peach text-brand-deep">{isRestaurant ? <Utensils /> : <Store />}</div>}<div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p className="text-xs text-muted-ink">{categories.find(c => c.id === item.category_id)?.name ?? 'Category'} · ₹{Number(item.price).toFixed(2)} · stock {item.stock}</p><p className="text-xs text-muted-ink">{isRestaurant ? item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian' : item.unit || 'Retail item'} · {item.is_available ? 'Available' : 'Unavailable'}</p></div><div className="flex shrink-0 flex-col gap-2"><button type="button" onClick={() => { setEditingItem(item); const selectedCategory = typeOptions.find(category => category.id === item.category_id); setParentCategoryId(selectedCategory?.parent_id ?? selectedCategory?.id ?? ''); setCategoryId(item.category_id); setName(item.name); setDescription(item.description); setUnit(item.unit); setPrice(String(item.price)); setBrand(item.brand); setSku(item.sku); setMrp(item.mrp == null ? '' : String(item.mrp)); setBuyingCost(String(item.buying_cost)); setAdditionalCost(String(item.additional_cost)); setLowStockThreshold(String(item.low_stock_threshold)); setStock(String(item.stock)); setImages(item.images); setVegetarian(Boolean(item.is_vegetarian)); setVariants(item.variants.map(value => typeof value === 'object' && value && 'name' in value ? `${String(value.name)} | ${'price' in value ? String(value.price) : ''} | ${'stock' in value ? String(value.stock) : ''}` : String(value)).join('\n')); setAddons(item.addons.map(value => typeof value === 'object' && value && 'name' in value ? String(value.name) : String(value)).join(', ')); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold">Edit</button><button type="button" onClick={() => void toggleAvailability(item)} className="min-h-10 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-brand-deep transition hover:bg-[#FCE8E8]">{item.is_available ? 'Deactivate' : 'Activate'}</button></div></article>)}</div>{isLoading && <p role="status" className="mt-3 rounded-xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted-ink">Loading your listings…</p>}{!error && !isLoading && !visibleItems.length && <p className="mt-3 rounded-xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted-ink">{myItems.length ? 'No products match your search and category filters.' : 'You haven’t added any products yet. Add your first listing above.'}</p>}{error && <p role="alert" className="mt-3 text-sm text-red-800">Your listings couldn&apos;t be loaded. Check your connection or try again later.</p>}</section>
  </main>
}

export function GeneralCategoryBrowse() {
  const { data: catalog, error: catalogError } = useSWR('/api/catalog', managementFetcher)
  const categories = catalog?.categories ?? []
  const items = catalog?.products ?? []
  const categoryError = catalogError
  const itemError = catalogError
  const general = categories.filter(category => category.scope === 'general' && category.is_active && category.is_visible)
  const [active, setActive] = useState('')
  const selected = general.some(category => category.id === active) ? active : general[0]?.id
  const visible = items.filter(item => item.product_type === 'retail' && item.is_available && item.category_id === selected)
  const categoryName = general.find(category => category.id === selected)?.name

  return (
    <main className="mx-auto min-h-svh max-w-6xl bg-cream px-3 pb-10 pt-[max(env(safe-area-inset-top),16px)] text-ink sm:px-6 sm:pt-8">
      <header className="mb-5 sm:mb-7">
        <a href="/" className="text-sm font-semibold text-brand-deep">← LazyHand</a>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-deep sm:mt-5 sm:text-xs">Neighborhood stores</p>
        <h1 className="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">Browse categories</h1>
      </header>
      {(categoryError || itemError) && <div className="mb-4"><Notice error>Store categories are temporarily unavailable. Please try again.</Notice></div>}
      {general.length ? (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start border-t border-line sm:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Product categories" className="sticky top-0 max-h-[calc(100svh-1rem)] overflow-y-auto border-r border-line bg-cream py-2 [scrollbar-width:thin]">
            <ul className="flex flex-col gap-1 sm:gap-2">
              {general.map(category => {
                const isSelected = selected === category.id
                return (
                  <li key={category.id}>
                    <button type="button" onClick={() => setActive(category.id)} aria-pressed={isSelected} className={cn('relative flex min-h-24 w-full flex-col items-center justify-center gap-2 px-1.5 py-3 text-center text-[11px] leading-tight transition sm:min-h-20 sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:text-sm', isSelected ? 'bg-white font-semibold text-brand-deep after:absolute after:inset-y-0 after:right-0 after:w-1 after:rounded-l-full after:bg-brand' : 'text-muted-ink hover:bg-white/70')}>
                      {category.image_url ? <img src={category.image_url} alt="" className="size-11 shrink-0 rounded-full bg-white object-cover sm:size-12" /> : <span className={cn('grid size-11 shrink-0 place-items-center rounded-full text-xs font-bold sm:size-12', isSelected ? 'bg-peach text-brand-deep' : 'bg-white text-muted-ink')}>{category.icon?.slice(0, 2).toUpperCase() || 'LH'}</span>}
                      <span className="line-clamp-2 w-full sm:w-auto">{category.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
          <section aria-labelledby="category-products-heading" className="min-w-0 px-2.5 py-4 sm:px-5 sm:py-5 lg:px-7">
            <div className="mb-3 flex items-baseline justify-between gap-2 sm:mb-5">
              <h2 id="category-products-heading" className="text-base font-bold leading-tight sm:text-2xl">{categoryName}</h2>
              <span className="shrink-0 text-[10px] text-muted-ink sm:text-xs">{visible.length} items</span>
            </div>
            {visible.length ? (
              <ul className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
                {visible.map(item => (
                  <li key={item.id}>
                    <article className="h-full overflow-hidden rounded-xl border border-line bg-white shadow-sm sm:rounded-2xl">
                      {item.images[0] ? <img src={item.images[0]} alt={item.name} loading="lazy" className="aspect-square w-full bg-white object-contain p-1.5 sm:p-3" /> : <div className="grid aspect-square place-items-center bg-peach text-brand-deep"><Store className="size-8" aria-hidden="true" /></div>}
                      <div className="flex min-h-24 flex-col p-2.5 sm:min-h-28 sm:p-3.5">
                        <h3 className="line-clamp-2 text-xs font-semibold leading-4 sm:text-sm sm:leading-5">{item.name}</h3>
                        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-ink sm:text-xs">{item.description || item.unit}</p>
                        <p className="mt-auto pt-2 text-sm font-bold sm:text-base">₹{Number(item.price).toFixed(2)}{item.unit ? <span className="ml-1 text-[10px] font-normal text-muted-ink sm:text-xs">/ {item.unit}</span> : null}</p>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-dashed border-line bg-white p-4 text-center text-xs text-muted-ink sm:p-7 sm:text-sm">No products are listed in this category yet.</p>}
          </section>
        </div>
      ) : <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted-ink">Categories will appear here when they are added to the catalog.</p>}
    </main>
  )
}

export function RestaurantBrowse() {
  const { data: catalog, error: catalogError } = useSWR('/api/catalog', managementFetcher)
  const categories = catalog?.categories ?? []
  const items = catalog?.products ?? []
  const categoryError = catalogError
  const itemError = catalogError
  const menuCategories = categories.filter(category => category.scope === 'restaurant' && category.is_active && category.is_visible)
  const [active, setActive] = useState('')
  const selected = active || menuCategories[0]?.id
  const visible = items.filter(item => item.product_type === 'restaurant' && item.is_available && item.category_id === selected)
  const categoryName = menuCategories.find(category => category.id === selected)?.name
  return <main className="mx-auto min-h-svh max-w-5xl bg-cream px-4 py-8 text-ink sm:px-8"><header className="flex items-center justify-between"><div><a href="/" className="text-sm font-semibold text-brand-deep">← LazyHand</a><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">Food, nearby</p><h1 className="mt-2 text-3xl font-bold">Restaurants</h1><p className="mt-2 text-sm text-muted-ink">Restaurant menus are a separate catalog from neighborhood shops.</p></div><span className="grid size-12 place-items-center rounded-2xl bg-peach text-brand-deep"><Utensils /></span></header>
    {categoryError || itemError ? <div className="mt-6"><Notice error>Restaurant menus are temporarily unavailable. Please try again.</Notice></div> : null}
    <div className="mt-6 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Restaurant menu categories">{menuCategories.map(category => <button key={category.id} role="tab" aria-selected={selected === category.id} onClick={() => setActive(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${selected === category.id ? 'bg-brand text-white' : 'border border-line bg-white'}`}>{category.name}</button>)}</div>
    <section className="mt-4" aria-label={categoryName ?? 'Menu items'}><h2 className="text-xl font-bold">{categoryName ?? 'Menu'}</h2>{visible.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{visible.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-line bg-white">{item.images[0] ? <img src={item.images[0]} alt={item.name} className="h-44 w-full object-cover" /> : <div className="grid h-32 place-items-center bg-peach text-brand-deep"><Utensils className="size-8" /></div>}<div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold">{item.name}</h3><span className="shrink-0 font-semibold">₹{Number(item.price).toFixed(2)}</span></div><p className="mt-1 text-sm leading-5 text-muted-ink">{item.description}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-cream px-2.5 py-1 text-xs">{item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'}</span>{item.variants.map((variant, index) => <span key={index} className="rounded-full bg-cream px-2.5 py-1 text-xs">{typeof variant === 'object' && variant && 'name' in variant ? String(variant.name) : String(variant)}</span>)}</div></div></article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-line bg-white p-8 text-center"><Utensils className="mx-auto size-8 text-muted-ink" /><h3 className="mt-3 font-semibold">No menu items yet</h3><p className="mt-1 text-sm text-muted-ink">Check back when a nearby restaurant publishes this part of its menu.</p></div>}</section>
  </main>
}
