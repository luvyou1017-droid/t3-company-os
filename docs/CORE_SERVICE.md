# Core Service Architecture

## Campaign-Centered Data

T3 Company OS uses `Campaign` as the center of operational data.

CS, samples, work items, notifications, sales data, settlement, payment, and AI recommendations should be traceable to a campaign whenever possible. This keeps each screen connected to the same operational context instead of duplicating campaign names across unrelated mock data.

## Common Type Structure

Common shared types live in `src/shared/types/`.

- `campaign.ts`: shared `Campaign`, `CampaignSummary`, and related count types
- `cs.ts`: base CS entity fields including `campaignId`, `caseNumber`, `assigneeId`, `status`, and `priority`
- `sample.ts`: base sample entity fields including `campaignId`, `managerId`, `orderManagerId`, `status`, `costOwner`, and `settlementReflected`
- `work.ts`: work item source fields including `campaignId`, `sourceType`, `sourceId`, `assigneeId`, `status`, and `dueAt`
- `notification.ts`: notification relation fields including `campaignId`, `relatedType`, `relatedId`, `recipientId`, and `isRead`

Existing feature types are still preserved for UI compatibility. They are being extended gradually with shared fields instead of being deleted or rewritten.

## Service Layer Structure

Core services live in `src/shared/services/`.

- `campaignService.ts`: reads campaign data and related counts
- `csService.ts`: reads, creates, updates, and completes CS cases
- `sampleService.ts`: reads, creates, and updates sample requests
- `workService.ts`: reads, creates, completes, and syncs work items from source records
- `notificationService.ts`: reads, creates, and marks notifications as read
- `storageService.ts`: owns localStorage read/write/reset behavior

Feature-level service files still exist as compatibility wrappers so existing page imports do not need a broad rewrite.

## localStorage Structure

New prototype storage keys are:

- `t3_company_os_campaigns`
- `t3_company_os_cs_cases`
- `t3_company_os_samples`
- `t3_company_os_work_items`
- `t3_company_os_notifications`

The storage service also reads legacy prototype keys as fallback:

- `t3.cs.cases`
- `t3.samples`
- `t3.work.items`
- `t3.notifications`

All JSON parsing happens inside `storageService`. If parsing fails, the service restores the provided mock fallback so the UI does not break.

## CS and Work Item Flow

When a new CS case is created through `csService.createCsCase()`:

1. The CS case is saved with `campaignId`.
2. `workService.syncWorkItemFromSource('cs', csCase)` creates the connected Work Item.
3. `notificationService.createNewCsNotification(csCase)` creates the assignee notification.

When a CS case is completed through `csService.updateCsCase()`:

1. The CS case status is saved.
2. The connected Work Item `work-{csCase.id}` is completed.
3. The related notification is marked as read.

## Sample and Work Item Flow

When a new sample is created through `sampleService.createSample()`:

1. The sample is saved with `campaignId`.
2. A sample order Work Item is created.
3. A sample notification is created.

When a sample status changes to `발주 완료`:

1. The sample is saved.
2. The connected sample order Work Item is completed.

When a sample status changes to `정산 반영 대기`:

1. The sample is saved.
2. A settlement review Work Item is created.

## Supabase Replacement Point

Supabase should be connected after the UI and workflow are validated.

The first replacement targets should be:

- `storageService.ts`
- `campaignService.ts`
- `csService.ts`
- `sampleService.ts`
- `workService.ts`
- `notificationService.ts`

Pages and components should continue calling services instead of calling Supabase or localStorage directly.

## Current Technical Debt and TODO

- Sales Data, Settlement, Payment, and AI Assistant still need the same shared service pattern.
- Some global My Work items do not belong to a real campaign and currently use `GLOBAL-*` IDs.
- Campaign Detail still has placeholder tabs for Sales Data, Settlement, and History.
- Existing mock records keep display fields such as `campaignName`, `sellerName`, and `brandName` for UI compatibility.
- Notification navigation is prepared through `relatedType` and `relatedId`, but deep-link routing can be improved later.
- A future migration should remove legacy `t3.*` storage keys after prototype data is no longer needed.
