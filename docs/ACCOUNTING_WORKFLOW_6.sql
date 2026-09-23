-- Existing project only. Review/apply before enabling Workflow 6.
-- Adds isolated accounting records; no existing policy, settlement or Snapshot update.
begin;
create table if not exists public.accounting_month_closes (
  month text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null check (status in ('open','closed','reported','paid')),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id)
);
alter table public.accounting_month_closes enable row level security;
revoke all on public.accounting_month_closes from anon, authenticated;
grant select on public.accounting_month_closes to authenticated;
create policy "accounting staff read month closes" on public.accounting_month_closes
for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.active and p.approval_status='approved' and p.role in ('ceo','admin','settlement_cs')));

create or replace function public.accounting_change_month(p_month text,p_rows jsonb,p_expected timestamptz,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; current_row public.accounting_month_closes; next_status text;
begin
  select role into actor_role from profiles where id=auth.uid() and active and approval_status='approved';
  if actor_role is null or actor_role not in ('ceo','admin','settlement_cs') then raise exception 'Accounting permission denied'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid month'; end if;
  perform pg_advisory_xact_lock(hashtextextended('accounting-month:'||p_month,0));
  select * into current_row from accounting_month_closes where month=p_month for update;
  if current_row.updated_at is distinct from p_expected then raise exception 'Month changed; reload before saving'; end if;
  if p_action='close' then
    if current_row.status is not null and current_row.status<>'open' then raise exception 'Month is locked'; end if;
    if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 then raise exception 'No rows'; end if;
    if exists (select 1 from jsonb_array_elements(p_rows) x where x->>'month' is distinct from p_month
      or jsonb_typeof(x->'gross') is distinct from 'number' or jsonb_typeof(x->'net') is distinct from 'number'
      or jsonb_typeof(x->'incomeTax') is distinct from 'number' or jsonb_typeof(x->'localTax') is distinct from 'number') then raise exception 'Invalid accounting snapshot'; end if;
    next_status:='closed';
  elsif p_action='reported' and current_row.status='closed' then next_status:='reported';
  elsif p_action='paid' and current_row.status='reported' then
    if exists (select 1 from jsonb_array_elements(current_row.rows) x where coalesce(x->>'paymentStatus','') not in ('payment_completed','remittance_confirmed')) then raise exception 'Unpaid records remain in the closing snapshot; administrator review is required'; end if;
    next_status:='paid';
  elsif p_action='reopen' and actor_role in ('ceo','admin') and current_row.status in ('closed','reported','paid') then next_status:='open';
  else raise exception 'Invalid transition or administrator permission required'; end if;
  insert into accounting_month_closes(month,status,rows,history,updated_at,updated_by)
  values(p_month,next_status,case when p_action='close' then p_rows else current_row.rows end,
    coalesce(current_row.history,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('at',now(),'by',auth.uid(),'action',p_action,'previous',to_jsonb(current_row)-'history')),
    clock_timestamp(),auth.uid())
  on conflict(month) do update set status=excluded.status,rows=excluded.rows,history=excluded.history,updated_at=excluded.updated_at,updated_by=excluded.updated_by
  returning * into current_row;
  return to_jsonb(current_row)-'history';
end; $$;
revoke all on function public.accounting_change_month(text,jsonb,timestamptz,text) from public,anon;
grant execute on function public.accounting_change_month(text,jsonb,timestamptz,text) to authenticated;

create table if not exists public.seller_detail_shares (
  id uuid primary key default gen_random_uuid(), settlement_id text not null,
  object_path text not null unique, created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '14 days'),
  signed_url text, created_by uuid not null references public.profiles(id),
  check(expires_at=created_at+interval '14 days')
);
alter table public.seller_detail_shares enable row level security;
revoke all on public.seller_detail_shares from anon,authenticated;
grant select on public.seller_detail_shares to authenticated;
create policy "accounting staff read seller shares" on public.seller_detail_shares for select to authenticated using (exists(select 1 from profiles p where p.id=auth.uid() and p.active and p.approval_status='approved' and p.role in ('ceo','admin','settlement_cs')));
create or replace function public.accounting_reserve_seller_share(p_settlement_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.seller_detail_shares;
begin
  if not exists(select 1 from profiles p where p.id=auth.uid() and p.active and p.approval_status='approved' and p.role in ('ceo','admin','settlement_cs')) then raise exception 'Accounting permission denied'; end if;
  if not exists(select 1 from storage.buckets where id='seller-documents' and public=false) then raise exception 'Private seller-documents bucket required'; end if;
  if nullif(trim(p_settlement_id),'') is null then raise exception 'Settlement required'; end if;
  insert into seller_detail_shares(settlement_id,object_path,created_by)
  values(p_settlement_id,'settlement-exports/details/'||gen_random_uuid()::text||'.png',auth.uid()) returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.accounting_reserve_seller_share(text) from public,anon;
grant execute on function public.accounting_reserve_seller_share(text) to authenticated;
create or replace function public.accounting_finalize_seller_share(p_id uuid,p_url text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.seller_detail_shares;
begin
  if not exists(select 1 from profiles p where p.id=auth.uid() and p.active and p.approval_status='approved' and p.role in ('ceo','admin','settlement_cs')) then raise exception 'Accounting permission denied'; end if;
  select * into result from seller_detail_shares where id=p_id and created_by=auth.uid() for update;
  if result.id is null or result.signed_url is not null then raise exception 'Share unavailable'; end if;
  if p_expires_at is null or p_expires_at>now()+interval '14 days 1 minute' or p_expires_at<now()+interval '13 days 23 hours' then raise exception 'Invalid expiry'; end if;
  if p_url is null or position('/storage/v1/object/sign/seller-documents/'||result.object_path||'?token=' in p_url)=0 then raise exception 'Invalid object URL'; end if;
  update seller_detail_shares set signed_url=p_url,expires_at=p_expires_at,created_at=p_expires_at-interval '14 days' where id=p_id returning * into result;
  return to_jsonb(result);
end; $$;
revoke all on function public.accounting_finalize_seller_share(uuid,text,timestamptz) from public,anon;
grant execute on function public.accounting_finalize_seller_share(uuid,text,timestamptz) to authenticated;
commit;
