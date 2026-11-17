ALTER TABLE profiles
  ADD COLUMN shop_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN shop_is_open_override BOOLEAN,
  ADD COLUMN delivery_estimate_min INTEGER,
  ADD COLUMN delivery_estimate_max INTEGER;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_shop_timezone_check
    CHECK (length(shop_timezone) BETWEEN 1 AND 80),
  ADD CONSTRAINT profiles_delivery_estimate_min_check
    CHECK (delivery_estimate_min IS NULL OR delivery_estimate_min BETWEEN 1 AND 240),
  ADD CONSTRAINT profiles_delivery_estimate_max_check
    CHECK (delivery_estimate_max IS NULL OR delivery_estimate_max BETWEEN 1 AND 240),
  ADD CONSTRAINT profiles_delivery_estimate_range_check
    CHECK (
      delivery_estimate_min IS NULL
      OR delivery_estimate_max IS NULL
      OR delivery_estimate_min <= delivery_estimate_max
    );
