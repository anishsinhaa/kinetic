-- =============================================================================
-- Kinetic v2 — schedule Web Push reminders (pg_cron + pg_net)
-- Run in the Supabase SQL editor AFTER deploying the send-reminders function.
-- Replace placeholders before executing.
-- =============================================================================

-- Enable extensions (once per project)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Optional: store the shared secret for the edge function
-- (or paste the bearer token inline in the cron job below)
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'YOUR_CRON_SECRET';

-- Remove previous job if re-running
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'kinetic-send-reminders';

-- Fire every 5 minutes. Reminder times are local wall-clock in each user's
-- user_settings.timezone (IANA); the edge function converts per user and
-- treats a reminder as due for 6 minutes after its time (deduped).
SELECT cron.schedule(
  'kinetic-send-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify
-- SELECT * FROM cron.job WHERE jobname = 'kinetic-send-reminders';
