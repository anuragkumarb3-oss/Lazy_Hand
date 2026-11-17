import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { shopAvailability, type ShopHour } from '@/lib/shop-status'

export const dynamic = 'force-dynamic'

const demoProductByCategory: Record<string, { name: string; unit: string; price: number; image?: string }> = {
  'Chips & Wafers': { name: 'Golden Crunch Potato Chips', unit: '100 g', price: 35, image: '/images/demo-potato-chips.png' },
  'Bhujia & Mixtures': { name: 'Classic Masala Bhujia', unit: '200 g', price: 55 },
  'Namkeen Snacks': { name: 'Roasted Masala Peanuts', unit: '150 g', price: 45 },
  Biscuits: { name: 'Butter Crunch Biscuits', unit: '250 g', price: 40 },
  'Soft Drinks & Beverages': { name: 'Sparkling Lemon Soda', unit: '300 ml', price: 30 },
  'Dairy Products': { name: 'Farm Fresh Milk', unit: '500 ml', price: 32, image: '/images/demo-fresh-milk.png' },
  Groceries: { name: 'Long-Grain Basmati Rice', unit: '1 kg', price: 145, image: '/images/demo-basmati-rice.png' },
  'Daily Essentials': { name: 'Gentle Hand Wash', unit: '250 ml', price: 75 },
  'Fruits & Vegetables': { name: 'Fresh Red Apples', unit: '500 g', price: 90 },
  'Ice Creams': { name: 'Belgian Chocolate Scoop', unit: '100 ml', price: 65 },
  'Household Products': { name: 'Lemon Dishwash Liquid', unit: '500 ml', price: 85 },
  Pizza: { name: 'Garden Fresh Margherita Pizza', unit: 'Regular', price: 199, image: '/images/demo-margherita-pizza.png' },
  'Burgers & Sandwiches': { name: 'Classic Veggie Burger', unit: '1 pc', price: 129 },
  'Junk Food': { name: 'Crispy Loaded Fries', unit: '1 portion', price: 99 },
  'Snacks & Starters': { name: 'Paneer Tikka Bites', unit: '6 pcs', price: 159 },
  'Main Course / Heavy Meals': { name: 'Paneer Butter Masala Meal', unit: '1 portion', price: 229 },
  'Biryani & Rice': { name: 'Hyderabadi Veg Biryani', unit: '1 portion', price: 189 },
  'Indian Food': { name: 'Dal Makhani with Rice', unit: '1 portion', price: 169 },
  'Chinese Food': { name: 'Veg Hakka Noodles', unit: '1 portion', price: 159 },
  Desserts: { name: 'Gulab Jamun', unit: '2 pcs', price: 69 },
  'Drinks & Beverages': { name: 'Mango Lassi', unit: '300 ml', price: 79 },
}

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
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

  const demoProducts = process.env.NODE_ENV !== 'production' && (profiles ?? []).length === 0
    ? (categories ?? []).flatMap(category => {
        const sample = demoProductByCategory[category.name]
        if (!sample) return []
        const restaurant = category.scope === 'restaurant'
        return [{
          id: `demo-${category.id}`,
          owner_id: 'demo-preview-shop',
          category_id: category.id,
          product_type: restaurant ? 'restaurant' : 'retail',
          name: sample.name,
          description: 'Illustrative sample listing for the LazyHand preview.',
          unit: sample.unit,
          price: sample.price,
          stock: 25,
          images: sample.image ? [sample.image] : [],
          variants: [],
          is_vegetarian: restaurant ? true : null,
          is_available: true,
          addons: [],
          created_at: new Date(0).toISOString(),
          demo_only: true,
          shop_name: 'LazyHand Preview Store',
          shop_open: true,
          shop_opens_at: null,
          delivery_estimate_min: 20,
          delivery_estimate_max: 30,
          shop_timezone: 'Asia/Kolkata',
        }]
      })
    : []

  return NextResponse.json({ categories: categories ?? [], products: [...liveProducts, ...demoProducts] }, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  })
}
