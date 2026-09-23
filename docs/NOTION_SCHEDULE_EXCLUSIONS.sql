-- Soft exclusion only: existing schedules and settlement records are untouched.
create table if not exists public.notion_schedule_exclusions (
  notion_page_id uuid primary key,
  schedule_name text not null,
  source_signature text not null,
  excluded_at timestamptz not null default now(),
  excluded_by uuid not null references auth.users(id),
  reason text
);
alter table public.notion_schedule_exclusions enable row level security;
-- Only automatic-sync's service role accesses this table after authenticating
-- an approved CEO/admin. There are deliberately no client RLS policies.
