import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { shopAvailability, type ShopHour } from '@/lib/shop-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [{ rows: categories }, { rows: products }] = await Promise.all([
    pool.query(
      `SELECT id, name, scope, parent_id, business_types, is_active, is_visible,
              display_order, image_url, icon
       FROM catalog_categories
       WHERE is_active = TRUE AND is_visible = TRUE
       ORDER BY display_order, name`,
    ),
    pool.query(
      `SELECT p.id, p.owner_id, s.shop_name, p.category_id, p.product_type,
              p.name, p.description, p.unit, p.price, p.stock, p.images,
              p.variants, p.is_vegetarian, p.is_available, p.addons,
              s.shop_timezone, s.shop_is_open_override,
              s.delivery_estimate_min, s.delivery_estimate_max,
              COALESCE(hours.weekly_hours, '[]'::json) AS weekly_hours
       FROM catalog_products p
       JOIN profiles s ON s.id = p.owner_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'day_of_week', h.day_of_week, 'opens_at', h.opens_at::text,
           'closes_at', h.closes_at::text, 'is_closed', h.is_closed
         ) ORDER BY h.day_of_week) AS weekly_hours
         FROM shop_operating_hours h WHERE h.user_id = s.id
       ) hours ON TRUE
       WHERE p.is_available = TRUE AND p.stock > 0
       ORDER BY p.created_at DESC`,
    ),
  ])
  const liveProducts = products.map(product => {
    const status = shopAvailability(
      product.weekly_hours as ShopHour[],
      product.shop_timezone,
      product.shop_is_open_override,
    )
    const { weekly_hours: _weeklyHours, shop_timezone: _timezone, shop_is_open_override: _override, ...publicProduct } = product
    return {
      ...publicProduct,
      shop_open: status.isOpen,
      shop_opens_at: status.nextOpening,
      delivery_estimate_min: product.delivery_estimate_min,
      delivery_estimate_max: product.delivery_estimate_max,
      shop_timezone: status.timeZone,
    }
  })
  return NextResponse.json({ categories, products: liveProducts }, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  })
}
