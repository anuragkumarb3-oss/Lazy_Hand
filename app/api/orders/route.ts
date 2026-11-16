import { NextResponse } from 'next/server'
import { billFor, DELIVERY_SLABS, seedProducts, seedShops, type Order, type OrderLine } from '@/components/lazyhand/data'
import { createClient } from '@/lib/supabase/server'

type OrderRow = {
  id: string
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

export async function GET() {
  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return NextResponse.json({ error: 'Sign in to view your orders.' }, { status: 401 })

  const { data, error } = await supabase
    .from('orders')
    .select('id, shop_id, lines, item_total, delivery_fee, platform_fee, delivery_distance_km, rider_payout, seller_delivery_deduction, seller_payout, total, payment, status, customer_name, address, rider_name, placed_at')
    .eq('user_id', user.id)
    .order('placed_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Orders could not be loaded.' }, { status: 500 })
  return NextResponse.json({ orders: (data as OrderRow[]).map(toOrder) })
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedClient()
  if (!user) return NextResponse.json({ error: 'Sign in before placing an order.' }, { status: 401 })

  let body: { shopId?: unknown; lines?: unknown; deliveryDistanceKm?: unknown; address?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'The order details are invalid.' }, { status: 400 })
  }

  const shopId = typeof body.shopId === 'string' ? body.shopId : ''
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const deliveryDistanceKm = Number(body.deliveryDistanceKm)
  const shop = seedShops.find(item => item.id === shopId)
  const acceptedDistances = DELIVERY_SLABS.map(slab => slab.maxDistanceKm)

  if (!shop || !shop.open) return NextResponse.json({ error: 'This shop is not accepting orders right now.' }, { status: 409 })
  if (address.length < 3 || address.length > 500) return NextResponse.json({ error: 'Add a valid delivery address.' }, { status: 400 })
  if (!acceptedDistances.some(distance => distance === deliveryDistanceKm)) {
    return NextResponse.json({ error: 'Choose a valid delivery distance.' }, { status: 400 })
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > seedProducts.length) {
    return NextResponse.json({ error: 'Add at least one available item.' }, { status: 400 })
  }

  const quantities = new Map<string, number>()
  for (const rawLine of body.lines) {
    if (!rawLine || typeof rawLine !== 'object') return NextResponse.json({ error: 'The order items are invalid.' }, { status: 400 })
    const line = rawLine as { productId?: unknown; qty?: unknown }
    if (typeof line.productId !== 'string' || typeof line.qty !== 'number' || !Number.isInteger(line.qty) || line.qty <= 0) {
      return NextResponse.json({ error: 'The order items are invalid.' }, { status: 400 })
    }
    const nextQty = (quantities.get(line.productId) ?? 0) + Number(line.qty)
    if (nextQty > 20) return NextResponse.json({ error: 'The quantity limit is 20 per item.' }, { status: 400 })
    quantities.set(line.productId, nextQty)
  }

  const lines: OrderLine[] = []
  for (const [productId, qty] of quantities) {
    const product = seedProducts.find(item => item.id === productId && item.shopId === shopId)
    if (!product || !product.inStock) return NextResponse.json({ error: 'An item is unavailable. Refresh and try again.' }, { status: 409 })
    lines.push({ productId: product.id, name: product.name, price: product.price, qty })
  }

  const itemTotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0)
  const bill = billFor(itemTotal, deliveryDistanceKm)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) return NextResponse.json({ error: 'Complete your profile before placing an order.' }, { status: 409 })

  const id = `LH${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
  const { data, error } = await supabase
    .from('orders')
    .insert({
      id,
      user_id: user.id,
      shop_id: shopId,
      lines,
      item_total: bill.itemTotal,
      delivery_fee: bill.deliveryFee,
      platform_fee: bill.platformFee,
      delivery_distance_km: bill.deliveryDistanceKm,
      rider_payout: bill.riderPayout,
      seller_delivery_deduction: bill.sellerDeliveryDeduction,
      seller_payout: bill.sellerPayout,
      total: bill.total,
      payment: 'cod',
      status: 'placed',
      customer_name: profile.name,
      address,
    })
    .select('id, shop_id, lines, item_total, delivery_fee, platform_fee, delivery_distance_km, rider_payout, seller_delivery_deduction, seller_payout, total, payment, status, customer_name, address, rider_name, placed_at')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Your order could not be saved. Please try again.' }, { status: 500 })
  return NextResponse.json({ order: toOrder(data as OrderRow) }, { status: 201 })
}
