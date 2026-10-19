-- Run the reminder sender every 5 minutes instead of every minute (lighter load
-- on the free Nano instance). The job was created by hand from
-- supabase/cron_reminders.sql, so alter it in place: the URL and the CRON_SECRET
-- stay in the job definition and never enter the repo.
--
-- No-op when pg_cron is not installed or no job named 'kinetic-send-reminders'
-- exists (e.g. a fresh project) — re-run supabase/cron_reminders.sql there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.alter_job(jobid, schedule := '*/5 * * * *')
    FROM cron.job
    WHERE jobname = 'kinetic-send-reminders';
  END IF;
END $$;
