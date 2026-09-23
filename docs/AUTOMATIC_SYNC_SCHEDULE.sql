-- Existing project only. Requires pg_cron, pg_net, Vault and deployed automatic-sync.
-- Monday 00:00 UTC = Monday 09:00 Asia/Seoul.
do $$
begin
 if to_regclass('cron.job') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
   raise exception 'Enable pg_cron and pg_net in the existing project first.';
 end if;
 if (select count(*) from vault.decrypted_secrets where name in ('t3_sync_endpoint','t3_sync_cron_token'))<>2 then
   raise exception 'Missing or duplicate automatic sync Vault configuration.';
 end if;
 perform cron.unschedule(jobid) from cron.job where jobname in ('t3-sync-campaign','t3-sync-proposal');
 perform cron.schedule('t3-sync-campaign','0 0 * * 1',
   $cmd$select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name='t3_sync_endpoint'),
     headers := jsonb_build_object('Content-Type','application/json','x-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='t3_sync_cron_token')),
     body := jsonb_build_object('action','run','kind','campaign'),
     timeout_milliseconds := 120000
   );$cmd$);
end $$;
