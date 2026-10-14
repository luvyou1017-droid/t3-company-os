-- Runs daily at 03:00 UTC (12:00 Asia/Seoul). Reuses the existing
-- t3_sync_cron_token Vault secret; never embeds a credential in source.
select cron.schedule(
  't3-seller-safe-cleanup',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://eumvguklgapvwqjwxzof.supabase.co/functions/v1/seller-safe-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 't3_sync_cron_token' limit 1)
    ),
    body := '{"action":"cleanup"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
