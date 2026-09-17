-- T3 협력 벤더 카탈로그 권한 확장
-- Supabase SQL Editor에서 검토 후 실행하세요.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('ceo','settlement_cs','team_lead','md','manager','admin','partner_vendor'));

-- 협력 벤더는 관리 화면의 products 원본을 직접 조회할 수 없어야 합니다.
drop policy if exists "phase1 authenticated read products" on public.products;
create policy "phase1 internal read products" on public.products
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid()
    and p.active
    and p.approval_status = 'approved'
    and p.role in ('admin','ceo','settlement_cs','team_lead','md','manager')
));

-- 승인된 협력 벤더와 내부 관리자만 호출할 수 있는 카탈로그 전용 조회 함수입니다.
-- 반환값에는 공급가와 판매 참고가만 포함합니다.
-- 셀러 수수료·총수수료·회사 마진·내부 메모는 원본 행에서 꺼내지 않습니다.
create or replace function public.list_partner_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.active
        and profile.approval_status = 'approved'
        and profile.role in ('partner_vendor', 'admin', 'ceo')
    ) then coalesce((
      select jsonb_agg(item.payload order by item.updated_at desc)
      from (
        select
          product.updated_at,
          jsonb_build_object(
            'id', product.id::text,
            'brandName', coalesce(product.metadata ->> 'brandName', ''),
            'productName', product.product_name,
            'category', coalesce(product.metadata ->> 'category', product.category[1], ''),
            'representativeImageUrl', coalesce(product.metadata ->> 'representativeImageUrl', product.metadata ->> 'imageUrl'),
            'productUrl', coalesce(product.metadata ->> 'productUrl', product.landing_page_url),
            'description', coalesce(product.metadata ->> 'partnerDescription', product.metadata ->> 'sellerDescription'),
            'shippingGuide', coalesce(
              product.shipping_policy,
              case
                when coalesce((product.metadata ->> 'shippingFee')::bigint, 0) = 0 then '무료배송'
                else '배송비 ' || (product.metadata ->> 'shippingFee') || '원'
              end
            ),
            'minimumOrder', product.metadata ->> 'partnerMinimumOrder',
            'supplyNote', product.metadata ->> 'partnerSupplyNote',
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', coalesce(sku ->> 'id', product.id::text),
                'optionName', coalesce(sku ->> 'optionName', product.product_name),
                'groupBuyPrice', coalesce(nullif(sku ->> 'groupBuyPrice', '')::bigint, product.group_buy_price, 0),
                'supplyPrice', coalesce(nullif(sku ->> 'supplyPrice', '')::bigint, product.supply_price, 0),
                'stockStatus', coalesce(sku ->> 'stockStatus', 'available')
              ))
              from jsonb_array_elements(coalesce(product.metadata -> 'skus', '[]'::jsonb)) sku
              where coalesce(nullif(sku ->> 'active', '')::boolean, true)
            ), jsonb_build_array(jsonb_build_object(
              'id', product.id::text,
              'optionName', product.product_name,
              'groupBuyPrice', coalesce(product.group_buy_price, 0),
              'supplyPrice', coalesce(product.supply_price, 0),
              'stockStatus', 'available'
            ))),
            'managerName', coalesce(product.metadata ->> 'managerName', '와이즈벤더 담당자'),
            'managerContact', product.metadata ->> 'managerContact'
          ) as payload
        from public.products product
        where product.active
          and coalesce(nullif(product.metadata ->> 'partnerPortalVisible', '')::boolean, false)
      ) item
    ), '[]'::jsonb)
    else '[]'::jsonb
  end;
$$;

revoke all on function public.list_partner_catalog() from public;
grant execute on function public.list_partner_catalog() to authenticated;
