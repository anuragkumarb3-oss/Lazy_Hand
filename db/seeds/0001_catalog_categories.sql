-- Canonical catalog categories used by the storefront and the preview demo listings.
-- Idempotent: safe to run more than once.

INSERT INTO catalog_categories (name, scope, business_types, is_active, is_visible, display_order)
SELECT v.name, v.scope, v.business_types, TRUE, TRUE, v.display_order
FROM (VALUES
  ('Chips & Wafers', 'general', ARRAY['retail', 'grocery']::text[], 10),
  ('Bhujia & Mixtures', 'general', ARRAY['retail', 'grocery']::text[], 20),
  ('Namkeen Snacks', 'general', ARRAY['retail', 'grocery']::text[], 30),
  ('Biscuits', 'general', ARRAY['retail', 'grocery']::text[], 40),
  ('Soft Drinks & Beverages', 'general', ARRAY['retail', 'grocery']::text[], 50),
  ('Dairy Products', 'general', ARRAY['retail', 'grocery']::text[], 60),
  ('Groceries', 'general', ARRAY['retail', 'grocery']::text[], 70),
  ('Daily Essentials', 'general', ARRAY['retail', 'grocery']::text[], 80),
  ('Fruits & Vegetables', 'general', ARRAY['retail', 'grocery']::text[], 90),
  ('Ice Creams', 'general', ARRAY['retail', 'grocery']::text[], 100),
  ('Household Products', 'general', ARRAY['retail', 'grocery']::text[], 110),
  ('Pizza', 'restaurant', ARRAY['restaurant']::text[], 120),
  ('Burgers & Sandwiches', 'restaurant', ARRAY['restaurant']::text[], 130),
  ('Junk Food', 'restaurant', ARRAY['restaurant']::text[], 140),
  ('Snacks & Starters', 'restaurant', ARRAY['restaurant']::text[], 150),
  ('Main Course / Heavy Meals', 'restaurant', ARRAY['restaurant']::text[], 160),
  ('Biryani & Rice', 'restaurant', ARRAY['restaurant']::text[], 170),
  ('Indian Food', 'restaurant', ARRAY['restaurant']::text[], 180),
  ('Chinese Food', 'restaurant', ARRAY['restaurant']::text[], 190),
  ('Desserts', 'restaurant', ARRAY['restaurant']::text[], 200),
  ('Drinks & Beverages', 'restaurant', ARRAY['restaurant']::text[], 210)
) AS v(name, scope, business_types, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_categories c
  WHERE lower(c.name) = lower(v.name) AND c.scope = v.scope
);
