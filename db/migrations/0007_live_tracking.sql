-- Live delivery tracking: coordinates, route estimates and rider location pings.
-- Backward compatible: all order/profile columns are nullable.

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_longitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS drop_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS drop_longitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_distance_km NUMERIC(6, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_duration_minutes INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS order_locations (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m REAL CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  heading_deg REAL CHECK (heading_deg IS NULL OR (heading_deg >= 0 AND heading_deg <= 360)),
  speed_mps REAL CHECK (speed_mps IS NULL OR speed_mps >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_locations_rider_idx ON order_locations (rider_id);
CREATE INDEX IF NOT EXISTS order_locations_updated_idx ON order_locations (updated_at DESC);
CREATE INDEX IF NOT EXISTS orders_active_tracking_idx ON orders (status, rider_id) WHERE status IN ('accepted', 'ready', 'picked');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lazyhand_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON order_locations TO lazyhand_app;
  END IF;
END $$;

COMMIT;
