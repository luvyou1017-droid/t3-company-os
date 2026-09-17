-- 매니저는 본인이 담당한 정산 건의 매니저 증빙만 읽고 업로드할 수 있습니다.

drop policy if exists "authorized evidence read" on storage.objects;
create policy "authorized evidence read" on storage.objects
for select to authenticated
using (
  bucket_id = 'payment-evidence' and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active and p.approval_status = 'approved'
        and p.role in ('admin', 'ceo', 'settlement_cs')
    )
    or exists (
      select 1
      from public.profiles p
      join public.campaigns c on c.manager_id = p.id
        or regexp_replace(lower(c.manager_name), '\s+', '', 'g') = regexp_replace(lower(p.display_name), '\s+', '', 'g')
      join public.settlements s on s.campaign_id = c.id
      where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role = 'manager'
        and (storage.foldername(name))[1] = 'campaigns'
        and c.id = case when (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$' then (storage.foldername(name))[2]::uuid end
        and (storage.foldername(name))[3] = 'settlements'
        and s.id = case when (storage.foldername(name))[4] ~* '^[0-9a-f-]{36}$' then (storage.foldername(name))[4]::uuid end
        and (storage.foldername(name))[5] = 'manager'
        and c.manager_id = case when (storage.foldername(name))[6] ~* '^[0-9a-f-]{36}$' then (storage.foldername(name))[6]::uuid end
    )
  )
);

drop policy if exists "settlement evidence upload" on storage.objects;
create policy "settlement evidence upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'payment-evidence' and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active and p.approval_status = 'approved'
        and p.role in ('admin', 'ceo', 'settlement_cs')
    )
    or exists (
      select 1
      from public.profiles p
      join public.campaigns c on c.manager_id = p.id
        or regexp_replace(lower(c.manager_name), '\s+', '', 'g') = regexp_replace(lower(p.display_name), '\s+', '', 'g')
      join public.settlements s on s.campaign_id = c.id
      where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role = 'manager'
        and (storage.foldername(name))[1] = 'campaigns'
        and c.id = case when (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$' then (storage.foldername(name))[2]::uuid end
        and (storage.foldername(name))[3] = 'settlements'
        and s.id = case when (storage.foldername(name))[4] ~* '^[0-9a-f-]{36}$' then (storage.foldername(name))[4]::uuid end
        and (storage.foldername(name))[5] = 'manager'
        and c.manager_id = case when (storage.foldername(name))[6] ~* '^[0-9a-f-]{36}$' then (storage.foldername(name))[6]::uuid end
    )
  )
);

drop policy if exists "settlement evidence delete" on storage.objects;
create policy "settlement evidence delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'payment-evidence'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.approval_status = 'approved'
      and p.role in ('admin', 'ceo', 'settlement_cs')
  )
);

-- payment_evidence 메타데이터도 매니저가 등록할 수 있어야 파일 저장 후 RLS에서 막히지 않습니다.
drop policy if exists "manager evidence insert" on public.payment_evidence;
create policy "manager evidence insert" on public.payment_evidence
for insert to authenticated
with check (
  owner_type = 'manager' and exists (
    select 1
    from public.profiles p
    join public.campaigns c on c.manager_id = p.id
      or regexp_replace(lower(c.manager_name), '\s+', '', 'g') = regexp_replace(lower(p.display_name), '\s+', '', 'g')
    join public.settlements s on s.campaign_id = c.id
    where p.id = auth.uid() and p.active and p.approval_status = 'approved' and p.role = 'manager'
      and c.id = payment_evidence.campaign_id
      and s.id = payment_evidence.settlement_id
      and c.manager_id = payment_evidence.owner_id
  )
);
