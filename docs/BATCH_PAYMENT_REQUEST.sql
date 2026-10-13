-- Atomic batch request persistence. Does not approve or pay any request.
create or replace function public.payment_request_batch_commit(p_rows jsonb, p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r jsonb; expected jsonb; old_payload jsonb; new_payments jsonb; old_payments jsonb;
  settlements jsonb; s jsonb; request jsonb; before_item jsonb; changed integer; actor_name text; result jsonb;
begin
  select display_name into actor_name from public.profiles where id=auth.uid() and active and approval_status='approved' and role in ('ceo','admin','settlement_cs');
  if actor_name is null then raise exception '일괄 지급신청 권한이 없습니다.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_rows)=0 then raise exception '신청 데이터를 확인해주세요.'; end if;
  if (select count(distinct e->>'storage_key') from jsonb_array_elements(p_expected) e)<>jsonb_array_length(p_expected) then raise exception '중복 버전 정보'; end if;
  if (select count(distinct e->>'storage_key') from jsonb_array_elements(p_rows) e)<>jsonb_array_length(p_rows) then raise exception '중복 저장 정보'; end if;
  perform 1 from public.workspace_state where workspace_id='wisevendor' and storage_key in (select e->>'storage_key' from jsonb_array_elements(p_expected) e) order by storage_key for update;
  for expected in select value from jsonb_array_elements(p_expected) loop
    if not exists(select 1 from public.workspace_state w where workspace_id='wisevendor' and storage_key=expected->>'storage_key' and revision=(expected->>'revision')::bigint and updated_at=(expected->>'updated_at')::timestamptz) then raise exception '데이터가 변경됐습니다. 다시 일괄 확인해주세요.'; end if;
  end loop;
  if not (p_expected @> '[{"storage_key":"t3_company_os_payment_requests"},{"storage_key":"t3_company_os_settlements"},{"storage_key":"t3_company_os_campaigns"}]') then raise exception '필수 버전 정보 누락'; end if;
  select payload into old_payments from public.workspace_state where workspace_id='wisevendor' and storage_key='t3_company_os_payment_requests';
  select payload into settlements from public.workspace_state where workspace_id='wisevendor' and storage_key='t3_company_os_settlements';
  select e->'payload' into new_payments from jsonb_array_elements(p_rows) e where e->>'storage_key'='t3_company_os_payment_requests';
  if jsonb_typeof(new_payments) is distinct from 'array' then raise exception '지급신청 정보 누락'; end if;
  if not exists(select 1 from jsonb_array_elements(new_payments) e where not exists(select 1 from jsonb_array_elements(old_payments) b where b->>'id'=e->>'id')) then raise exception '새 신청 대상이 없습니다.'; end if;
  for before_item in select value from jsonb_array_elements(old_payments) loop
    if not exists(select 1 from jsonb_array_elements(new_payments) e where e=before_item) then raise exception '기존 지급신청은 변경할 수 없습니다.'; end if;
  end loop;
  for request in select e from jsonb_array_elements(new_payments) e where not exists(select 1 from jsonb_array_elements(old_payments) b where b->>'id'=e->>'id') loop
    select e into s from jsonb_array_elements(settlements) e where e->>'id'=request->>'settlementId';
    if s is null or s->>'status' in ('completed','canceled','revision_required') or (s->>'settlementConfirmed')='false' or not (coalesce((s->>'settlementConfirmed')::boolean,false) or (s->'calculationSnapshot' is not null and s->'calculationSnapshot'<>'null'::jsonb) or s->>'status' in ('manager_reviewed','approval_pending','approved','payment_ready','partially_paid')) then raise exception '정산서 확정 필요'; end if;
    if not exists(select 1 from public.workspace_state w cross join lateral jsonb_array_elements(w.payload) c where workspace_id='wisevendor' and storage_key='t3_company_os_campaigns' and c->>'id'=s->>'campaignId' and request->>'campaignId'=s->>'campaignId' and (case when request->>'recipientType'='seller' then c->>'sellerId' else c->>'managerId' end)=request->>'recipientId' and (request->>'recipientType'='seller' or (c->>'managerId'<>'u-001' and c->>'managerName'<>'허윤정'))) then raise exception '공구 지급대상 연결 확인 필요'; end if;
    if (request->>'sourceVersion') is distinct from (s->>'settlementVersion') then raise exception '정산 버전이 다릅니다.'; end if;
    if request->>'recipientType' not in ('seller','manager') or request->>'recipientType' is null or coalesce(request->>'recipientId','')='' or request->>'status' not in ('approval_pending','evidence_pending') or request->>'status' is null or request->>'direction' is distinct from 'company_to_seller' or request->>'requestedBy' is distinct from actor_name then raise exception '신청 상태 또는 요청자 확인 필요'; end if;
    if coalesce((request->>'finalPaymentAmount')::numeric,0)<=0 or coalesce(request->>'bankNameSnapshot','')='' or coalesce(request->>'accountNumberSnapshot','')='' or coalesce(request->>'accountHolderSnapshot','')='' then raise exception '지급액 또는 계좌 확인 필요'; end if;
    if coalesce((s->>(case when request->>'recipientType'='seller' then 'sellerPaymentCompleted' else 'managerPaymentCompleted' end))::boolean,false) or exists(select 1 from jsonb_array_elements(old_payments) e where e->>'settlementId'=request->>'settlementId' and e->>'recipientType'=request->>'recipientType' and e->>'status' not in ('canceled','rejected','draft')) then raise exception '이미 신청 또는 지급된 대상입니다.'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(new_payments) e group by e->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(new_payments) e where e->>'status' not in ('canceled','rejected','draft') group by e->>'settlementId',e->>'recipientType' having count(*)>1) then raise exception '중복 신청은 저장할 수 없습니다.'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if r->>'storage_key' not in ('t3_company_os_payment_requests','t3_company_os_settlements','t3_company_os_campaigns','t3_company_os_withholding_tax_items','t3_company_os_payment_evidence','t3_company_os_settlement_activity_logs') or r->>'storage_key' is null or jsonb_typeof(r->'payload') is distinct from 'array' then raise exception '허용되지 않은 저장 대상'; end if;
    if not exists(select 1 from jsonb_array_elements(p_expected) e where e->>'storage_key'=r->>'storage_key') then raise exception '저장 대상 버전 누락'; end if;
    select payload into old_payload from public.workspace_state where workspace_id='wisevendor' and storage_key=r->>'storage_key';
    if r->>'storage_key' in ('t3_company_os_settlements','t3_company_os_campaigns') then
      if jsonb_array_length(old_payload)<>jsonb_array_length(r->'payload') then raise exception '일정·정산 개수 변경 금지'; end if;
      for before_item in select value from jsonb_array_elements(old_payload) loop
        if not exists(select 1 from jsonb_array_elements(r->'payload') e where e->>'id'=before_item->>'id' and (e-array['sellerPaymentRequestStatus','managerPaymentRequestStatus','updatedAt'])=(before_item-array['sellerPaymentRequestStatus','managerPaymentRequestStatus','updatedAt'])) then raise exception '정산 Snapshot·금액·일정 변경 금지'; end if;
      end loop;
    end if;
    update public.workspace_state set payload=r->'payload',deleted=false where workspace_id='wisevendor' and storage_key=r->>'storage_key';
    get diagnostics changed=row_count;
    if changed<>1 then raise exception '운영 서버 저장 실패'; end if;
  end loop;
  select jsonb_agg(to_jsonb(w)) into result from public.workspace_state w where workspace_id='wisevendor' and storage_key in (select e->>'storage_key' from jsonb_array_elements(p_rows) e);
  return result;
end $$;
revoke all on function public.payment_request_batch_commit(jsonb,jsonb) from public,anon;
grant execute on function public.payment_request_batch_commit(jsonb,jsonb) to authenticated;
