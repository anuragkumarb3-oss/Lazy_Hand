-- Seller platform fee (5% of item subtotal), recorded separately from the
-- customer-facing platform fee. Historical orders keep their recorded payout.
BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_commission NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_seller_commission_check;
ALTER TABLE orders ADD CONSTRAINT orders_seller_commission_check CHECK (seller_commission >= 0);

COMMENT ON COLUMN orders.seller_commission IS 'Platform fee charged to the shop/restaurant (5% of item_total for orders created after migration 0009).';

CREATE INDEX IF NOT EXISTS orders_seller_commission_idx ON orders (placed_at DESC) WHERE seller_commission > 0;

COMMIT;
