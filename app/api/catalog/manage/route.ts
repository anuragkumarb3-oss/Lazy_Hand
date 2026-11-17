import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function currentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error ? null : user
}

async function identity(userId: string) {
  const { rows } = await pool.query('SELECT role, shop_type FROM profiles WHERE id = $1', [userId])
  return rows[0] as { role: string; shop_type: string } | undefined
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  try { return Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin } catch { return false }
}

function admin(user: { app_metadata?: Record<string, unknown> }) {
  return user.app_metadata?.role === 'admin'
}

export async function GET(request: Request) {
  const user = await currentUser()
  const isAdmin = Boolean(user && admin(user))
  const role = user ? await identity(user.id) : undefined
  const view = new URL(request.url).searchParams.get('view')
  if (view === 'seller' && (!user || role?.role !== 'shopkeeper')) return NextResponse.json({ error: 'Seller access required.' }, { status: 403 })
  if (view === 'admin' && !isAdmin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })

  const categoryPredicate = isAdmin ? '' : 'WHERE is_active = TRUE AND is_visible = TRUE'
  const { rows: categories } = await pool.query(
    `SELECT id, name, scope, parent_id, business_types, is_active, is_visible,
            display_order, image_url, icon
     FROM catalog_categories ${categoryPredicate} ORDER BY display_order, name`,
  )

  if (view === 'admin') {
    const [{ rows: products }, { rows: applications }] = await Promise.all([
      pool.query(`SELECT id, owner_id, category_id, product_type, name, description, unit,
        price, stock, images, variants, is_vegetarian, is_available, addons
        FROM catalog_products ORDER BY created_at DESC`),
      pool.query(`SELECT a.user_id, a.status, a.requested_at,
        p.name, p.phone, p.shop_name FROM seller_applications a
        LEFT JOIN profiles p ON p.id = a.user_id
        WHERE a.status = 'pending' ORDER BY a.requested_at`),
    ])
    const sellerApplications = applications.map(({ name, phone, shop_name, ...application }) => ({
      ...application,
      profile: { name: name ?? null, phone: phone ?? null, shop_name: shop_name ?? null },
    }))
    return NextResponse.json({ categories, products, applications: sellerApplications }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  if (view === 'seller') {
    const { rows: products } = await pool.query(
      `SELECT id, owner_id, category_id, product_type, name, description, unit,
              price, stock, images, variants, is_vegetarian, is_available, addons
       FROM catalog_products WHERE owner_id = $1 ORDER BY created_at DESC`, [user!.id],
    )
    return NextResponse.json({ categories, products }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  return NextResponse.json({ categories }, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } })
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 })
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  const isAdmin = admin(user)
  const profile = isAdmin ? undefined : await identity(user.id)
  const action = body.action

  if (action === 'save-category') {
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    const { id, name, scope, parent_id, business_types, is_active, is_visible, display_order, image_url, icon } = body
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80 || !['general', 'restaurant'].includes(String(scope)) || !Array.isArray(business_types) || business_types.some(type => typeof type !== 'string') || typeof is_active !== 'boolean' || typeof is_visible !== 'boolean' || !Number.isInteger(display_order)) return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
    const params = [name.trim(), scope, parent_id || null, business_types, is_active, is_visible, display_order, typeof image_url === 'string' ? image_url : null, typeof icon === 'string' ? icon : null]
    if (typeof id === 'string' && id) {
      const result = await pool.query(`UPDATE catalog_categories SET name=$1, scope=$2, parent_id=$3, business_types=$4, is_active=$5, is_visible=$6, display_order=$7, image_url=$8, icon=$9 WHERE id=$10`, [...params, id])
      if (!result.rowCount) return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
    } else {
      await pool.query(`INSERT INTO catalog_categories(name,scope,parent_id,business_types,is_active,is_visible,display_order,image_url,icon) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, params)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete-category') {
    if (!isAdmin || typeof body.id !== 'string') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    try {
      const result = await pool.query('DELETE FROM catalog_categories WHERE id = $1', [body.id])
      return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Category not found.' }, { status: 404 })
    } catch {
      return NextResponse.json({ error: 'Categories used by products or subcategories cannot be deleted; deactivate them instead.' }, { status: 409 })
    }
  }

  if (action === 'reorder-category') {
    if (!isAdmin || typeof body.id !== 'string' || typeof body.targetId !== 'string') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('SELECT id, scope, display_order FROM catalog_categories WHERE id = ANY($1::uuid[]) FOR UPDATE', [[body.id, body.targetId]])
      if (rows.length !== 2 || rows[0].scope !== rows[1].scope) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Category order could not be changed.' }, { status: 409 }) }
      const first = rows.find(row => row.id === body.id)
      const second = rows.find(row => row.id === body.targetId)
      await client.query('UPDATE catalog_categories SET display_order=$1 WHERE id=$2', [second.display_order, first.id])
      await client.query('UPDATE catalog_categories SET display_order=$1 WHERE id=$2', [first.display_order, second.id])
      await client.query('COMMIT')
      return NextResponse.json({ ok: true })
    } catch {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Category order could not be changed.' }, { status: 500 })
    } finally { client.release() }
  }

  if (action === 'review-seller') {
    if (!isAdmin || typeof body.userId !== 'string' || typeof body.approve !== 'boolean') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rowCount } = await client.query(`UPDATE seller_applications SET status=$1, reviewed_at=now(), reviewed_by=$2 WHERE user_id=$3 AND status='pending'`, [body.approve ? 'approved' : 'rejected', user.id, body.userId])
      if (!rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Pending seller request not found.' }, { status: 404 }) }
      if (body.approve) {
        const businessType = typeof body.businessType === 'string' && /^[a-z-]{1,40}$/.test(body.businessType) ? body.businessType : 'grocery'
        const profileUpdate = await client.query(`UPDATE profiles SET role='shopkeeper', shop_type=$1, updated_at=now() WHERE id=$2`, [businessType, body.userId])
        if (!profileUpdate.rowCount) throw new Error('Seller profile not found')
      }
      await client.query('COMMIT')
      return NextResponse.json({ ok: true })
    } catch {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Seller request could not be reviewed.' }, { status: 500 })
    } finally { client.release() }
  }

  if (action === 'save-product') {
    if (profile?.role !== 'shopkeeper') return NextResponse.json({ error: 'Seller access required.' }, { status: 403 })
    const { id, category_id, product_type, name, description, unit, price, stock, images, variants, is_vegetarian, is_available, addons } = body
    const businessType = profile.shop_type.toLowerCase()
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || !['retail', 'restaurant'].includes(String(product_type)) || !Number.isFinite(price) || Number(price) <= 0 || !Number.isInteger(stock) || Number(stock) < 0 || !Array.isArray(images) || !Array.isArray(variants) || !Array.isArray(addons)) return NextResponse.json({ error: 'Invalid product.' }, { status: 400 })
    const { rows: categories } = await pool.query(`SELECT scope, business_types, is_active FROM catalog_categories WHERE id=$1`, [category_id])
    const category = categories[0]
    if (!category || !category.is_active || (category.business_types.length && !category.business_types.includes(businessType)) || category.scope !== (product_type === 'restaurant' ? 'restaurant' : 'general')) return NextResponse.json({ error: 'This category is not available to your business.' }, { status: 409 })
    const values = [user.id, category_id, product_type, name.trim(), String(description ?? '').slice(0, 2000), String(unit ?? '').slice(0, 60), price, stock, JSON.stringify(images), JSON.stringify(variants), typeof is_vegetarian === 'boolean' ? is_vegetarian : null, Boolean(is_available) && Number(stock) > 0, JSON.stringify(addons)]
    if (typeof id === 'string' && id) {
      const result = await pool.query(`UPDATE catalog_products SET category_id=$2, product_type=$3, name=$4, description=$5, unit=$6, price=$7, stock=$8, images=$9::jsonb, variants=$10::jsonb, is_vegetarian=$11, is_available=$12, addons=$13::jsonb, updated_at=now() WHERE owner_id=$1 AND id=$14`, [...values, id])
      if (!result.rowCount) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    } else {
      await pool.query(`INSERT INTO catalog_products(owner_id,category_id,product_type,name,description,unit,price,stock,images,variants,is_vegetarian,is_available,addons) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb)`, values)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'toggle-product') {
    if (profile?.role !== 'shopkeeper' || typeof body.id !== 'string' || typeof body.isAvailable !== 'boolean') return NextResponse.json({ error: 'Seller access required.' }, { status: 403 })
    const result = await pool.query(`UPDATE catalog_products SET is_available=$1 AND stock > 0, updated_at=now() WHERE id=$2 AND owner_id=$3`, [body.isAvailable, body.id, user.id])
    if (!result.rowCount) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown catalog action.' }, { status: 400 })
}
