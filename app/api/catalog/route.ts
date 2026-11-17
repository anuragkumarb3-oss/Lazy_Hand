import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'

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
              p.variants, p.is_vegetarian, p.is_available, p.addons
       FROM catalog_products p
       JOIN profiles s ON s.id = p.owner_id
       WHERE p.is_available = TRUE AND p.stock > 0
       ORDER BY p.created_at DESC`,
    ),
  ])
  return NextResponse.json({ categories, products }, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  })
}
