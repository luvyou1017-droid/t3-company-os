-- Existing production project only. Adds an isolated, server-only Notion comparison inbox.
-- Does not update sellers, settlements, schedules, samples or historical snapshots.
begin;

create table if not exists public.notion_seller_sync_state (
  id boolean primary key default true check (id),
  last_scanned_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.notion_seller_sync_inbox (
  notion_page_id text primary key,
  last_edited_time timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending','applied','excluded')),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notion_seller_sync_state enable row level security;
alter table public.notion_seller_sync_inbox enable row level security;
revoke all on public.notion_seller_sync_state from anon, authenticated;
revoke all on public.notion_seller_sync_inbox from anon, authenticated;

create index if not exists idx_notion_seller_sync_inbox_status on public.notion_seller_sync_inbox(status, last_edited_time desc);

commit;
