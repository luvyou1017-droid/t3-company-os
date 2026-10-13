do $$ begin if has_table_privilege('anon','vault.decrypted_secrets','select') or has_table_privilege('authenticated','vault.decrypted_secrets','select') then raise exception 'Vault plaintext access must be restricted'; end if; end $$;
-- Uses the existing Supabase Vault encryption; creates no API or encryption key.
create schema if not exists tax_identity_private;
revoke all on schema tax_identity_private from public,anon;
grant usage on schema tax_identity_private to authenticated;
create table tax_identity_private.identities (
 owner_type text not null check(owner_type in ('seller','manager')), owner_id text not null,
 secret_id uuid not null references vault.secrets(id), masked_number text not null,
 updated_at timestamptz not null default clock_timestamp(), updated_by uuid not null,
 primary key(owner_type,owner_id)
);
create table tax_identity_private.audit (
 id bigint generated always as identity primary key, actor uuid not null, action text not null,
 owner_type text, owner_id text, request_ids jsonb, at timestamptz not null default now()
);
alter table tax_identity_private.identities enable row level security;
alter table tax_identity_private.audit enable row level security;
revoke all on all tables in schema tax_identity_private from public,anon,authenticated;
create function tax_identity_private.guard() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.approval_status='approved' and p.role in ('ceo','admin','settlement_cs')) then raise exception 'Tax identity permission denied'; end if;
end $$;
create function tax_identity_private.status(p_targets jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform tax_identity_private.guard();
 if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets)>500 then raise exception 'Invalid identity targets'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('ownerType',t->>'ownerType','ownerId',t->>'ownerId','masked',i.masked_number,'updatedAt',i.updated_at)),'[]'::jsonb) into result
 from jsonb_array_elements(p_targets) t left join tax_identity_private.identities i on i.owner_type=t->>'ownerType' and i.owner_id=t->>'ownerId';
 return result;
end $$;
create function tax_identity_private.save(p_owner_type text,p_owner_id text,p_real_name text,p_number text,p_expected timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row tax_identity_private.identities; secret uuid; birth text;
begin
 perform tax_identity_private.guard();
 if p_owner_type is null or p_number is null or p_owner_type not in ('seller','manager') or nullif(trim(p_owner_id),'') is null or nullif(trim(p_real_name),'') is null or length(p_real_name)>100 or p_number !~ '^[0-9]{6}[1-8][0-9]{6}$' then raise exception 'Invalid taxpayer identity'; end if;
 birth := case when substring(p_number,7,1) in ('1','2','5','6') then '19' else '20' end || substring(p_number,1,6);
 if to_char(to_date(birth,'YYYYMMDD'),'YYYYMMDD') <> birth then raise exception 'Invalid taxpayer birth date'; end if;
 -- Accept only explicitly existing master/campaign/request IDs, never fuzzy names.
 if not exists(select 1 from public.workspace_state w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.payload)='array' then w.payload else '[]'::jsonb end) x where w.workspace_id='wisevendor' and not w.deleted and (
 (w.storage_key=case p_owner_type when 'seller' then 't3_company_os_seller_masters' else 't3_company_os_manager_masters' end and x->>'id'=p_owner_id)
 or (w.storage_key='t3_company_os_campaigns' and x->>case p_owner_type when 'seller' then 'sellerId' else 'managerId' end=p_owner_id)
 or (w.storage_key='t3_company_os_payment_requests' and x->>'recipientType'=p_owner_type and x->>'recipientId'=p_owner_id)))
 and not (p_owner_type='seller' and exists(select 1 from public.sellers s where s.id::text=p_owner_id or s.metadata->>'id'=p_owner_id)) then raise exception 'Existing recipient ID required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_type||':'||p_owner_id,0));
 select * into current_row from tax_identity_private.identities where owner_type=p_owner_type and owner_id=p_owner_id for update;
 if current_row.updated_at is distinct from p_expected then raise exception 'Identity changed; reload before saving'; end if;
 if current_row.secret_id is null then secret:=vault.create_secret(jsonb_build_object('realName',trim(p_real_name),'number',p_number)::text);
 else secret:=current_row.secret_id; perform vault.update_secret(secret,jsonb_build_object('realName',trim(p_real_name),'number',p_number)::text); end if;
 insert into tax_identity_private.identities(owner_type,owner_id,secret_id,masked_number,updated_at,updated_by)
 values(p_owner_type,p_owner_id,secret,substring(p_number,1,6)||'-'||substring(p_number,7,1)||'******',clock_timestamp(),auth.uid())
 on conflict(owner_type,owner_id) do update set masked_number=excluded.masked_number,updated_at=excluded.updated_at,updated_by=excluded.updated_by returning * into current_row;
 insert into tax_identity_private.audit(actor,action,owner_type,owner_id) values(auth.uid(),'save',p_owner_type,p_owner_id);
 return jsonb_build_object('ownerType',p_owner_type,'ownerId',p_owner_id,'masked',current_row.masked_number,'updatedAt',current_row.updated_at);
end $$;
create function tax_identity_private.export(p_request_ids jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; expected_count int;
begin
 perform tax_identity_private.guard();
 if jsonb_typeof(p_request_ids) is distinct from 'array' or jsonb_array_length(p_request_ids) not between 1 and 500 then raise exception 'Invalid export targets'; end if;
 select count(distinct value) into expected_count from jsonb_array_elements_text(p_request_ids);
 select coalesce(jsonb_agg(jsonb_build_object('requestId',r->>'id','ownerType',i.owner_type,'ownerId',i.owner_id,'realName',(v.decrypted_secret::jsonb)->>'realName','number',(v.decrypted_secret::jsonb)->>'number')),'[]'::jsonb) into result
 from public.workspace_state w cross join lateral jsonb_array_elements(w.payload) r
 join tax_identity_private.identities i on i.owner_type=r->>'recipientType' and i.owner_id=r->>'recipientId'
 join vault.decrypted_secrets v on v.id=i.secret_id
 where w.workspace_id='wisevendor' and w.storage_key='t3_company_os_payment_requests' and not w.deleted
 and r->>'id' in (select jsonb_array_elements_text(p_request_ids)) and r->>'status' in ('payment_completed','remittance_confirmed')
 and r->>'businessType'='freelancer';
 if jsonb_array_length(result)<>expected_count then raise exception 'Missing identity, unpaid or duplicate request; export blocked'; end if;
 insert into tax_identity_private.audit(actor,action,request_ids) values(auth.uid(),'export',p_request_ids);
 return result;
end $$;
revoke all on all functions in schema tax_identity_private from public,anon;
grant execute on function tax_identity_private.guard(),tax_identity_private.status(jsonb),tax_identity_private.save(text,text,text,text,timestamptz),tax_identity_private.export(jsonb) to authenticated;
create function public.tax_identity_status(p_targets jsonb) returns jsonb language sql security invoker set search_path='' as $$ select tax_identity_private.status(p_targets) $$;
create function public.tax_identity_save(p_owner_type text,p_owner_id text,p_real_name text,p_number text,p_expected timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select tax_identity_private.save(p_owner_type,p_owner_id,p_real_name,p_number,p_expected) $$;
create function public.tax_identity_export(p_request_ids jsonb) returns jsonb language sql security invoker set search_path='' as $$ select tax_identity_private.export(p_request_ids) $$;
revoke all on function public.tax_identity_status(jsonb),public.tax_identity_save(text,text,text,text,timestamptz),public.tax_identity_export(jsonb) from public,anon;
grant execute on function public.tax_identity_status(jsonb),public.tax_identity_save(text,text,text,text,timestamptz),public.tax_identity_export(jsonb) to authenticated;
