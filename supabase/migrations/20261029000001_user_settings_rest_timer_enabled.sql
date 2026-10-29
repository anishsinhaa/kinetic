ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS rest_timer_enabled boolean NOT NULL DEFAULT true;
