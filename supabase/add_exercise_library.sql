-- ============================================================
-- Migration: Enrich exercises table for local library caching
-- Run once in the Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS / idempotent patterns).
-- ============================================================

-- 1. Add metadata columns (nullable so existing rows are unaffected)
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS difficulty     TEXT,
  ADD COLUMN IF NOT EXISTS exercise_type  TEXT,
  ADD COLUMN IF NOT EXISTS instructions   TEXT;

-- 2. Deduplicate existing rows before adding the unique constraint
--    Keeps the row with the oldest created_at; removes newer duplicates.
DELETE FROM exercises a
USING exercises b
WHERE a.name = b.name
  AND a.id   > b.id;   -- keep the one with the lexicographically lower UUID (first inserted)

-- 3. Add unique constraint on name (required for upsert / ignoreDuplicates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_name_key'
  ) THEN
    ALTER TABLE exercises ADD CONSTRAINT exercises_name_key UNIQUE (name);
  END IF;
END $$;
