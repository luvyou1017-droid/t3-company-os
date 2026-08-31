-- T3 Company OS · Supabase Phase 1
-- Run in a new Supabase project only after reviewing this file.
-- WARNING: development-wide policies must never be enabled in production.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  role text not null check (role in ('ceo','settlement_cs','team_lead','md','manager','admin')),
  department text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The first production account is provisioned as CEO only for the approved company email.
create or replace function public.handle_new_company_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if lower(new.email) = 'solution4834@naver.com' then
    insert into public.profiles (id, display_name, email, role)
    values (new.id, '허윤정', lower(new.email), 'ceo')
    on conflict (id) do update set
      display_name = excluded.display_name,
      email = excluded.email,
      role = excluded.role,
      active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_company_user();
-- Auth provisioning 후 display_name만 다음 mock 사용자와 매핑한다:
-- 허윤정, 허수정, 배민성, 유시철, 김병희, 서주희, 고정원, 이규빈.
-- 실제 이메일이나 추가 개인정보는 이 migration에 포함하지 않는다.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_code text not null unique,
  campaign_name text not null,
  seller_id uuid, seller_name text not null,
  brand_id uuid, brand_name text,
  product_id uuid, product_name text,
  manager_id uuid, manager_name text,
  md_id uuid, md_name text,
  start_date date, end_date date,
  sales_channel_type text, link_owner text, business_type text,
  total_commission_rate numeric(8,4), seller_commission_rate numeric(8,4),
  settlement_due_date date, status text not null default 'draft', memo text,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  notion_source_id text unique, seller_name text not null, instagram_id text,
  business_name text, business_type text, contact text,
  bank_name text, account_number_encrypted text, account_holder text,
  manager_id uuid references public.profiles(id), active boolean not null default true,
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  notion_source_id text unique, supplier_name text not null,
  business_registration_number_encrypted text, contact text,
  bank_name text, account_number_encrypted text, account_holder text,
  order_method text, order_deadline text, active boolean not null default true,
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  notion_source_id text unique, product_name text not null,
  supplier_id uuid references public.suppliers(id), category text[],
  group_buy_price bigint, supply_price bigint,
  total_commission_rate numeric(8,4), seller_commission_rate numeric(8,4),
  landing_page_url text, sample_policy text, shipping_policy text,
  active boolean not null default true,
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.sales_data_imports (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id),
  source_type text not null, original_file_name text, review_status text not null default 'uploaded',
  total_quantity integer not null default 0, total_sales_amount bigint not null default 0,
  total_commission_rate numeric(8,4), seller_commission_rate numeric(8,4),
  source_version integer not null default 1, confirmed_by uuid references public.profiles(id), confirmed_at timestamptz,
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.sales_data_rows (
  id uuid primary key default gen_random_uuid(), sales_data_import_id uuid not null references public.sales_data_imports(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id), option_name text not null,
  quantity integer not null default 0, unit_price bigint not null default 0,
  gross_sales bigint not null default 0, canceled_quantity integer not null default 0,
  refunded_quantity integer not null default 0, net_quantity integer not null default 0, net_sales bigint not null default 0,
  total_commission_rate numeric(8,4), seller_commission_rate numeric(8,4),
  validation_status text not null default 'valid', validation_message text,
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  settlement_code text not null unique, status text not null,
  gross_sales bigint not null default 0, shipping_amount bigint not null default 0,
  total_commission_rate numeric(8,4) not null default 0, total_commission_amount bigint not null default 0,
  seller_commission_rate numeric(8,4) not null default 0, external_mall_extra_rate numeric(8,4) not null default 0,
  seller_commission_amount bigint not null default 0, vendor_commission_amount bigint not null default 0,
  deductions_amount bigint not null default 0, distributable_amount bigint not null default 0,
  manager_payment_amount bigint not null default 0, company_amount bigint not null default 0,
  sales_channel_type text, source_version integer not null default 1,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.settlements add column if not exists manager_base_share_amount bigint not null default 0;
alter table public.settlements add column if not exists manager_reimbursement_amount bigint not null default 0;

create table if not exists public.settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('sample','event','purchase','shipping','refund','promotion','other')),
  title text not null, amount bigint not null check (amount >= 0),
  cost_owner text not null check (cost_owner in ('company','seller','brand','manager','undecided')),
  apply_location text not null check (apply_location in ('net_company_commission','seller_payment','manager_payment','manager_reimbursement','record_only','needs_review')),
  prepaid_by uuid references public.profiles(id), reimbursement_recipient_id uuid references public.profiles(id),
  evidence_status text not null default 'pending', evidence_path text,
  reflected boolean not null default false, source_type text, source_id text, memo text,
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.notion_migration_records (
  id uuid primary key default gen_random_uuid(),
  notion_source_id text not null, notion_data_source_id text not null,
  entity_type text not null, target_table text not null, target_id uuid,
  source_updated_at timestamptz, payload_hash text, status text not null default 'previewed',
  warnings jsonb not null default '[]'::jsonb, migrated_by uuid references public.profiles(id), migrated_at timestamptz,
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (notion_source_id, entity_type)
);

create table if not exists public.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  settlement_id uuid not null references public.settlements(id),
  seller_id uuid, seller_name text, business_type text, evidence_type text, sales_channel_type text,
  settlement_direction text, gross_settlement_amount bigint not null default 0, vat_excluded_amount bigint not null default 0,
  withholding_base_amount bigint not null default 0, income_tax_amount bigint not null default 0,
  local_income_tax_amount bigint not null default 0, total_withholding_tax_amount bigint not null default 0,
  deductions_amount bigint not null default 0, final_payment_amount bigint not null default 0,
  seller_remittance_to_company bigint not null default 0, evidence_confirmed boolean not null default false,
  status text not null default 'draft', source_version integer not null default 1,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (settlement_id, seller_id, source_version)
);

create table if not exists public.payment_request_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text unique, manager_id uuid, manager_name text, recipient_type text not null default 'manager',
  payment_request_ids uuid[] not null default '{}', campaign_ids uuid[] not null default '{}',
  item_count integer not null default 0, gross_amount bigint not null default 0,
  income_tax_amount bigint not null default 0, local_income_tax_amount bigint not null default 0,
  total_withholding_tax_amount bigint not null default 0, final_amount bigint not null default 0,
  requested_by text, requested_at timestamptz, status text, memo text,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  settlement_id uuid not null references public.settlements(id),
  recipient_type text not null check (recipient_type in ('seller','manager')),
  recipient_id uuid not null, recipient_name text not null, direction text not null,
  amount bigint not null default 0, gross_amount bigint not null default 0,
  reimbursement_amount bigint not null default 0,
  income_tax_amount bigint not null default 0, local_income_tax_amount bigint not null default 0,
  withholding_tax_amount bigint not null default 0, final_amount bigint not null default 0,
  evidence_type text, evidence_status text, account_confirmed boolean not null default false,
  status text not null, batch_request_id uuid references public.payment_request_batches(id),
  source_version integer not null default 1, requested_by text, requested_at timestamptz,
  approved_by text, approved_at timestamptz, completed_by text, completed_at timestamptz, memo text,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (settlement_id, recipient_type, recipient_id, source_version)
);

create table if not exists public.payment_evidence (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  settlement_id uuid not null references public.settlements(id),
  payment_request_id uuid references public.payment_requests(id),
  owner_type text not null check (owner_type in ('seller','manager')), owner_id uuid not null, owner_name text not null,
  business_type text, evidence_type text, storage_bucket text default 'payment-evidence',
  storage_path text, original_file_name text not null, mime_type text not null, file_size bigint not null,
  review_status text not null default 'uploaded', revision integer not null default 1,
  uploaded_by text, uploaded_at timestamptz not null default now(), reviewed_by text, reviewed_at timestamptz,
  rejection_reason text, review_memo text,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (settlement_id, owner_type, owner_id, revision)
);

create table if not exists public.withholding_tax_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id), settlement_id uuid not null references public.settlements(id),
  payment_request_id uuid references public.payment_requests(id), owner_type text not null, owner_id uuid not null, owner_name text not null,
  payment_month text not null, payment_date date, gross_settlement_amount bigint not null default 0,
  withholding_base_amount bigint not null default 0, income_tax_rate numeric(4,2) not null default 3,
  income_tax_amount bigint not null default 0, local_income_tax_rate numeric(4,2) not null default 0.3,
  local_income_tax_amount bigint not null default 0, total_withholding_tax_amount bigint not null default 0,
  final_payment_amount bigint not null default 0, source_version integer not null default 1, status text not null default 'draft',
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (settlement_id, owner_type, owner_id, source_version)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id), entity_type text not null, entity_id uuid not null,
  action text not null, actor_id uuid references public.profiles(id), actor_name text,
  before_data jsonb, after_data jsonb, memo text,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  version integer not null default 1, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists idx_campaigns_manager on public.campaigns(manager_id);
create index if not exists idx_sellers_manager on public.sellers(manager_id);
create index if not exists idx_products_supplier on public.products(supplier_id);
create index if not exists idx_sales_imports_campaign on public.sales_data_imports(campaign_id);
create index if not exists idx_sales_rows_import on public.sales_data_rows(sales_data_import_id);
create index if not exists idx_settlements_campaign on public.settlements(campaign_id);
create index if not exists idx_settlement_adjustments_settlement on public.settlement_adjustments(settlement_id);
create index if not exists idx_notion_migration_source on public.notion_migration_records(notion_data_source_id, notion_source_id);
create index if not exists idx_payment_evidence_owner on public.payment_evidence(settlement_id, owner_type, owner_id);
create index if not exists idx_activity_entity on public.activity_logs(entity_type, entity_id, created_at desc);

do $$ declare table_name text;
begin
  foreach table_name in array array['profiles','campaigns','sellers','suppliers','products','sales_data_imports','sales_data_rows','settlements','settlement_adjustments','notion_migration_records','seller_settlements','payment_request_batches','payment_requests','payment_evidence','withholding_tax_items','activity_logs']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- Data API privileges are explicit because "Automatically expose new tables" is disabled.
-- Anonymous visitors receive no table privileges; authenticated users are still constrained by RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- Production baseline: any authenticated active user can read. Write policies below are role-limited.
create policy "authenticated profiles read" on public.profiles for select to authenticated using (true);
create policy "authenticated campaigns read" on public.campaigns for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
);
create policy "manager own or privileged campaigns" on public.campaigns for all to authenticated
using (manager_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','ceo','settlement_cs')))
with check (manager_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','ceo','settlement_cs')));

-- Phase 1 simplified read/write policies. Tighten columns/actions before production.
do $$ declare table_name text;
begin
  foreach table_name in array array['sellers','suppliers','products','sales_data_imports','sales_data_rows','settlements','settlement_adjustments','notion_migration_records','seller_settlements','payment_requests','payment_evidence','withholding_tax_items','activity_logs','payment_request_batches']
  loop
    execute format('create policy "phase1 authenticated read %s" on public.%I for select to authenticated using (true)', table_name, table_name);
    execute format('create policy "phase1 settlement admin write %s" on public.%I for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''admin'',''settlement_cs'',''ceo''))) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''admin'',''settlement_cs'',''ceo'')))', table_name, table_name);
  end loop;
end $$;

-- CEO-only approval must additionally be enforced by an RPC/Edge Function before production.
-- DEV ONLY example (DO NOT ENABLE IN PRODUCTION):
-- create policy "DEV authenticated full access" on public.payment_evidence for all to authenticated using (true) with check (true);
-- Any temporary full-access policy must be removed before real operational data is loaded.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-evidence', 'payment-evidence', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "authorized evidence read" on storage.objects for select to authenticated using (
  bucket_id = 'payment-evidence' and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role in ('admin','ceo','settlement_cs','manager')
  )
);
create policy "settlement evidence upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-evidence' and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role in ('admin','settlement_cs')
  )
);
create policy "settlement evidence delete" on storage.objects for delete to authenticated using (
  bucket_id = 'payment-evidence' and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role in ('admin','settlement_cs')
  )
);
