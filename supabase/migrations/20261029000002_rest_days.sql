-- Rest days: one row per user per calendar date. Additive only.
CREATE TABLE IF NOT EXISTS public.rest_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.rest_days ENABLE ROW LEVEL SECURITY;

-- Ensure authenticated clients can use rest_days under RLS.
GRANT SELECT, INSERT, DELETE ON public.rest_days TO authenticated;
GRANT ALL ON public.rest_days TO service_role;

-- Re-assert owner policies (idempotent) in case an earlier apply missed them.
DROP POLICY IF EXISTS "rest_days: owner select" ON public.rest_days;
CREATE POLICY "rest_days: owner select"
  ON public.rest_days FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rest_days: owner insert" ON public.rest_days;
CREATE POLICY "rest_days: owner insert"
  ON public.rest_days FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rest_days: owner delete" ON public.rest_days;
CREATE POLICY "rest_days: owner delete"
  ON public.rest_days FOR DELETE
  USING (auth.uid() = user_id);
