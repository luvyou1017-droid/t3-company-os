# T3 Company OS DB Schema

## Purpose

This document defines the initial database schema direction for T3 Company OS.

T3 Company OS is an operating system for group-buying companies. The database should support operational automation, not simply reproduce a Notion workspace on the web.

## Supabase Phase 1 Mapping

실제 연결 1단계의 실행 가능한 초안은 `docs/SUPABASE_SCHEMA.sql`과 `docs/SUPABASE_PHASE_1.md`에 있다. 이번 단계는 기존 스키마 방향을 삭제하지 않고 다음 현재 TypeScript/localStorage 도메인을 Supabase에 매핑한다.

| TypeScript/Local domain | Supabase table |
| --- | --- |
| Mock users | `profiles` |
| `Campaign` | `campaigns` |
| `Settlement` | `settlements` |
| 셀러 정산 규칙·문서 | `seller_settlements` |
| `PaymentRequest` | `payment_requests` |
| `PaymentRequestBatch` | `payment_request_batches` |
| `PaymentEvidence` metadata | `payment_evidence` |
| `WithholdingTaxItem` | `withholding_tax_items` |
| 운영 변경 이력 | `activity_logs` |
| `ProductMaster` | `product_masters` |

증빙 원본은 private `payment-evidence` Storage bucket에 저장하며 DB에는 bucket/path와 파일 메타데이터만 저장한다. Local legacy ID는 migration provider에서 결정적 UUID로 변환하고 전체 기존 객체는 `metadata`에 보존한다. Supabase 환경변수가 없으면 기존 localStorage가 계속 단일 데이터 소스로 동작한다.

The schema is designed around `campaigns` as the core entity. CS, samples, sales data, settlement, payment, AI recommendations, and user work items should all connect back to a campaign whenever possible.

## Schema Principles

- Start with mock data in the UI.
- Connect the database only after the UI and workflow are validated.
- Keep `campaigns` as the center of operational data.
- Store business events as structured records, not free-form memo fields.
- Separate customer-sensitive data from general operational data where possible.
- Keep files in storage and save only metadata and storage paths in the database.
- Prefer status fields, timestamps, and audit logs for operational traceability.

## Entity Map

```text
users
  └─ work_items

campaigns
  ├─ campaign_members
  ├─ campaign_products
  ├─ cs_cases
  │   ├─ cs_attachments
  │   └─ cs_activity_logs
  ├─ samples
  ├─ sales_data
  ├─ settlements
  │   └─ settlement_items
  ├─ payments
  └─ ai_recommendations
```

## Common Columns

Most tables should include:

- `id`: primary key
- `created_at`: created timestamp
- `updated_at`: updated timestamp

Operational tables should also include:

- `created_by`: user id that created the record
- `updated_by`: user id that last updated the record
- `campaign_id`: campaign id when the record belongs to a campaign

## Tables

### product_masters

Campaign이 참조하는 상품 기본 조건이다. Campaign 저장 시 현재 상품값은 별도 snapshot으로 보존하며 이후 마스터 수정이 기존 Campaign 계산에 소급 적용되지 않는다.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `product_code` | text | Unique internal product code |
| `brand_id` | uuid/text | Brand master reference |
| `active` | boolean | Active status; deactivate instead of destructive deletion |
| `metadata` | jsonb | Product price, commission, link, PG, shipping and operation policy |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

`metadata`에는 `regularPrice`, `salePrice`, `supplyPrice`, `shippingFee`, `freeShippingThreshold`, `totalCommissionRate`, `sellerCommissionRate`, `companyCommissionRate`, `defaultSalesChannelType`, 링크별 사용 가능 여부, 브랜드 PG 지원 여부·1~5% 지원율, 배송 정책, 샘플·운영 참고 정보, `version`을 저장한다. 브랜드 PG 지원율과 Campaign의 실제 셀러 추가 PG 지급률은 별도 값이다.

### users

Internal staff accounts.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `name` | text | Display name |
| `email` | text | Unique login email |
| `role` | text | Admin, manager, operator, finance, cs |
| `is_active` | boolean | Account status |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### campaigns

Core campaign table. All major operational records should connect to this table.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_code` | text | Unique internal campaign code |
| `title` | text | Campaign name |
| `brand_name` | text | Brand or partner name |
| `channel_name` | text | Sales or influencer channel |
| `status` | text | draft, preparing, active, closed, settled |
| `start_date` | date | Campaign start date |
| `end_date` | date | Campaign end date |
| `owner_id` | uuid | Main owner, references `users.id` |
| `memo` | text | Internal memo |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### campaign_members

Users assigned to each campaign.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `user_id` | uuid | References `users.id` |
| `role` | text | owner, cs, sales, settlement, payment |
| `created_at` | timestamptz | Created timestamp |

### campaign_products

Products sold in a campaign.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `product_name` | text | Product name |
| `option_name` | text | Product option |
| `sku` | text | Internal SKU |
| `sale_price` | numeric | Sale price |
| `cost_price` | numeric | Cost price |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### work_items

My Work tasks generated manually or automatically.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id`, nullable only for global tasks |
| `assignee_id` | uuid | References `users.id` |
| `source_type` | text | manual, cs, sample, settlement, payment, ai |
| `source_id` | uuid | Source record id |
| `title` | text | Task title |
| `status` | text | todo, in_progress, done, canceled |
| `priority` | text | low, normal, high, urgent |
| `due_at` | timestamptz | Due date and time |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### cs_cases

Customer service cases.

Do not create an order number column unless the workflow is validated and the data source is confirmed.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `customer_name` | text | Customer name, access-controlled |
| `customer_contact` | text | Phone or email, access-controlled |
| `category` | text | delivery, refund, exchange, product, payment, etc. |
| `title` | text | CS summary |
| `content` | text | Original CS content |
| `status` | text | received, reviewing, waiting, resolved, closed |
| `priority` | text | low, normal, high, urgent |
| `assignee_id` | uuid | References `users.id` |
| `due_at` | timestamptz | Response or resolution deadline |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### cs_attachments

CS file metadata. Store actual files in private storage.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `cs_case_id` | uuid | References `cs_cases.id` |
| `file_name` | text | Original file name |
| `file_type` | text | MIME type |
| `file_size` | integer | File size in bytes |
| `storage_bucket` | text | Example: `cs-attachments` |
| `storage_path` | text | Private storage path |
| `created_at` | timestamptz | Created timestamp |

### cs_activity_logs

CS history and audit log.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `cs_case_id` | uuid | References `cs_cases.id` |
| `actor_id` | uuid | References `users.id` |
| `action` | text | created, status_changed, assigned, replied, resolved |
| `before_value` | jsonb | Previous value |
| `after_value` | jsonb | New value |
| `created_at` | timestamptz | Created timestamp |

### samples

Product sample requests and tracking.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `recipient_name` | text | Recipient or channel owner |
| `product_id` | uuid | References `campaign_products.id` |
| `status` | text | requested, preparing, shipped, received, canceled |
| `tracking_number` | text | Delivery tracking number |
| `sent_at` | timestamptz | Sent timestamp |
| `received_at` | timestamptz | Received timestamp |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### sales_data

Campaign sales metrics and imported sales rows.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `product_id` | uuid | References `campaign_products.id` |
| `sales_date` | date | Sales date |
| `quantity` | integer | Sold quantity |
| `gross_amount` | numeric | Gross sales amount |
| `discount_amount` | numeric | Discounts |
| `refund_amount` | numeric | Refund amount |
| `net_amount` | numeric | Net sales amount |
| `source_file_name` | text | Imported file name |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### settlements

Settlement summary for a campaign.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `status` | text | draft, reviewing, confirmed, paid |
| `total_sales_amount` | numeric | Total sales |
| `total_cost_amount` | numeric | Total cost |
| `total_fee_amount` | numeric | Platform or channel fees |
| `settlement_amount` | numeric | Final settlement amount |
| `reviewed_by` | uuid | References `users.id` |
| `reviewed_at` | timestamptz | Review timestamp |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### settlement_items

Line items used to calculate settlement.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `settlement_id` | uuid | References `settlements.id` |
| `item_type` | text | sales, refund, fee, cost, adjustment |
| `description` | text | Line item description |
| `amount` | numeric | Positive or negative amount |
| `created_at` | timestamptz | Created timestamp |

### payments

Payment execution and confirmation records.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `settlement_id` | uuid | References `settlements.id` |
| `payee_name` | text | Payee name |
| `amount` | numeric | Payment amount |
| `status` | text | pending, scheduled, paid, failed, canceled |
| `scheduled_at` | timestamptz | Scheduled payment time |
| `paid_at` | timestamptz | Paid timestamp |
| `created_at` | timestamptz | Created timestamp |
| `updated_at` | timestamptz | Updated timestamp |

### ai_recommendations

AI-generated recommendations, classifications, and review results.

AI supports work but does not replace human judgment. Store AI output as recommendations that users can review and accept.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `campaign_id` | uuid | References `campaigns.id` |
| `source_type` | text | cs, settlement, payment, sales, sample |
| `source_id` | uuid | Source record id |
| `recommendation_type` | text | classify_cs, next_action, settlement_review, risk_check |
| `title` | text | Recommendation title |
| `content` | text | Recommendation details |
| `confidence` | numeric | 0 to 1 confidence score |
| `status` | text | pending, accepted, dismissed |
| `reviewed_by` | uuid | References `users.id` |
| `reviewed_at` | timestamptz | Review timestamp |
| `created_at` | timestamptz | Created timestamp |

## Access and Privacy

- Customer contact fields must be access-controlled.
- CS attachments must use private storage.
- Signed URLs should have short expiration times.
- AI outputs should not expose restricted customer data to users without permission.
- Deletion policies must account for legal retention and customer deletion requests.

## Implementation Order

1. Validate screens and workflows with mock data.
2. Finalize the minimum campaign-centered entity model.
3. Create tables for `campaigns`, `users`, and `work_items`.
4. Add feature-specific tables in this order: CS, Sample, Sales Data, Settlement, Payment, AI Assistant.
5. Add audit logs and access control policies.
6. Connect UI services to the database after each workflow is validated.

## Campaign Creation V2 확장

기존 `campaigns.product_id/product_name`, 수수료 필드와 링크 호환 컬럼은 유지한다. 신규 생성 데이터는 다음 관계와 snapshot을 metadata 또는 향후 전용 테이블로 확장한다.

### campaignProducts

Campaign 하나에 여러 상품을 표시 순서와 함께 연결한다. 첫 번째 상품은 기존 대표 `product_id/product_name`에도 저장한다.

- campaignId
- brandId / brandName
- productId / productName
- quantity
- displayOrder

### proposal snapshot

Campaign 저장 시 상품 master의 정상가, 공구가, 배송비, 공급가, 총·셀러·추가 지원·최종·회사 수수료율, 기타 조건, sourceVersion과 capturedAt을 저장한다. master 변경으로 기존 제안 조건을 자동 변경하지 않는다.

### campaignEvents

이벤트는 Campaign에 여러 건 연결한다. payer, eventType, 대상/제공 상품, 단가, 예정·확정 수량, 예상·확정 총액, 기간, 메모와 단가 override 상태를 저장한다.

### settlementDueDate override

기본 정산 예정일은 종료일+21일이다. 사용자가 수정하면 `settlementDueDateOverridden=true`를 저장해 종료일 변경 시 자동 덮어쓰지 않는다.

### Notion import metadata

Mock 단계에서는 provider, sourceId, importedAt만 저장한다. 실제 token은 저장하지 않으며 서버 또는 Edge Function adapter를 사용한다.

### AI draft metadata

적용된 Mock 초안의 provider, prompt, confidence와 appliedAt을 기록한다. AI 결과는 자동 저장하지 않고 사용자 검토와 상품 master 매칭 후 적용한다.

## Campaign Creation master defaults

### sellers

- `business_type`: `general_business`, `simplified_business`, `freelancer`. Campaign 등록 시 seller master에서 읽으며 미등록이면 생성을 차단한다.
- `default_md_id`
- `default_manager_id`

### product sales link policy

- `default_sales_channel_type`: `supplier_link`, `wise_shop_link`, `seller_checkout`
- `wise_shop_available`: boolean
- `seller_checkout_available`: boolean
- `brand_pg_support_available`: boolean
- `brand_pg_support_rate`: nullable numeric, 지원할 때만 1~5

와이즈샵과 셀러 결제창 사용 가능 여부는 독립 저장한다. 기본 링크는 반드시 해당 상품에서 사용 가능한 값이어야 한다. 브랜드 PG 지원이 없으면 지원율은 null이어야 한다.

### campaign link and PG decision

- `sales_channel_type`: 실제 Campaign에서 선택한 링크
- `sales_channel_source`: `product_default`, `manual`, `mixed_products`
- `sales_channel_manually_overridden`: boolean
- `seller_extra_pg_rate`: 이번 Campaign에서 셀러에게 실제로 추가 지급하는 비율

`brand_pg_support_rate`는 브랜드의 회사 지원 조건이고 `seller_extra_pg_rate`는 실제 셀러 지급 조건이므로 별도 저장한다. Campaign 생성 snapshot에는 상품별 기본 링크, 링크 가용성, 브랜드 PG 지원, 실제 선택 링크, 셀러 기본·추가·최종 수수료, 총·회사 수수료와 배송비를 보존한다.
