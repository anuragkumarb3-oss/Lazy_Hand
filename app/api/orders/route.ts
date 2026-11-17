import { NextResponse } from 'next/server'
import { billFor, DELIVERY_SLABS, seedProducts, seedShops, type Order, type OrderLine } from '@/components/lazyhand/data'
import { createClient } from '@/lib/supabase/server'

type OrderRow = {
  id: string
  checkout_id?: string
  shop_id: string
  lines: OrderLine[]
  item_total: number | string
  delivery_fee: number | string
  platform_fee: number | string
  delivery_distance_km: number | string
  rider_payout: number | string
  seller_delivery_deduction: number | string
  seller_payout: number | string
  total: number | string
  payment: 'cod'
  status: Order['status']
  customer_name: string
  address: string
  rider_name: string | null
  placed_at: string
}

function toOrder(row: OrderRow): Order {
  const placedDate = new Date(row.placed_at)
  const isToday = placedDate.toDateString() === new Date().toDateString()

  return {
    id: row.id,
    shopId: row.shop_id,
    lines: row.lines,
    itemTotal: Number(row.item_total),
    deliveryFee: Number(row.delivery_fee),
    platformFee: Number(row.platform_fee),
    deliveryDistanceKm: Number(row.delivery_distance_km),
    riderPayout: Number(row.rider_payout),
    sellerDeliveryDeduction: Number(row.seller_delivery_deduction),
    sellerPayout: Number(row.seller_payout),
    total: Number(row.total),
    multiStoreSurcharge: Math.max(0, Number(row.total) - Number(row.item_total) - Number(row.delivery_fee) - Number(row.platform_fee)),
    payment: row.payment,
    status: row.status,
    placedAt: isToday ? 'Today' : placedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    customerName: row.customer_name,
    address: row.address,
    riderName: row.rider_name ?? undefined,
  }
}

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return NextResponse.json({ error: 'Sign in to view your orders.' }, { status: 401 })

  const { data, error } = await supabase
    .from('orders')
    .select('id, checkout_id, shop_id, lines, item_total, delivery_fee, platform_fee, delivery_distance_km, rider_payout, seller_delivery_deduction, seller_payout, total, payment, status, customer_name, address, rider_name, placed_at')
    .eq('user_id', user.id)
    .order('placed_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Orders could not be loaded.' }, { status: 500 })
  return NextResponse.json(
    { orders: (data as OrderRow[]).map(toOrder) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin order requests are not allowed.' }, { status: 403 })
  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return NextResponse.json({ error: 'Sign in before placing an order.' }, { status: 401 })

  let body: { stores?: unknown; deliveryDistanceKm?: unknown; address?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'The order details are invalid.' }, { status: 400 }) }

  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const deliveryDistanceKm = Number(body.deliveryDistanceKm)
  const acceptedDistances = DELIVERY_SLABS.map(slab => slab.maxDistanceKm)
  if (address.length < 3 || address.length > 500) return NextResponse.json({ error: 'Add a valid delivery address.' }, { status: 400 })
  if (!acceptedDistances.some(distance => distance === deliveryDistanceKm)) return NextResponse.json({ error: 'Choose a valid delivery distance.' }, { status: 400 })
  if (!Array.isArray(body.stores) || !body.stores.length || body.stores.length > 10) return NextResponse.json({ error: 'Add items from at least one available store.' }, { status: 400 })

  const storeIds = new Set<string>()
  const normalizedStores: { shopId: string; lines: OrderLine[]; itemTotal: number }[] = []
  for (const rawStore of body.stores) {
    if (!rawStore || typeof rawStore !== 'object') return NextResponse.json({ error: 'The store selection is invalid.' }, { status: 400 })
    const store = rawStore as { shopId?: unknown; lines?: unknown }
    const shopId = typeof store.shopId === 'string' ? store.shopId : ''
    const seededShop = seedShops.find(item => item.id === shopId)
    if ((!seededShop && !/^[0-9a-f-]{36}$/i.test(shopId)) || seededShop && !seededShop.open || storeIds.has(shopId)) return NextResponse.json({ error: 'A selected store is unavailable or duplicated.' }, { status: 409 })
    storeIds.add(shopId)
    if (!Array.isArray(store.lines) || store.lines.length === 0 || store.lines.length > 100) return NextResponse.json({ error: 'Add at least one available item per store.' }, { status: 400 })

    const quantities = new Map<string, number>()
    for (const rawLine of store.lines) {
      if (!rawLine || typeof rawLine !== 'object') return NextResponse.json({ error: 'The order items are invalid.' }, { status: 400 })
      const line = rawLine as { productId?: unknown; qty?: unknown }
      if (typeof line.productId !== 'string' || typeof line.qty !== 'number' || !Number.isInteger(line.qty) || line.qty <= 0) return NextResponse.json({ error: 'The order items are invalid.' }, { status: 400 })
      const nextQty = (quantities.get(line.productId) ?? 0) + line.qty
      if (nextQty > 20) return NextResponse.json({ error: 'The quantity limit is 20 per item.' }, { status: 400 })
      quantities.set(line.productId, nextQty)
    }

    const lines: OrderLine[] = []
    if (seededShop) {
      for (const [productId, qty] of quantities) {
        const product = seedProducts.find(item => item.id === productId && item.shopId === shopId)
        if (!product || !product.inStock) return NextResponse.json({ error: 'An item is unavailable. Refresh and try again.' }, { status: 409 })
        lines.push({ productId: product.id, name: product.name, price: product.price, qty })
      }
    } else {
      const { data: catalogProducts, error: catalogError } = await supabase.from('catalog_products').select('id,owner_id,name,price,stock,is_available').in('id', Array.from(quantities.keys())).eq('owner_id', shopId).eq('is_available', true).gt('stock', 0)
      if (catalogError) return NextResponse.json({ error: 'Catalog items could not be verified.' }, { status: 500 })
      const verifiedProducts = new Map((catalogProducts ?? []).map(product => [product.id, product]))
      for (const [productId, qty] of quantities) {
        const product = verifiedProducts.get(productId)
        if (!product || product.stock < qty) return NextResponse.json({ error: 'An item is unavailable. Refresh and try again.' }, { status: 409 })
        lines.push({ productId: product.id, name: product.name, price: Number(product.price), qty })
      }
    }
    normalizedStores.push({ shopId, lines, itemTotal: lines.reduce((sum, line) => sum + line.price * line.qty, 0) })
  }

  const multiStore = normalizedStores.length > 1
  const checkoutTotal = normalizedStores.reduce((sum, group) => sum + group.itemTotal, 0) + (multiStore ? 39 : 0)
  if (checkoutTotal > 499) return NextResponse.json({ error: 'Cash-on-delivery orders are limited to ₹499. Reduce your cart or choose another payment method when available.' }, { status: 400 })
  const { data: profile, error: profileError } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
  if (profileError || !profile) return NextResponse.json({ error: 'Complete your profile before placing an order.' }, { status: 409 })

  const checkoutId = crypto.randomUUID()
  const rows = normalizedStores.map((group, index) => {
    const bill = billFor(group.itemTotal, deliveryDistanceKm, false, { multiStore })
    const surcharge = multiStore && index === 0 ? 39 : 0
    return {
      id: `LH${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
      checkout_id: checkoutId,
      user_id: user.id,
      shop_id: group.shopId,
      lines: group.lines,
      item_total: bill.itemTotal,
      delivery_fee: bill.deliveryFee,
      platform_fee: bill.platformFee,
      delivery_distance_km: bill.deliveryDistanceKm,
      rider_payout: bill.riderPayout,
      seller_delivery_deduction: bill.sellerDeliveryDeduction,
      seller_payout: bill.sellerPayout,
      total: bill.total + surcharge,
      payment: 'cod',
      status: 'placed',
      customer_name: profile.name,
      address,
    }
  })
  const { data, error } = await supabase.from('orders').insert(rows).select('id, checkout_id, shop_id, lines, item_total, delivery_fee, platform_fee, delivery_distance_km, rider_payout, seller_delivery_deduction, seller_payout, total, payment, status, customer_name, address, rider_name, placed_at')
  if (error || !data) return NextResponse.json({ error: 'Your order could not be saved. Please try again.' }, { status: 500 })
  return NextResponse.json({ orders: (data as OrderRow[]).map(toOrder) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
}
