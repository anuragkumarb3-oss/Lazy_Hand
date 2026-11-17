ALTER TABLE catalog_products
  ADD COLUMN brand TEXT NOT NULL DEFAULT '',
  ADD COLUMN sku TEXT NOT NULL DEFAULT '',
  ADD COLUMN mrp NUMERIC(12,2),
  ADD COLUMN buying_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN additional_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  ADD CONSTRAINT catalog_products_mrp_check CHECK (mrp IS NULL OR mrp >= price),
  ADD CONSTRAINT catalog_products_buying_cost_check CHECK (buying_cost >= 0),
  ADD CONSTRAINT catalog_products_additional_cost_check CHECK (additional_cost >= 0),
  ADD CONSTRAINT catalog_products_low_stock_threshold_check CHECK (low_stock_threshold >= 0);

CREATE UNIQUE INDEX catalog_products_owner_sku_unique
  ON catalog_products(owner_id, sku)
  WHERE sku <> '';
