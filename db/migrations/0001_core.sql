CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  phone TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'shopkeeper', 'rider')),
  whatsapp_number TEXT NOT NULL DEFAULT '',
  whatsapp_alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  village TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  shop_name TEXT NOT NULL DEFAULT '',
  shop_type TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  scope TEXT NOT NULL CHECK (scope IN ('general', 'restaurant')),
  parent_id UUID REFERENCES catalog_categories(id) ON DELETE RESTRICT,
  business_types TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX catalog_categories_listing_idx ON catalog_categories(scope, is_active, is_visible, display_order, name);

CREATE TABLE catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  category_id UUID NOT NULL REFERENCES catalog_categories(id) ON DELETE RESTRICT,
  product_type TEXT NOT NULL CHECK (product_type IN ('retail', 'restaurant')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  images JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images) = 'array'),
  variants JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variants) = 'array'),
  is_vegetarian BOOLEAN,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  addons JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(addons) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX catalog_products_owner_idx ON catalog_products(owner_id, created_at DESC);
CREATE INDEX catalog_products_available_idx ON catalog_products(is_available, category_id);

CREATE TABLE seller_applications (
  user_id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE legal_policy_acceptances (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'shopkeeper', 'rider')),
  policy_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, policy_key, policy_version)
);

CREATE TABLE shop_operating_hours (
  user_id UUID NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at TIME,
  closes_at TIME,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, day_of_week),
  CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL))
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  checkout_id UUID NOT NULL,
  user_id UUID NOT NULL,
  shop_id UUID NOT NULL,
  lines JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  item_total NUMERIC(12,2) NOT NULL CHECK (item_total >= 0),
  delivery_fee NUMERIC(12,2) NOT NULL CHECK (delivery_fee >= 0),
  platform_fee NUMERIC(12,2) NOT NULL CHECK (platform_fee >= 0),
  delivery_distance_km NUMERIC(5,2) NOT NULL CHECK (delivery_distance_km > 0),
  rider_payout NUMERIC(12,2) NOT NULL CHECK (rider_payout >= 0),
  seller_delivery_deduction NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (seller_delivery_deduction >= 0),
  seller_payout NUMERIC(12,2) NOT NULL CHECK (seller_payout >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  payment TEXT NOT NULL DEFAULT 'cod' CHECK (payment IN ('cod')),
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'accepted', 'ready', 'picked', 'delivered', 'rejected')),
  customer_name TEXT NOT NULL,
  address TEXT NOT NULL,
  rider_name TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_recent_idx ON orders(user_id, placed_at DESC);
CREATE INDEX orders_checkout_idx ON orders(checkout_id);
CREATE INDEX orders_shop_recent_idx ON orders(shop_id, placed_at DESC);

CREATE TABLE db_migration_source_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  note TEXT NOT NULL
);
INSERT INTO db_migration_source_guard (id, note)
VALUES (1, 'Fresh schema only. Existing VPS data must be backed up and reconciled before applying.')
ON CONFLICT (id) DO NOTHING;
