-- =============================================================================
-- KINETIC — Supabase Schema
-- Paste this entire file into the Supabase SQL Editor and run it.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- SHARED FUNCTIONS  (must come before tables that reference them)
-- =============================================================================

-- Keeps any updated_at column current on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- TABLES
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- One row per user. Auto-created by trigger on auth.users insert.
-- This is the "users table" for app-level data — auth.users is managed by
-- Supabase Auth and should never be touched directly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  unit_system  TEXT        NOT NULL DEFAULT 'metric'  CHECK (unit_system IN ('metric', 'imperial')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: auto-insert a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger for profiles
CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- daily_logs
-- One row per user per calendar day.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  weight     NUMERIC(5, 2),          -- kg, e.g. 82.40
  calories   INTEGER,                -- kcal
  protein    INTEGER,                -- grams
  sleep      NUMERIC(4, 2),          -- hours, e.g. 7.50
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT daily_logs_user_date_unique UNIQUE (user_id, date)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- workouts
-- A workout session (one per day, or multiple).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workouts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT '',
  date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- exercises  (master catalogue — shared across all users)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exercises (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  muscle_group TEXT        NOT NULL,
  equipment    TEXT,
  is_custom    BOOLEAN     NOT NULL DEFAULT false,
  created_by   UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- workout_exercises  (exercises within a workout session)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id  UUID    NOT NULL REFERENCES public.workouts (id) ON DELETE CASCADE,
  exercise_id UUID    NOT NULL REFERENCES public.exercises (id) ON DELETE RESTRICT,
  order_index INTEGER NOT NULL DEFAULT 0
);


-- ─────────────────────────────────────────────────────────────────────────────
-- sets  (individual sets within a workout exercise)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id UUID        NOT NULL REFERENCES public.workout_exercises (id) ON DELETE CASCADE,
  set_index           INTEGER     NOT NULL DEFAULT 1,
  reps                INTEGER,
  weight              NUMERIC(6, 2),   -- kg
  to_failure          BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- body_feedback  (daily recovery / fatigue check-in)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.body_feedback (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  date          DATE        NOT NULL,
  fatigue       INTEGER     CHECK (fatigue BETWEEN 1 AND 10),
  sleep_quality INTEGER     CHECK (sleep_quality BETWEEN 1 AND 10),
  pain_flag     BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT body_feedback_user_date_unique UNIQUE (user_id, date)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- muscle_soreness  (per-muscle detail for a body_feedback row)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.muscle_soreness (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id  UUID    NOT NULL REFERENCES public.body_feedback (id) ON DELETE CASCADE,
  muscle_group TEXT    NOT NULL,
  level        INTEGER CHECK (level BETWEEN 0 AND 10)
);


-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

CREATE OR REPLACE TRIGGER daily_logs_updated_at
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_feedback    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscle_soreness  ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- profiles policies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles: owner select" ON public.profiles;
CREATE POLICY "profiles: owner select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert is handled exclusively by the handle_new_user() trigger,
-- so no INSERT policy is needed for regular users.


-- ─────────────────────────────────────────────────────────────────────────────
-- daily_logs policies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "daily_logs: owner select" ON public.daily_logs;
CREATE POLICY "daily_logs: owner select"
  ON public.daily_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_logs: owner insert" ON public.daily_logs;
CREATE POLICY "daily_logs: owner insert"
  ON public.daily_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_logs: owner update" ON public.daily_logs;
CREATE POLICY "daily_logs: owner update"
  ON public.daily_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_logs: owner delete" ON public.daily_logs;
CREATE POLICY "daily_logs: owner delete"
  ON public.daily_logs FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- workouts policies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workouts: owner select" ON public.workouts;
CREATE POLICY "workouts: owner select"
  ON public.workouts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "workouts: owner insert" ON public.workouts;
CREATE POLICY "workouts: owner insert"
  ON public.workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "workouts: owner update" ON public.workouts;
CREATE POLICY "workouts: owner update"
  ON public.workouts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "workouts: owner delete" ON public.workouts;
CREATE POLICY "workouts: owner delete"
  ON public.workouts FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- exercises policies
-- Everyone can read the shared catalogue.
-- Users can read/insert/update/delete their own custom exercises.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "exercises: public read" ON public.exercises;
CREATE POLICY "exercises: public read"
  ON public.exercises FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "exercises: owner insert custom" ON public.exercises;
CREATE POLICY "exercises: owner insert custom"
  ON public.exercises FOR INSERT
  WITH CHECK (auth.uid() = created_by AND is_custom = true);

DROP POLICY IF EXISTS "exercises: owner update custom" ON public.exercises;
CREATE POLICY "exercises: owner update custom"
  ON public.exercises FOR UPDATE
  USING (auth.uid() = created_by AND is_custom = true)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "exercises: owner delete custom" ON public.exercises;
CREATE POLICY "exercises: owner delete custom"
  ON public.exercises FOR DELETE
  USING (auth.uid() = created_by AND is_custom = true);


-- ─────────────────────────────────────────────────────────────────────────────
-- workout_exercises policies  (derived from workouts.user_id)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workout_exercises: owner select" ON public.workout_exercises;
CREATE POLICY "workout_exercises: owner select"
  ON public.workout_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.id = workout_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workout_exercises: owner insert" ON public.workout_exercises;
CREATE POLICY "workout_exercises: owner insert"
  ON public.workout_exercises FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.id = workout_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workout_exercises: owner update" ON public.workout_exercises;
CREATE POLICY "workout_exercises: owner update"
  ON public.workout_exercises FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.id = workout_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workout_exercises: owner delete" ON public.workout_exercises;
CREATE POLICY "workout_exercises: owner delete"
  ON public.workout_exercises FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.id = workout_id AND w.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- sets policies  (derived through workout_exercises → workouts.user_id)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sets: owner select" ON public.sets;
CREATE POLICY "sets: owner select"
  ON public.sets FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sets: owner insert" ON public.sets;
CREATE POLICY "sets: owner insert"
  ON public.sets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sets: owner update" ON public.sets;
CREATE POLICY "sets: owner update"
  ON public.sets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sets: owner delete" ON public.sets;
CREATE POLICY "sets: owner delete"
  ON public.sets FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- body_feedback policies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "body_feedback: owner select" ON public.body_feedback;
CREATE POLICY "body_feedback: owner select"
  ON public.body_feedback FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "body_feedback: owner insert" ON public.body_feedback;
CREATE POLICY "body_feedback: owner insert"
  ON public.body_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "body_feedback: owner update" ON public.body_feedback;
CREATE POLICY "body_feedback: owner update"
  ON public.body_feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "body_feedback: owner delete" ON public.body_feedback;
CREATE POLICY "body_feedback: owner delete"
  ON public.body_feedback FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- muscle_soreness policies  (derived from body_feedback.user_id)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "muscle_soreness: owner select" ON public.muscle_soreness;
CREATE POLICY "muscle_soreness: owner select"
  ON public.muscle_soreness FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.body_feedback bf
      WHERE bf.id = feedback_id AND bf.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "muscle_soreness: owner insert" ON public.muscle_soreness;
CREATE POLICY "muscle_soreness: owner insert"
  ON public.muscle_soreness FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.body_feedback bf
      WHERE bf.id = feedback_id AND bf.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "muscle_soreness: owner delete" ON public.muscle_soreness;
CREATE POLICY "muscle_soreness: owner delete"
  ON public.muscle_soreness FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.body_feedback bf
      WHERE bf.id = feedback_id AND bf.user_id = auth.uid()
    )
  );


-- =============================================================================
-- INDEXES  (query performance)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_id             ON public.profiles (id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date    ON public.daily_logs (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date       ON public.workouts (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_body_feedback_user_date  ON public.body_feedback (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON public.workout_exercises (workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise    ON public.sets (workout_exercise_id);
CREATE INDEX IF NOT EXISTS idx_muscle_soreness_feedback ON public.muscle_soreness (feedback_id);
