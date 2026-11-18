-- Admin console: account suspension, audit lookup indexes, and reporting indexes.
BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_placed_at_idx ON orders (placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_placed_idx ON orders (status, placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_rider_idx ON orders (rider_id, status);
CREATE INDEX IF NOT EXISTS orders_shop_placed_idx ON orders (shop_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_user_placed_idx ON orders (user_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS order_events_created_idx ON order_events (created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, created_at);

CREATE INDEX IF NOT EXISTS whatsapp_messages_created_idx ON whatsapp_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_status_idx ON whatsapp_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS catalog_products_owner_idx ON catalog_products (owner_id);
CREATE INDEX IF NOT EXISTS seller_applications_status_idx ON seller_applications (status, requested_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lazyhand_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON admins TO lazyhand_app;
    GRANT DELETE ON catalog_products TO lazyhand_app;
    GRANT UPDATE (is_suspended, suspended_at) ON profiles TO lazyhand_app;
    GRANT SELECT, INSERT ON audit_log TO lazyhand_app;
    GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO lazyhand_app;
  END IF;
END $$;

COMMIT;
