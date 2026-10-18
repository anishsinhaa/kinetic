-- =============================================================================
-- user_settings.timezone — IANA zone for local reminder times (e.g. Asia/Kolkata)
-- =============================================================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN public.user_settings.timezone IS
  'IANA timezone (e.g. Asia/Kolkata). Reminder times are wall-clock in this zone.';
