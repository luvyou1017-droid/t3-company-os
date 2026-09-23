# Operational UX v1 — completion source prepared

## Three-item completion (2026-09-20)

- Added fail-closed campaign deletion checks against normalized linked records, workspace records/history, sample-order payloads and embedded product/proposal/event links. Administrator checks, repeat inspection and updated-at conditional deletion protect stale requests. No linked record is removed by this path. Operational deletion was NOT exercised.
- Added the existing link-open time, link-close time and winner announcement fields to the schedule editor/summary, plus settlement due date and memo display. Existing snapshot objects and settlement calculations are not written.
- SKU comparison now displays existing brand/product/option/optionValues and current catalog supply costs separately from settlement conditions. This enrichment is read-only and missing values remain explicit.
- Completion tests: 15 passed; product import safety passed; settlement document 15/15; sample order 13/13. These are isolated tests, not live-data verification.
- Existing Supabase environment values are present. Read-only connectivity timed out; no operational data read or written. Browser remains unavailable as recorded below. User explicitly permits deployment after code/data-protection tests, without browser QA, for these three items.
- No product/SKU schema migration, settlement formula change, Snapshot rewrite or extra feature work.

The following is the retained earlier checkpoint for context; its three unfinished source items are superseded above.

Operating version verified: 193. Existing product automation and sample code retained.

Implemented for review:
- Campaign manager/name/dates/settlement due/memo editing. No settlement recalculation, proposal snapshot rewrite, or sales-import update on schedule save.
- Removed automatic pre-August campaign deletion on list mount. Added soft-delete metadata (`deletedAt`, `deletedBy`) and same-ID restore from trash.
- Settlement query/brand/manager/period preferences retained in session storage; approval-pending display includes recipient request states.
- Seller account editor isolates keystrokes from parent settlement validation, guards duplicate saves, and falls back to single-seller lookup rather than loading every seller. Preserves recipient metadata.
- Manual quantity/conditions table with selected-row commission updates via existing save handlers. Revision dialog bulk commission uses existing preview/save path.
- Upload SKU selection and comparisons shown in one table; previous connections highlighted without changing their IDs.
- Product-list pending scroll restoration canceled on unmount.
- KPI filters direct seller / vendor supply / unknown per campaign direction; vendor subtotal display. No counterparty role inferred from name parentheses.

Unfinished / not proven:
- Permanent deletion intentionally not enabled: authoritative linked-history checks are still required. Trash restore is implemented.
- Not all optional campaign registration fields exposed yet (link hours, winner announcement, etc.).
- Full SKU detail-option and registered supply-cost display still needs completion; missing supply cost is explicitly shown as requiring review.
- Actual UI, operational-record round trips, account-save latency, first-click behavior, search/scroll restoration and snapshot immutability have NOT been tested in browser.

Verification:
- TypeScript/Vite build passed before final cleanup; rerun before source commit.
- Existing product-import safety passed.
- Existing settlement-document checks passed 15/15.
- Existing sample-order isolated checks passed 13/13.
- Preview server started, but supported browser URL failed with ERR_BLOCKED_BY_CLIENT. No alternate host or network bypass attempted.
- No operational data was edited, no DB migration, no product schema or calculation changes, no deployment.

Resume only this scope. Finish remaining UI items, obtain working authorized browser verification, test against existing records safely, then deploy the existing Site. Do not represent isolated fixture tests as live-data verification.
