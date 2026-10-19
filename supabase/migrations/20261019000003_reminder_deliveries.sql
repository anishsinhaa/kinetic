-- Dedupe table for the send-reminders edge function. A reminder is claimed by
-- inserting (user_id, kind, local_date) before it is sent, so overlapping cron
-- windows never deliver the same reminder twice.
CREATE TABLE IF NOT EXISTS public.reminder_deliveries (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL,
  local_date DATE        NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, local_date)
);

-- Service-role only: RLS on with no client policies.
ALTER TABLE public.reminder_deliveries ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.reminder_deliveries TO service_role;
