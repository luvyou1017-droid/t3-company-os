# T3 Company OS DB Schema

## Purpose

This document defines the initial database schema direction for T3 Company OS.

T3 Company OS is an operating system for group-buying companies. The database should support operational automation, not simply reproduce a Notion workspace on the web.

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
