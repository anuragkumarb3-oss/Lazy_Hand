import { NextResponse } from 'next/server'
import { shopAvailability, type ShopHour } from '@/lib/shop-status'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const demoProductByCategory: Record<string, { name: string; unit: string; price: number; image?: string }> = {
  'Chips & Wafers': { name: 'Golden Crunch Potato Chips', unit: '100 g', price: 35, image: '/images/demo-potato-chips.png' },
  'Bhujia & Mixtures': { name: 'Classic Masala Bhujia', unit: '200 g', price: 55, image: '/images/demo-potato-chips.png' },
  'Namkeen Snacks': { name: 'Roasted Masala Peanuts', unit: '150 g', price: 45, image: '/images/demo-potato-chips.png' },
  Biscuits: { name: 'Butter Crunch Biscuits', unit: '250 g', price: 40, image: '/images/demo-butter-biscuits.png' },
  'Soft Drinks & Beverages': { name: 'Sparkling Lemon Soda', unit: '300 ml', price: 30, image: '/images/demo-lemon-soda.png' },
  'Dairy Products': { name: 'Farm Fresh Milk', unit: '500 ml', price: 32, image: '/images/demo-fresh-milk.png' },
  Groceries: { name: 'Long-Grain Basmati Rice', unit: '1 kg', price: 145, image: '/images/demo-basmati-rice.png' },
  'Daily Essentials': { name: 'Gentle Hand Wash', unit: '250 ml', price: 75, image: '/images/demo-handwash.png' },
  'Fruits & Vegetables': { name: 'Fresh Red Apples', unit: '500 g', price: 90, image: '/images/demo-fresh-apples.png' },
  'Ice Creams': { name: 'Belgian Chocolate Scoop', unit: '100 ml', price: 65, image: '/images/demo-chocolate-icecream.png' },
  'Household Products': { name: 'Lemon Dishwash Liquid', unit: '500 ml', price: 85, image: '/images/demo-dishwash.png' },
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

const demoDairyProducts = [
  { name: 'Farm Fresh Milk', unit: '500 ml', price: 32, image: '/images/demo-fresh-milk.png' },
  { name: 'Malai Paneer', unit: '200 g', price: 95, image: '/images/demo-dairy-paneer.svg' },
  { name: 'Fresh Curd', unit: '400 g', price: 45, image: '/images/demo-dairy-curd.svg' },
  { name: 'Creamery Butter', unit: '100 g', price: 60, image: '/images/demo-dairy-butter.svg' },
]

const demoGroceryProducts = [
  { name: 'Long-Grain Basmati Rice', unit: '1 kg', price: 145, image: '/images/demo-grocery-rice.png' },
  { name: 'Golden Toor Dal', unit: '1 kg', price: 165, image: '/images/demo-grocery-dal.png' },
  { name: 'Cold-Pressed Mustard Oil', unit: '1 L', price: 189, image: '/images/demo-grocery-oil.png' },
  { name: 'Raw Forest Honey', unit: '250 g', price: 129, image: '/images/demo-grocery-honey.png' },
]

type CategoryRow = {
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

type ShopRow = {
  id: string
  shop_name: string
  village: string
  shop_timezone: string
  shop_is_open_override: boolean | null
  delivery_estimate_min: number | null
  delivery_estimate_max: number | null
}

type ProductRow = {
  id: string
  owner_id: string
  category_id: string
  product_type: 'retail' | 'restaurant'
  name: string
  description: string
  unit: string
  price: string
  stock: number
  images: string[]
  variants: unknown[]
  is_vegetarian: boolean | null
  is_available: boolean
  addons: unknown[]
  created_at: Date
}

export async function GET(request: Request) {
  const requestedArea = new URL(request.url).searchParams.get('area')
  const locality = requestedArea === null ? null : requestedArea.split(',')[0].trim().toLocaleLowerCase()

  try {
    const [{ rows: categories }, { rows: profiles }] = await Promise.all([
      pool.query<CategoryRow>(
        `SELECT id, name, scope, parent_id, business_types, is_active, is_visible,
                display_order, image_url, icon
         FROM catalog_categories
         WHERE is_active = TRUE AND is_visible = TRUE
         ORDER BY display_order, name`,
      ),
      pool.query<ShopRow>(
        `SELECT id, shop_name, village, shop_timezone, shop_is_open_override,
                delivery_estimate_min, delivery_estimate_max
         FROM profiles
         WHERE role = 'shopkeeper'`,
      ),
    ])

    const shops = profiles.filter(profile =>
      locality === null || (locality !== '' && profile.village.trim().toLocaleLowerCase() === locality),
    )
    const shopIds = shops.map(shop => shop.id)

    const [{ rows: products }, { rows: hours }] = shopIds.length
      ? await Promise.all([
          pool.query<ProductRow>(
            `SELECT id, owner_id, category_id, product_type, name, description, unit,
                    price, stock, images, variants, is_vegetarian, is_available, addons, created_at
             FROM catalog_products
             WHERE owner_id = ANY($1::uuid[]) AND is_available = TRUE AND stock > 0
             ORDER BY created_at DESC`,
            [shopIds],
          ),
          pool.query<ShopHour & { user_id: string }>(
            `SELECT user_id, day_of_week, opens_at::text AS opens_at, closes_at::text AS closes_at, is_closed
             FROM shop_operating_hours
             WHERE user_id = ANY($1::uuid[])
             ORDER BY day_of_week`,
            [shopIds],
          ),
        ])
      : [{ rows: [] as ProductRow[] }, { rows: [] as (ShopHour & { user_id: string })[] }]

    const shopsById = new Map(shops.map(shop => [shop.id, shop]))
    const hoursByShop = new Map<string, ShopHour[]>()
    for (const hour of hours) {
      const weeklyHours = hoursByShop.get(hour.user_id) ?? []
      weeklyHours.push({
        day_of_week: hour.day_of_week,
        opens_at: hour.opens_at,
        closes_at: hour.closes_at,
        is_closed: hour.is_closed,
      })
      hoursByShop.set(hour.user_id, weeklyHours)
    }

    const liveProducts = products.map(product => {
      const shop = shopsById.get(product.owner_id)
      const status = shopAvailability(
        hoursByShop.get(product.owner_id) ?? [],
        shop?.shop_timezone ?? 'Asia/Kolkata',
        shop?.shop_is_open_override ?? null,
      )

      return {
        ...product,
        price: Number(product.price),
        shop_name: shop?.shop_name ?? '',
        shop_open: status.isOpen,
        shop_opens_at: status.nextOpening,
        delivery_estimate_min: shop?.delivery_estimate_min ?? null,
        delivery_estimate_max: shop?.delivery_estimate_max ?? null,
        shop_timezone: status.timeZone,
      }
    })

    const previewEnvironment = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview'
    const demoProducts = previewEnvironment && profiles.length === 0
      ? categories.flatMap(category => {
          const samples = category.name === 'Groceries'
            ? demoGroceryProducts
            : category.name === 'Dairy Products'
              ? demoDairyProducts
              : demoProductByCategory[category.name] ? [demoProductByCategory[category.name]] : []
          const restaurant = category.scope === 'restaurant'
          return samples.map((sample, index) => ({
            id: `demo-${category.id}-${index}`,
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
          }))
        })
      : []

    return NextResponse.json({ categories, products: [...liveProducts, ...demoProducts] }, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('[api/catalog] Catalog query failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Catalog could not be loaded.' }, { status: 503 })
  }
}
