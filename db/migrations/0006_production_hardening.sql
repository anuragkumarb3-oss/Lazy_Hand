-- Production hardening: integrity, operational tables, admin allow-list, WhatsApp state.
-- The migration runner wraps this file in a transaction; do not add BEGIN/COMMIT here.

-- ---------------------------------------------------------------------------
-- 1. Referential integrity for tables created before foreign keys existed.
--    NOT VALID keeps the lock short; VALIDATE then enforces on existing rows.
-- ---------------------------------------------------------------------------
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_owner_fk
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE orders
  ADD CONSTRAINT orders_user_fk
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE orders
  ADD CONSTRAINT orders_shop_fk
  FOREIGN KEY (shop_id) REFERENCES profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE orders
  ADD CONSTRAINT orders_checkout_fk
  FOREIGN KEY (checkout_id) REFERENCES checkout_idempotency(checkout_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE seller_applications
  ADD CONSTRAINT seller_applications_user_fk
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE legal_policy_acceptances
  ADD CONSTRAINT legal_policy_acceptances_user_fk
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE checkout_idempotency
  ADD CONSTRAINT checkout_idempotency_user_fk
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE catalog_products VALIDATE CONSTRAINT catalog_products_owner_fk;
ALTER TABLE orders VALIDATE CONSTRAINT orders_user_fk;
ALTER TABLE orders VALIDATE CONSTRAINT orders_shop_fk;
ALTER TABLE orders VALIDATE CONSTRAINT orders_checkout_fk;
ALTER TABLE seller_applications VALIDATE CONSTRAINT seller_applications_user_fk;
ALTER TABLE legal_policy_acceptances VALIDATE CONSTRAINT legal_policy_acceptances_user_fk;
ALTER TABLE checkout_idempotency VALIDATE CONSTRAINT checkout_idempotency_user_fk;

-- ---------------------------------------------------------------------------
-- 2. Order lifecycle: rider assignment, timestamps, cancellation.
-- ---------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN rider_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN assigned_at TIMESTAMPTZ,
  ADD COLUMN delivered_at TIMESTAMPTZ,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('placed', 'accepted', 'ready', 'picked', 'delivered', 'rejected', 'cancelled'));

CREATE INDEX orders_status_placed_idx ON orders(status, placed_at DESC);
CREATE INDEX orders_rider_idx ON orders(rider_id, status) WHERE rider_id IS NOT NULL;
CREATE INDEX profiles_shopkeepers_village_idx ON profiles(village) WHERE role = 'shopkeeper';

-- ---------------------------------------------------------------------------
-- 3. Admin allow-list. Server checks this in addition to Supabase app_metadata.
-- ---------------------------------------------------------------------------
CREATE TABLE admins (
  phone TEXT PRIMARY KEY CHECK (phone ~ '^[0-9]{10}$'),
  name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admins (phone, name) VALUES ('9798077838', 'LazyHand Admin')
ON CONFLICT (phone) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Customer addresses.
-- ---------------------------------------------------------------------------
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  line1 TEXT NOT NULL CHECK (length(trim(line1)) BETWEEN 3 AND 300),
  village TEXT NOT NULL DEFAULT '',
  landmark TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '' CHECK (pincode = '' OR pincode ~ '^[0-9]{6}$'),
  latitude NUMERIC(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses(user_id, created_at DESC);
CREATE UNIQUE INDEX addresses_one_default_idx ON addresses(user_id) WHERE is_default;

-- ---------------------------------------------------------------------------
-- 5. Append-only order status history.
-- ---------------------------------------------------------------------------
CREATE TABLE order_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_role IN ('customer', 'shopkeeper', 'rider', 'admin', 'system')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events(order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Payments (COD today; table allows online methods later).
-- ---------------------------------------------------------------------------
CREATE TABLE order_payments (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'cod' CHECK (method IN ('cod', 'upi', 'online')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'collected', 'failed', 'refunded')),
  provider_reference TEXT,
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_payments_status_idx ON order_payments(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Reviews.
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, user_id)
);
CREATE INDEX reviews_shop_idx ON reviews(shop_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. WhatsApp delivery log and bridge session state.
-- ---------------------------------------------------------------------------
CREATE TABLE whatsapp_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL CHECK (recipient ~ '^\+[1-9][0-9]{7,14}$'),
  kind TEXT NOT NULL CHECK (kind IN ('order_placed', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'system')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider TEXT NOT NULL DEFAULT 'baileys',
  provider_message_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX whatsapp_messages_status_idx ON whatsapp_messages(status, created_at);

CREATE TABLE whatsapp_session (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'pairing', 'connected')),
  phone TEXT,
  last_connected_at TIMESTAMPTZ,
  last_qr_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO whatsapp_session (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Admin audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_phone TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. updated_at triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER catalog_products_set_updated_at
BEFORE UPDATE ON catalog_products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER addresses_set_updated_at
BEFORE UPDATE ON addresses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER order_payments_set_updated_at
BEFORE UPDATE ON order_payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Least-privilege grants for the runtime role, when it exists.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lazyhand_app') THEN
    GRANT SELECT ON admins TO lazyhand_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON addresses TO lazyhand_app;
    GRANT SELECT, INSERT ON order_events TO lazyhand_app;
    GRANT USAGE, SELECT ON SEQUENCE order_events_id_seq TO lazyhand_app;
    GRANT SELECT, INSERT, UPDATE ON order_payments TO lazyhand_app;
    GRANT SELECT, INSERT ON reviews TO lazyhand_app;
    GRANT SELECT, INSERT, UPDATE ON whatsapp_messages TO lazyhand_app;
    GRANT USAGE, SELECT ON SEQUENCE whatsapp_messages_id_seq TO lazyhand_app;
    GRANT SELECT, INSERT, UPDATE ON whatsapp_session TO lazyhand_app;
    GRANT SELECT, INSERT ON audit_log TO lazyhand_app;
    GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO lazyhand_app;
  END IF;
END $$;
