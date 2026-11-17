'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowDown, ArrowUp, Check, ImagePlus, LoaderCircle, Plus, Store, Utensils, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
}
type SellerApplication = {
  user_id: string
  status: string
  requested_at: string
  profile?: { name: string | null; phone: string | null; shop_name: string | null }
}
type SellerProfileSummary = { id: string; name: string | null; phone: string | null; shop_name: string | null }
const supabase = createClient()
const categoryFetcher = async () => {
  const { data, error } = await supabase.from('catalog_categories').select('id,name,scope,parent_id,business_types,is_active,is_visible,display_order,image_url,icon').order('display_order').order('name')
  if (error) throw error
  return data as Category[]
}
const itemFetcher = async () => {
  const { data, error } = await supabase.from('catalog_products').select('id,owner_id,category_id,product_type,name,description,unit,price,stock,images,variants,is_vegetarian,is_available,addons').order('created_at', { ascending: false })
  if (error) throw error
  return data as CatalogItem[]
}

const sellerApplicationsFetcher = async (): Promise<SellerApplication[]> => {
  const { data: applications, error } = await supabase.from('seller_applications').select('user_id,status,requested_at').eq('status', 'pending').order('requested_at')
  if (error) throw error
  const applicationRows = (applications ?? []) as Omit<SellerApplication, 'profile'>[]
  if (!applicationRows.length) return []
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,name,phone,shop_name').in('id', applicationRows.map(application => application.user_id))
  if (profilesError) throw profilesError
  const profileRows = (profiles ?? []) as SellerProfileSummary[]
  const profileById = new Map(profileRows.map(profile => [profile.id, profile]))
  return applicationRows.map(application => ({ ...application, profile: profileById.get(application.user_id) }))
}

function useIdentity() {
  return useSWR('catalog-identity', async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('role,shop_type').eq('id', user.id).maybeSingle()
    return { id: user.id, admin: user.app_metadata?.role === 'admin', role: profile?.role ?? 'customer', businessType: (profile?.shop_type ?? '').toLowerCase() }
  })
}

function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-800' : 'bg-red-50 text-red-900'}`}>{children}</p>
}

export function CategoryManagement() {
  const identity = useIdentity()
  const { data: categories = [], error, mutate } = useSWR('catalog-categories', categoryFetcher)
  const { data: sellerApplications = [], error: applicationsError, mutate: mutateApplications } = useSWR(identity.data?.admin ? 'seller-applications' : null, sellerApplicationsFetcher)
  const [businessTypes, setBusinessTypes] = useState<Record<string, string>>({})
  const [reviewingSeller, setReviewingSeller] = useState<string | null>(null)
  const [draft, setDraft] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')

  const reviewSeller = async (userId: string, approve: boolean) => {
    setReviewingSeller(userId); setFailure(''); setMessage('')
    const { error: reviewError } = await supabase.rpc('admin_review_seller', {
      target_user_id: userId,
      approve,
      assigned_business_type: approve ? businessTypes[userId] || 'grocery' : null,
    })
    setReviewingSeller(null)
    if (reviewError) { setFailure(reviewError.message); return }
    setMessage(approve ? 'Seller approved and registered.' : 'Seller request declined.')
    await Promise.all([mutateApplications(), mutate()])
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    setBusy(true); setFailure(''); setMessage('')
    const payload = { name: draft.name.trim(), scope: draft.scope, parent_id: draft.parent_id || null, business_types: draft.business_types, is_active: draft.is_active, is_visible: draft.is_visible, display_order: draft.display_order, image_url: draft.image_url || null, icon: draft.icon || null }
    const result = draft.id
      ? await supabase.from('catalog_categories').update(payload).eq('id', draft.id)
      : await supabase.from('catalog_categories').insert(payload)
    setBusy(false)
    if (result.error) { setFailure(result.error.message); return }
    setDraft(null); setMessage('Category saved. Customer and seller views will use the updated category list.'); await mutate()
  }

  const uploadImage = async (file?: File) => {
    if (!file || !draft) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setFailure('Choose an image under 5 MB.'); return }
    setBusy(true); setFailure('')
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
    const first = await supabase.from('catalog_categories').update({ display_order: target.display_order }).eq('id', item.id)
    const second = first.error ? first : await supabase.from('catalog_categories').update({ display_order: item.display_order }).eq('id', target.id)
    setBusy(false)
    if (second.error) setFailure(second.error.message); else await mutate()
  }

  const remove = async (item: Category) => {
    if (!window.confirm(`Delete “${item.name}”? Categories used by menu or product items cannot be deleted; deactivate them instead.`)) return
    const { error: deleteError } = await supabase.from('catalog_categories').delete().eq('id', item.id)
    if (deleteError) setFailure(deleteError.message); else { setMessage('Category deleted.'); await mutate() }
  }

  if (identity.isLoading) return <div className="grid min-h-svh place-items-center"><LoaderCircle className="size-6 animate-spin" /></div>
  if (identity.error || !identity.data?.admin) return <main className="mx-auto grid min-h-svh max-w-lg content-center gap-3 p-6"><h1 className="text-2xl font-bold">Admin access required</h1><p className="text-sm text-muted-ink">Category administration is restricted to accounts with the trusted admin role. Sign in with an authorized admin account.</p></main>

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
  const { data: categories = [] } = useSWR('catalog-categories', categoryFetcher)
  const { data: items = [], error, mutate } = useSWR('catalog-products', itemFetcher)
  const [categoryId, setCategoryId] = useState('')
  const [parentCategoryId, setParentCategoryId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [images, setImages] = useState<string[]>([])
  const [vegetarian, setVegetarian] = useState(true)
  const [variants, setVariants] = useState('')
  const [addons, setAddons] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const businessType = identity.data?.businessType ?? ''
  const type: 'retail' | 'restaurant' = businessType.includes('restaurant') ? 'restaurant' : 'retail'
  const typeOptions = useMemo(() => {
    const isRestaurant = businessType.includes('restaurant')
    return categories.filter(category => category.scope === (isRestaurant ? 'restaurant' : 'general') && category.is_active && (category.business_types.length === 0 || category.business_types.includes(businessType)))
  }, [businessType, categories])
  const topLevelOptions = typeOptions.filter(category => !category.parent_id)
  const childOptions = typeOptions.filter(category => category.parent_id === parentCategoryId)
  const myItems = items.filter(item => item.owner_id === identity.data?.id)

  const uploadImage = async (file?: File) => {
    if (!file || !identity.data) return
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setMessage('Choose an image under 5 MB.'); return }
    const key = `${identity.data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`
    const { error: uploadError } = await supabase.storage.from('catalog-media').upload(key, file, { contentType: file.type })
    if (uploadError) { setMessage(uploadError.message); return }
    setImages(current => [...current, supabase.storage.from('catalog-media').getPublicUrl(key).data.publicUrl])
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    const amount = Number(price); const quantity = Number(stock)
    if (!categoryId || !name.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(quantity) || quantity < 0) { setMessage('Select a category and enter a name, positive price, and non-negative stock.'); return }
    const parseList = (value: string) => value.split(',').map(part => part.trim()).filter(Boolean).map(label => ({ name: label }))
    setBusy(true)
    const { error: insertError } = await supabase.from('catalog_products').insert({ owner_id: identity.data?.id, category_id: categoryId, product_type: type, name: name.trim(), description: description.trim(), unit: unit.trim(), price: amount, stock: quantity, images, variants: parseList(variants), is_vegetarian: type === 'restaurant' ? vegetarian : null, is_available: quantity > 0, addons: type === 'restaurant' ? parseList(addons) : [] })
    setBusy(false)
    if (insertError) { setMessage(insertError.message); return }
    setName(''); setDescription(''); setUnit(''); setPrice(''); setStock('0'); setImages([]); setVariants(''); setAddons(''); setMessage('Listing saved.'); await mutate()
  }

  const toggleAvailability = async (item: CatalogItem) => {
    const { error: updateError } = await supabase.from('catalog_products').update({ is_available: !item.is_available }).eq('id', item.id)
    if (updateError) setMessage(updateError.message); else await mutate()
  }

  if (identity.isLoading) return <main className="grid min-h-svh place-items-center"><LoaderCircle className="size-6 animate-spin" /></main>
  if (identity.error || !identity.data || identity.data.role !== 'shopkeeper') return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-bold">Seller sign-in required</h1><p className="mt-2 text-sm text-muted-ink">Sign in to a registered shopkeeper account to manage listings.</p></main>
  const isRestaurant = businessType.includes('restaurant')
  return <main className="mx-auto min-h-svh max-w-4xl bg-cream px-4 py-8 text-ink sm:px-8"><header><a href="/" className="text-sm font-semibold text-brand-deep">← LazyHand</a><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">Seller workspace</p><h1 className="mt-2 text-3xl font-bold">{isRestaurant ? 'Restaurant menu' : 'Product catalog'}</h1><p className="mt-2 text-sm text-muted-ink">{isRestaurant ? 'Manage your restaurant menu separately from retail products.' : 'Only categories assigned to your business type are available.'}</p></header>
    <div className="mt-5 max-w-md rounded-xl border border-line bg-white px-4 py-3"><p className="text-xs font-semibold">Registered business type</p><p className="mt-1 text-sm font-medium capitalize">{businessType || 'Not assigned'}</p><p className="mt-1 text-xs text-muted-ink">Business type is assigned by an administrator and controls your category access.</p></div>
    {message && <div className="mt-4"><Notice error={message !== 'Listing saved.'}>{message}</Notice></div>}
    {!typeOptions.length && <div className="mt-5"><Notice error>No active categories are assigned to “{businessType || 'your business type'}”. Ask an administrator to enable categories for this shop type.</Notice></div>}
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2"><label className="flex flex-col gap-1 text-xs font-semibold">Category<select required value={parentCategoryId} onChange={e => { const nextParent = e.target.value; setParentCategoryId(nextParent); setCategoryId(typeOptions.some(category => category.parent_id === nextParent) ? '' : nextParent) }} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">Select a category</option>{topLevelOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{parentCategoryId && <label className="flex flex-col gap-1 text-xs font-semibold">Subcategory<select required={childOptions.length > 0} value={childOptions.length > 0 ? categoryId : parentCategoryId} onChange={e => setCategoryId(e.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 text-sm"><option value="">{childOptions.length ? 'Select a subcategory' : 'No subcategories'}</option>{childOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label className="flex flex-col gap-1 text-xs font-semibold">Item name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">Description<textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl border border-line p-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">{isRestaurant ? 'Price (₹)' : 'Selling price (₹)'}<input required type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label><label className="flex flex-col gap-1 text-xs font-semibold">{isRestaurant ? 'Available stock' : 'Available stock'}<input required type="number" min="0" step="1" value={stock} onChange={e => setStock(e.target.value)} className="h-11 rounded-xl border border-line px-3 text-sm" /></label>{!isRestaurant && <label className="flex flex-col gap-1 text-xs font-semibold">Pack / unit<input value={unit} onChange={e => setUnit(e.target.value)} placeholder="500 g, 1 pack" className="h-11 rounded-xl border border-line px-3 text-sm" /></label>}
      {isRestaurant && <label className="flex items-center gap-3 rounded-xl bg-cream p-3 text-sm font-semibold"><input type="checkbox" checked={vegetarian} onChange={e => setVegetarian(e.target.checked)} />Vegetarian</label>}
      <label className="flex flex-col gap-1 text-xs font-semibold">Variants (comma separated)<input value={variants} onChange={e => setVariants(e.target.value)} placeholder="Small, Large" className="h-11 rounded-xl border border-line px-3 text-sm" /></label>{isRestaurant && <label className="flex flex-col gap-1 text-xs font-semibold">Optional add-ons (comma separated)<input value={addons} onChange={e => setAddons(e.target.value)} placeholder="Extra cheese, Dip" className="h-11 rounded-xl border border-line px-3 text-sm" /></label>}
      <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">Product images<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => void uploadImage(e.target.files?.[0])} className="mt-2 text-xs" /><span className="text-[11px] font-normal text-muted-ink">Upload images up to 5 MB each. {images.length} attached.</span></label><button disabled={busy || !typeOptions.length} className="h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy ? 'Saving…' : `Add ${isRestaurant ? 'menu item' : 'product'}`}</button>
    </form>
    <section className="mt-8"><h2 className="text-lg font-bold">Your listings <span className="text-sm font-normal text-muted-ink">({myItems.length})</span></h2><div className="mt-3 flex flex-col gap-3">{myItems.map(item => <article key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">{item.images[0] ? <img src={item.images[0]} alt="" className="size-14 rounded-xl object-cover" /> : <div className="grid size-14 place-items-center rounded-xl bg-peach text-brand-deep">{isRestaurant ? <Utensils /> : <Store />}</div>}<div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p className="text-xs text-muted-ink">{categories.find(c => c.id === item.category_id)?.name ?? 'Category'} · ₹{Number(item.price).toFixed(2)} · stock {item.stock}</p><p className="text-xs text-muted-ink">{isRestaurant ? item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian' : item.unit || 'Retail item'} · {item.is_available ? 'Available' : 'Unavailable'}</p></div><button onClick={() => void toggleAvailability(item)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Mark {item.is_available ? 'unavailable' : 'available'}</button></article>)}</div>{error && <p role="alert" className="mt-3 text-sm text-red-800">Listings could not be loaded: {error.message}</p>}</section>
  </main>
}

export function GeneralCategoryBrowse() {
  const { data: categories = [], error: categoryError } = useSWR('catalog-categories', categoryFetcher)
  const { data: items = [], error: itemError } = useSWR('catalog-products', itemFetcher)
  const general = categories.filter(category => category.scope === 'general' && category.is_active && category.is_visible)
  const [active, setActive] = useState('')
  const selected = active || general[0]?.id
  const visible = items.filter(item => item.product_type === 'retail' && item.is_available && item.category_id === selected)
  const categoryName = general.find(category => category.id === selected)?.name
  return <main className="mx-auto min-h-svh max-w-5xl bg-cream px-4 py-8 text-ink sm:px-8"><header><a href="/" className="text-sm font-semibold text-brand-deep">← LazyHand</a><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-deep">Neighborhood stores</p><h1 className="mt-2 text-3xl font-bold">Browse categories</h1><p className="mt-2 text-sm text-muted-ink">Current categories and available products are loaded from the catalog.</p></header>
    {categoryError || itemError ? <div className="mt-6"><Notice error>Store categories are temporarily unavailable. Please try again.</Notice></div> : null}
    <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{general.map(category => <button key={category.id} onClick={() => setActive(category.id)} aria-pressed={selected === category.id} className={`flex min-h-20 items-center gap-3 rounded-3xl border p-3.5 text-left text-sm font-semibold shadow-[0_5px_18px_-14px_#6B4A34] transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${selected === category.id ? 'border-brand bg-peach text-brand-deep' : 'border-line/90 bg-white'}`}>{category.image_url ? <img src={category.image_url} alt="" className="size-10 rounded-lg object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cream text-xs font-bold">{category.icon?.slice(0, 2).toUpperCase() || 'LH'}</span>}{category.name}</button>)}</div>
    <section className="mt-6"><h2 className="text-xl font-bold">{categoryName ?? 'Store products'}</h2>{visible.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map(item => <article key={item.id} className="flex gap-3 rounded-2xl border border-line bg-white p-3">{item.images[0] ? <img src={item.images[0]} alt={item.name} className="size-20 rounded-xl object-cover" /> : <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-peach text-brand-deep"><Store /></div>}<div className="min-w-0"><h3 className="truncate font-semibold">{item.name}</h3><p className="mt-1 line-clamp-2 text-xs text-muted-ink">{item.description || item.unit}</p><p className="mt-2 font-bold">₹{Number(item.price).toFixed(2)}</p></div></article>)}</div> : <p className="mt-3 rounded-2xl border border-dashed border-line bg-white p-7 text-center text-sm text-muted-ink">No products are listed in this category yet.</p>}</section>
  </main>
}

export function RestaurantBrowse() {
  const { data: categories = [], error: categoryError } = useSWR('catalog-categories', categoryFetcher)
  const { data: items = [], error: itemError } = useSWR('catalog-products', itemFetcher)
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
