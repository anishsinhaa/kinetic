-- =============================================================================
-- KINETIC — Auth & RLS Migration
-- Run this in Supabase SQL Editor AFTER you have real users signing up.
-- Safe to re-run (all statements are idempotent).
-- =============================================================================

-- =============================================================================
-- 1. RE-ADD FOREIGN KEY CONSTRAINTS
-- =============================================================================

ALTER TABLE daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_user_id_fkey,
  ADD CONSTRAINT daily_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE workouts
  DROP CONSTRAINT IF EXISTS workouts_user_id_fkey,
  ADD CONSTRAINT workouts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE body_feedback
  DROP CONSTRAINT IF EXISTS body_feedback_user_id_fkey,
  ADD CONSTRAINT body_feedback_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Unique constraint for body_feedback upsert (if not already present)
ALTER TABLE body_feedback
  DROP CONSTRAINT IF EXISTS body_feedback_user_date_unique,
  ADD CONSTRAINT body_feedback_user_date_unique UNIQUE (user_id, date);

-- =============================================================================
-- 2. ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE daily_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_feedback      ENABLE ROW LEVEL SECURITY;
ALTER TABLE muscle_soreness    ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. RLS POLICIES
-- =============================================================================

-- ── daily_logs ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "daily_logs_select" ON daily_logs;
CREATE POLICY "daily_logs_select" ON daily_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_logs_insert" ON daily_logs;
CREATE POLICY "daily_logs_insert" ON daily_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_logs_update" ON daily_logs;
CREATE POLICY "daily_logs_update" ON daily_logs
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_logs_delete" ON daily_logs;
CREATE POLICY "daily_logs_delete" ON daily_logs
  FOR DELETE USING (auth.uid() = user_id);

-- ── workouts ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "workouts_select" ON workouts;
CREATE POLICY "workouts_select" ON workouts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "workouts_insert" ON workouts;
CREATE POLICY "workouts_insert" ON workouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "workouts_update" ON workouts;
CREATE POLICY "workouts_update" ON workouts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "workouts_delete" ON workouts;
CREATE POLICY "workouts_delete" ON workouts
  FOR DELETE USING (auth.uid() = user_id);

-- ── exercises (shared master table + user custom exercises) ──────────────────
-- Anyone authenticated can read standard exercises;
-- users can only read/edit their own custom ones.

DROP POLICY IF EXISTS "exercises_select" ON exercises;
CREATE POLICY "exercises_select" ON exercises
  FOR SELECT USING (
    is_custom = false
    OR auth.uid() = created_by
  );

DROP POLICY IF EXISTS "exercises_insert" ON exercises;
CREATE POLICY "exercises_insert" ON exercises
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
  );

DROP POLICY IF EXISTS "exercises_update" ON exercises;
CREATE POLICY "exercises_update" ON exercises
  FOR UPDATE USING (
    auth.uid() = created_by
  );

DROP POLICY IF EXISTS "exercises_delete" ON exercises;
CREATE POLICY "exercises_delete" ON exercises
  FOR DELETE USING (
    auth.uid() = created_by
  );

-- ── workout_exercises (access via parent workout) ────────────────────────────

DROP POLICY IF EXISTS "workout_exercises_select" ON workout_exercises;
CREATE POLICY "workout_exercises_select" ON workout_exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workout_exercises_insert" ON workout_exercises;
CREATE POLICY "workout_exercises_insert" ON workout_exercises
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workout_exercises_update" ON workout_exercises;
CREATE POLICY "workout_exercises_update" ON workout_exercises
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workout_exercises_delete" ON workout_exercises;
CREATE POLICY "workout_exercises_delete" ON workout_exercises
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.user_id = auth.uid()
    )
  );

-- ── sets (access via workout_exercise → workout) ─────────────────────────────

DROP POLICY IF EXISTS "sets_select" ON sets;
CREATE POLICY "sets_select" ON sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workouts ON workouts.id = workout_exercises.workout_id
      WHERE workout_exercises.id = sets.workout_exercise_id
        AND workouts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sets_insert" ON sets;
CREATE POLICY "sets_insert" ON sets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workouts ON workouts.id = workout_exercises.workout_id
      WHERE workout_exercises.id = sets.workout_exercise_id
        AND workouts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sets_update" ON sets;
CREATE POLICY "sets_update" ON sets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workouts ON workouts.id = workout_exercises.workout_id
      WHERE workout_exercises.id = sets.workout_exercise_id
        AND workouts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sets_delete" ON sets;
CREATE POLICY "sets_delete" ON sets
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workouts ON workouts.id = workout_exercises.workout_id
      WHERE workout_exercises.id = sets.workout_exercise_id
        AND workouts.user_id = auth.uid()
    )
  );

-- ── body_feedback ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "body_feedback_select" ON body_feedback;
CREATE POLICY "body_feedback_select" ON body_feedback
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "body_feedback_insert" ON body_feedback;
CREATE POLICY "body_feedback_insert" ON body_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "body_feedback_update" ON body_feedback;
CREATE POLICY "body_feedback_update" ON body_feedback
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "body_feedback_delete" ON body_feedback;
CREATE POLICY "body_feedback_delete" ON body_feedback
  FOR DELETE USING (auth.uid() = user_id);

-- ── muscle_soreness (access via body_feedback) ───────────────────────────────

DROP POLICY IF EXISTS "muscle_soreness_select" ON muscle_soreness;
CREATE POLICY "muscle_soreness_select" ON muscle_soreness
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM body_feedback
      WHERE body_feedback.id = muscle_soreness.feedback_id
        AND body_feedback.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "muscle_soreness_insert" ON muscle_soreness;
CREATE POLICY "muscle_soreness_insert" ON muscle_soreness
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM body_feedback
      WHERE body_feedback.id = muscle_soreness.feedback_id
        AND body_feedback.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "muscle_soreness_delete" ON muscle_soreness;
CREATE POLICY "muscle_soreness_delete" ON muscle_soreness
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM body_feedback
      WHERE body_feedback.id = muscle_soreness.feedback_id
        AND body_feedback.user_id = auth.uid()
    )
  );
