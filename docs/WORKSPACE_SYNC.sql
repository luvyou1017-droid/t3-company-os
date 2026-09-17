-- T3 Company OS · cross-device workspace state
-- Apply after docs/SUPABASE_SCHEMA.sql.

create table if not exists public.workspace_state (
  workspace_id text not null,
  storage_key text not null,
  payload jsonb,
  deleted boolean not null default false,
  revision bigint not null default 1,
  source_device_id text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, storage_key)
);

create table if not exists public.workspace_state_history (
  id bigint generated always as identity primary key,
  workspace_id text not null,
  storage_key text not null,
  payload jsonb,
  deleted boolean not null default false,
  revision bigint not null,
  source_device_id text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create or replace function public.save_workspace_state_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.workspace_state_history (
      workspace_id, storage_key, payload, deleted, revision, source_device_id, changed_by
    ) values (
      old.workspace_id, old.storage_key, old.payload, old.deleted, old.revision, old.source_device_id, auth.uid()
    );
    new.revision = old.revision + 1;
  end if;
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists save_workspace_state_history on public.workspace_state;
create trigger save_workspace_state_history
before insert or update on public.workspace_state
for each row execute function public.save_workspace_state_history();

alter table public.workspace_state enable row level security;
alter table public.workspace_state_history enable row level security;

grant select, insert, update, delete on public.workspace_state to authenticated;
grant select on public.workspace_state_history to authenticated;
grant usage, select on sequence public.workspace_state_history_id_seq to authenticated;

drop policy if exists "approved company users read workspace state" on public.workspace_state;
create policy "approved company users read workspace state"
on public.workspace_state for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role <> 'partner_vendor'
));

drop policy if exists "approved company users insert workspace state" on public.workspace_state;
create policy "approved company users insert workspace state"
on public.workspace_state for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role <> 'partner_vendor'
));

drop policy if exists "approved company users update workspace state" on public.workspace_state;
create policy "approved company users update workspace state"
on public.workspace_state for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role <> 'partner_vendor'
))
with check (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role <> 'partner_vendor'
));

drop policy if exists "company admins delete workspace state" on public.workspace_state;
create policy "company admins delete workspace state"
on public.workspace_state for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role in ('ceo','admin')
));

drop policy if exists "company admins read workspace history" on public.workspace_state_history;
create policy "company admins read workspace history"
on public.workspace_state_history for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role in ('ceo','admin','settlement_cs')
));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_state'
  ) then
    alter publication supabase_realtime add table public.workspace_state;
  end if;
end $$;
