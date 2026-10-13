-- User-supplied original image is provisioned separately, never in the Git tree.
create table public.company_share_assets (
  id text primary key check (id = 'business-registration-bank'),
  mime_type text not null check (mime_type = 'image/png'),
  image_base64 text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5000000),
  updated_at timestamptz not null default now(),
  check (octet_length(decode(image_base64,'base64')) = byte_size)
);
alter table public.company_share_assets enable row level security;
revoke all on public.company_share_assets from anon,authenticated;
grant select on public.company_share_assets to authenticated;
create policy approved_staff_company_image on public.company_share_assets for select to authenticated using (
  exists(select 1 from public.profiles where id=(select auth.uid()) and active and approval_status='approved')
);
