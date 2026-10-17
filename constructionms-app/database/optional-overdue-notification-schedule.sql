-- =============================================================================
-- OPTIONAL: run the overdue-notification sweep every 5 minutes (like the old
-- .NET OverdueNotificationWorker) using Supabase's pg_cron + pg_net extensions.
--
-- Why: Vercel's Hobby plan only allows cron jobs that run once per day, so
-- vercel.json schedules the sweep daily. If you want the original 5-minute
-- cadence on any Vercel plan, run this file once in the Supabase SQL Editor
-- AFTER supabase-schema.sql, replacing the two placeholders below:
--   https://YOUR-APP.vercel.app  -> your deployed site URL
--   YOUR-CRON-SECRET             -> the CRON_SECRET value set in Vercel
-- (On Vercel Pro you can instead change the schedule in vercel.json to
--  "*/5 * * * *" and skip this file.)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove an earlier copy of the job so this script can be re-run safely.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'constructionms-overdue-notifications';

SELECT cron.schedule(
    'constructionms-overdue-notifications',
    '*/5 * * * *',
    $$
    SELECT net.http_get(
        url := 'https://YOUR-APP.vercel.app/api/cron/overdue-notifications',
        headers := jsonb_build_object('Authorization', 'Bearer YOUR-CRON-SECRET'),
        timeout_milliseconds := 55000
    );
    $$
);
