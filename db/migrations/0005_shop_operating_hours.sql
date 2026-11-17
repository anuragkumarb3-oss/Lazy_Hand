ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS shop_is_open_override BOOLEAN,
  ADD COLUMN IF NOT EXISTS delivery_estimate_min INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_estimate_max INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_shop_timezone_check' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_shop_timezone_check CHECK (length(shop_timezone) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_delivery_estimate_min_check' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_delivery_estimate_min_check CHECK (delivery_estimate_min IS NULL OR delivery_estimate_min BETWEEN 1 AND 240);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_delivery_estimate_max_check' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_delivery_estimate_max_check CHECK (delivery_estimate_max IS NULL OR delivery_estimate_max BETWEEN 1 AND 240);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_delivery_estimate_range_check' AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_delivery_estimate_range_check CHECK (delivery_estimate_min IS NULL OR delivery_estimate_max IS NULL OR delivery_estimate_min <= delivery_estimate_max);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.shop_operating_hours (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at TIME,
  closes_at TIME,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, day_of_week),
  CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL))
);

ALTER TABLE public.shop_operating_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_operating_hours FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_operating_hours TO service_role;
