import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { adminHeaders, adminOrResponse, audit, number, positiveInt, sameOrigin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const stock = url.searchParams.get('stock') ?? ''
  const page = positiveInt(url.searchParams.get('page'), 1, 10_000)
  const limit = positiveInt(url.searchParams.get('limit'), 30, 100)

  const where: string[] = []
  const params: unknown[] = []
  if (q) {
    params.push(`%${q}%`)
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR s.shop_name ILIKE $${params.length})`)
  }
  if (stock === 'low') where.push('p.stock > 0 AND p.stock <= p.low_stock_threshold')
  if (stock === 'out') where.push('p.stock = 0')
  if (stock === 'unavailable') where.push('p.is_available = FALSE')
  params.push(limit, (page - 1) * limit)

  try {
    const [{ rows }, summary] = await Promise.all([
      pool.query(
        `SELECT p.id, p.name, p.brand, p.sku, p.unit, p.price, p.mrp, p.stock, p.low_stock_threshold,
                p.is_available, p.is_vegetarian, p.product_type, p.created_at, p.updated_at,
                p.buying_cost, p.additional_cost,
                c.name AS category_name, s.shop_name, s.id AS owner_id, s.phone AS owner_phone,
                count(*) OVER() AS total_count
         FROM catalog_products p
         LEFT JOIN catalog_categories c ON c.id = p.category_id
         LEFT JOIN profiles s ON s.id = p.owner_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY p.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      pool.query(`SELECT
          count(*) AS products,
          count(*) FILTER (WHERE stock = 0) AS out_of_stock,
          count(*) FILTER (WHERE stock > 0 AND stock <= low_stock_threshold) AS low_stock,
          count(*) FILTER (WHERE is_available = FALSE) AS unavailable,
          COALESCE(sum(price * stock), 0) AS stock_value
        FROM catalog_products`),
    ])

    const total = rows.length ? number(rows[0].total_count) : 0
    const s = summary.rows[0]
    return NextResponse.json({
      products: rows.map(row => ({
        id: row.id,
        name: row.name,
        brand: row.brand || null,
        sku: row.sku || null,
        unit: row.unit || null,
        price: number(row.price),
        mrp: row.mrp == null ? null : number(row.mrp),
        stock: row.stock,
        lowStockThreshold: row.low_stock_threshold,
        available: row.is_available,
        vegetarian: row.is_vegetarian,
        productType: row.product_type,
        categoryName: row.category_name ?? null,
        shopName: row.shop_name ?? null,
        ownerId: row.owner_id ?? null,
        ownerPhone: row.owner_phone ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      summary: {
        products: number(s.products),
        outOfStock: number(s.out_of_stock),
        lowStock: number(s.low_stock),
        unavailable: number(s.unavailable),
        stockValue: number(s.stock_value),
      },
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      generatedAt: new Date().toISOString(),
    }, { headers: adminHeaders })
  } catch (error) {
    console.error('[admin/catalog] Query failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Catalog could not be loaded.' }, { status: 500, headers: adminHeaders })
  }
}

export async function POST(request: Request) {
  const admin = await adminOrResponse()
  if (admin instanceof NextResponse) return admin
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403, headers: adminHeaders })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: adminHeaders })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'Product is required.' }, { status: 400, headers: adminHeaders })

  try {
    if (body.action === 'toggle-availability') {
      if (typeof body.available !== 'boolean') return NextResponse.json({ error: 'Availability is required.' }, { status: 400, headers: adminHeaders })
      const { rows } = await pool.query<{ name: string }>(
        `UPDATE catalog_products SET is_available = $2, updated_at = now() WHERE id = $1 RETURNING name`,
        [id, body.available],
      )
      if (!rows.length) return NextResponse.json({ error: 'Product not found.' }, { status: 404, headers: adminHeaders })
      await audit(admin.phone, 'product.availability', id, { name: rows[0].name, available: body.available })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    if (body.action === 'set-stock') {
      if (!Number.isInteger(body.stock) || Number(body.stock) < 0 || Number(body.stock) > 1_000_000) {
        return NextResponse.json({ error: 'Enter a valid stock count.' }, { status: 400, headers: adminHeaders })
      }
      const { rows } = await pool.query<{ name: string }>(
        `UPDATE catalog_products SET stock = $2, updated_at = now() WHERE id = $1 RETURNING name`,
        [id, Number(body.stock)],
      )
      if (!rows.length) return NextResponse.json({ error: 'Product not found.' }, { status: 404, headers: adminHeaders })
      await audit(admin.phone, 'product.stock', id, { name: rows[0].name, stock: Number(body.stock) })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    if (body.action === 'delete') {
      const { rows } = await pool.query<{ name: string; owner_id: string }>(
        'DELETE FROM catalog_products WHERE id = $1 RETURNING name, owner_id',
        [id],
      )
      if (!rows.length) return NextResponse.json({ error: 'Product not found.' }, { status: 404, headers: adminHeaders })
      await audit(admin.phone, 'product.delete', id, { name: rows[0].name, ownerId: rows[0].owner_id })
      return NextResponse.json({ ok: true }, { headers: adminHeaders })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: adminHeaders })
  } catch (error) {
    console.error('[admin/catalog] Action failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'The action could not be completed.' }, { status: 500, headers: adminHeaders })
  }
}
