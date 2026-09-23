-- Additive only. Run in the existing production project.
begin;
create table if not exists public.automatic_sync_jobs (
 kind text primary key check(kind in ('campaign','proposal')),
 cursor timestamptz, last_success_at timestamptz, active_run uuid, lock_until timestamptz
);
insert into public.automatic_sync_jobs(kind) values('campaign'),('proposal') on conflict do nothing;
create table if not exists public.automatic_sync_runs (
 id uuid primary key default gen_random_uuid(),
 kind text not null references public.automatic_sync_jobs(kind),
 trigger text not null check(trigger in ('manual','scheduled')),
 status text not null check(status in ('running','succeeded','failed')),
 started_at timestamptz not null default now(), finished_at timestamptz,
 error text, counts jsonb not null default '{}', changes jsonb not null default '[]'
);
create index if not exists automatic_sync_recent on public.automatic_sync_runs(kind,started_at desc);
alter table public.automatic_sync_jobs enable row level security;
alter table public.automatic_sync_runs enable row level security;

-- The Edge Function only reads the existing campaign payload; it never updates it.
grant select on table public.workspace_state to service_role;
revoke all on public.automatic_sync_jobs,public.automatic_sync_runs from anon,authenticated;
grant all on public.automatic_sync_jobs,public.automatic_sync_runs to service_role;

create or replace function public.claim_automatic_sync(p_kind text,p_trigger text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.automatic_sync_jobs; r public.automatic_sync_runs;
begin
 select * into j from public.automatic_sync_jobs where kind=p_kind for update;
 if not found then raise exception 'Unknown sync kind'; end if;
 if j.lock_until>now() then raise exception '동기화가 이미 실행 중입니다.'; end if;
 if j.active_run is not null then
   update public.automatic_sync_runs set status='failed',error='실행 제한시간 초과. 다음 실행에서 같은 변경분을 재처리합니다.',finished_at=now() where id=j.active_run and status='running';
 end if;
 insert into public.automatic_sync_runs(kind,trigger,status) values(p_kind,p_trigger,'running') returning * into r;
 update public.automatic_sync_jobs set active_run=r.id,lock_until=now()+interval '10 minutes' where kind=p_kind;
 return jsonb_build_object('run',to_jsonb(r),'cursor',j.cursor);
end $$;
create or replace function public.finish_automatic_sync(p_kind text,p_id uuid,p_cursor timestamptz,p_error text,p_counts jsonb,p_changes jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare j public.automatic_sync_jobs;
begin
 select * into j from public.automatic_sync_jobs where kind=p_kind for update;
 if j.active_run is distinct from p_id then raise exception 'Expired sync lock'; end if;
 update public.automatic_sync_runs set status=case when p_error is null then 'succeeded' else 'failed' end,
 finished_at=now(),error=p_error,counts=p_counts,changes=p_changes where id=p_id;
 update public.automatic_sync_jobs set cursor=case when p_error is null then p_cursor else cursor end,
 last_success_at=case when p_error is null then now() else last_success_at end,
 active_run=null,lock_until=null where kind=p_kind;
end $$;
create or replace function public.automatic_sync_schedule_status()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if to_regclass('cron.job') is null then return '[]'::jsonb; end if;
 execute 'select coalesce(jsonb_agg(jsonb_build_object(''name'',jobname,''active'',active,''schedule'',schedule)),''[]''::jsonb) from cron.job where jobname in (''t3-sync-campaign'',''t3-sync-proposal'')' into result;
 return result;
end $$;
revoke all on function public.claim_automatic_sync(text,text),public.finish_automatic_sync(text,uuid,timestamptz,text,jsonb,jsonb),public.automatic_sync_schedule_status() from public,anon,authenticated;
grant execute on function public.claim_automatic_sync(text,text),public.finish_automatic_sync(text,uuid,timestamptz,text,jsonb,jsonb),public.automatic_sync_schedule_status() to service_role;
commit;

-- Separate activation after Edge Function and source settings are verified.
-- Enable existing project's pg_cron and pg_net extensions, and store matching
-- t3_sync_endpoint / t3_sync_cron_token in Vault; never place tokens in source.
-- Run docs/AUTOMATIC_SYNC_SCHEDULE.sql only after this setup.
