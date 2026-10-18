-- Ensure authenticated clients can use push_subscriptions under RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- Re-assert owner policies (idempotent) in case an earlier apply missed them.
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
