insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'seller-documents',
  'seller-documents',
  false,
  26214400,
  array[
    'image/png','image/jpeg','image/webp','application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel','text/csv','application/csv','application/octet-stream'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "approved users read seller documents" on storage.objects;
create policy "approved users read seller documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'seller-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.approval_status = 'approved'
  )
);

drop policy if exists "admins upload seller documents" on storage.objects;
create policy "admins upload seller documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'seller-documents' and public.is_company_admin(auth.uid()));

drop policy if exists "admins update seller documents" on storage.objects;
create policy "admins update seller documents"
on storage.objects for update to authenticated
using (bucket_id = 'seller-documents' and public.is_company_admin(auth.uid()))
with check (bucket_id = 'seller-documents' and public.is_company_admin(auth.uid()));

drop policy if exists "admins delete seller documents" on storage.objects;
create policy "admins delete seller documents"
on storage.objects for delete to authenticated
using (bucket_id = 'seller-documents' and public.is_company_admin(auth.uid()));
