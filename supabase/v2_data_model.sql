-- =============================================================================
-- KINETIC v2 — Paste into Supabase SQL Editor (Dashboard → SQL)
-- Same contents as migrations/20261017000002_v2_data_model.sql
-- =============================================================================

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS workout_type TEXT,
  ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warmup_ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warmup_note TEXT,
  ADD COLUMN IF NOT EXISTS feel SMALLINT,
  ADD COLUMN IF NOT EXISTS note TEXT;

UPDATE public.workouts
SET workout_type = NULLIF(TRIM(name), '')
WHERE workout_type IS NULL
  AND name IS NOT NULL
  AND TRIM(name) <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workouts_feel_range'
  ) THEN
    ALTER TABLE public.workouts
      ADD CONSTRAINT workouts_feel_range
      CHECK (feel IS NULL OR (feel >= 1 AND feel <= 5));
  END IF;
END $$;

ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS target TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_exercises_target_check'
  ) THEN
    ALTER TABLE public.workout_exercises
      ADD CONSTRAINT workout_exercises_target_check
      CHECK (
        target IS NULL
        OR target IN ('maintain', 'increase_weight', 'increase_reps')
      );
  END IF;
END $$;

ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS failed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE public.sets
SET failed = true
WHERE to_failure = true
  AND failed = false;

UPDATE public.sets
SET completed_at = COALESCE(completed_at, created_at)
WHERE completed_at IS NULL
  AND (weight IS NOT NULL OR reps IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  workout_types JSONB NOT NULL DEFAULT
    '["Push","Pull","Legs","Upper","Lower","Full Body","Mixed","Cardio","Free"]'::jsonb,
  reminder_morning_weight_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_morning_weight_time TIME,
  reminder_night_recovery_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_night_recovery_time TIME,
  reminder_workout_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_workout_time TIME,
  reminder_workout_days INTEGER[] NOT NULL DEFAULT '{}',
  rest_timer_seconds INTEGER NOT NULL DEFAULT 90
    CHECK (rest_timer_seconds > 0 AND rest_timer_seconds <= 3600),
  weight_step NUMERIC(4, 2) NOT NULL DEFAULT 2.5
    CHECK (weight_step > 0),
  units TEXT NOT NULL DEFAULT 'kg'
    CHECK (units IN ('kg', 'lb')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_user_endpoint_unique UNIQUE (user_id, endpoint)
);

CREATE OR REPLACE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_feedback     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscle_soreness   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings: owner select" ON public.user_settings;
CREATE POLICY "user_settings: owner select"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_settings: owner insert" ON public.user_settings;
CREATE POLICY "user_settings: owner insert"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_settings: owner update" ON public.user_settings;
CREATE POLICY "user_settings: owner update"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_settings: owner delete" ON public.user_settings;
CREATE POLICY "user_settings: owner delete"
  ON public.user_settings FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions: owner select" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: owner select"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions: owner insert" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: owner insert"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions: owner update" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: owner update"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions: owner delete" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: owner delete"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Recovery check-in last-saved timestamp
ALTER TABLE public.body_feedback
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.body_feedback
SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at < created_at;

DROP TRIGGER IF EXISTS body_feedback_updated_at ON public.body_feedback;
CREATE TRIGGER body_feedback_updated_at
  BEFORE UPDATE ON public.body_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
