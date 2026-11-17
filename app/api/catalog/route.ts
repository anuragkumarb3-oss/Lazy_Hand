import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { shopAvailability, type ShopHour } from '@/lib/shop-status'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export async function GET(request: Request) {
  const requestedArea = new URL(request.url).searchParams.get('area')
  const locality = requestedArea === null ? null : requestedArea.split(',')[0].trim().toLocaleLowerCase()
  const [{ data: categories, error: categoryError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase
      .from('catalog_categories')
      .select('id, name, scope, parent_id, business_types, is_active, is_visible, display_order, image_url, icon')
      .eq('is_active', true)
      .eq('is_visible', true)
      .order('display_order')
      .order('name'),
    supabase
      .from('profiles')
      .select('id, shop_name, village, shop_timezone, shop_open_override, delivery_estimate_min_minutes, delivery_estimate_max_minutes')
      .eq('role', 'shopkeeper'),
  ])

  if (categoryError || profileError) {
    console.error('[api/catalog] Catalog metadata query failed', categoryError?.message ?? profileError?.message)
    return NextResponse.json({ error: 'Catalog could not be loaded.' }, { status: 503 })
  }

  const shops = (profiles ?? []).filter(profile =>
    locality === null || (locality !== '' && profile.village.trim().toLocaleLowerCase() === locality),
  )
  const shopIds = shops.map(shop => shop.id)
  const [{ data: products, error: productError }, { data: hours, error: hoursError }] = shopIds.length
    ? await Promise.all([
        supabase
          .from('catalog_products')
          .select('id, owner_id, category_id, product_type, name, description, unit, price, stock, images, variants, is_vegetarian, is_available, addons, created_at')
          .in('owner_id', shopIds)
          .eq('is_available', true)
          .gt('stock', 0)
          .order('created_at', { ascending: false }),
        supabase
          .from('shop_operating_hours')
          .select('user_id, day_of_week, opens_at, closes_at, is_closed')
          .in('user_id', shopIds)
          .order('day_of_week'),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]

  if (productError || hoursError) {
    console.error('[api/catalog] Catalog listings query failed', productError?.message ?? hoursError?.message)
    return NextResponse.json({ error: 'Catalog could not be loaded.' }, { status: 503 })
  }

  const shopsById = new Map((shops ?? []).map(shop => [shop.id, shop]))
  const hoursByShop = new Map<string, ShopHour[]>()
  for (const hour of hours ?? []) {
    const weeklyHours = hoursByShop.get(hour.user_id) ?? []
    weeklyHours.push({
      day_of_week: hour.day_of_week,
      opens_at: hour.opens_at,
      closes_at: hour.closes_at,
      is_closed: hour.is_closed,
    })
    hoursByShop.set(hour.user_id, weeklyHours)
  }

  const liveProducts = (products ?? []).map(product => {
    const shop = shopsById.get(product.owner_id)
    const status = shopAvailability(
      hoursByShop.get(product.owner_id) ?? [],
      shop?.shop_timezone ?? 'Asia/Kolkata',
      shop?.shop_open_override ?? null,
    )

    return {
      ...product,
      shop_name: shop?.shop_name ?? '',
      shop_open: status.isOpen,
      shop_opens_at: status.nextOpening,
      delivery_estimate_min: shop?.delivery_estimate_min_minutes ?? null,
      delivery_estimate_max: shop?.delivery_estimate_max_minutes ?? null,
      shop_timezone: status.timeZone,
    }
  })

  return NextResponse.json({ categories: categories ?? [], products: liveProducts }, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  })
}
