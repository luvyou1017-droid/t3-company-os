# 운영 검증 수정 통합 1차 — base 196

## Implemented scope
- Legacy detail-option suggestions require explicit acceptance and normal save; no ID regeneration.
- Debounced settlement search (250ms local input), pre-confirm campaign manager editor, evidence-only supply classification, end-day age/sort, existing-state settlement stage display.
- Sales all/month filtering and nine-column layout.
- Quick SKU identity search is not cleared by cost/vendor edits; persisted SKU is re-read. Sample-only flags use existing JSON metadata and retain IDs on promotion.
- Vendor/unspecified sample target without fake seller, later existing-seller attachment preserves delivery/cost snapshot.
- Approved pending samples selectable, separate internal and Baljumoa exports; existing reservation CAS prevents duplicate dispatch.
- Exact supplied Supply template, 28 unchanged columns. Only A/B/D/E/F/G/I/K/L/M filled. Optional orderer values default to recipient; postcode blank. Tests compare untouched ZIP XML members.
- Existing original Excel reused. New seller exports use a column allowlist and fresh workbook, exclude internal sheets/fields/formulas/comments. Without order original, explicitly labelled aggregate export.
- Confirmation generates a safe Excel and 14-day Storage signed URL; failure preserves confirmation with retry error. Revision/release invalidates this feature's tracked generated file; originals remain. Existing PNG detail-link flow is unchanged.

## Data changes
No SQL migration, new table, new project or bulk updates. Optional fields added to existing JSON: product/SKU sampleOnly; sample target/orderer fields; sales import sellerExcelExport. No settlement calculation or historical Snapshot schema changes.

## Verification
- TypeScript/Vite production build: pass.
- scripts/runOperationalUxIntegration.mjs: 10 isolated integration checks pass, in-memory product repository and mocked Storage, synthetic samples. Includes exact template two rows, internal-information exclusion, 14-day TTL request, replacement restricted to generated artifacts, IDs and snapshots, duplicate dispatch.
- Existing sample checks: 13 pass; product import safety and Notion seller safety pass; settlement document checks 15 pass.
- Existing settlement payout test fails at runSettlementPayoutFlow.mjs:313 due to missing withholding test fixture. Same error reproduced at unchanged base f238c62 in detached worktree; unrelated code left untouched.
- git diff --check: pass.

## Incomplete / limits
- Item16 Monday proposal incremental automation: no configured schedule/source scope found in relevant code, task list or prior records. Exact source proposal Drive folder/DB URL is required; no fabricated job or full rescan created.
- Managed browser preview blocked by ERR_BLOCKED_BY_CLIENT. Live UI, authenticated production SKU writes/Storage policy and actual Baljumoa importer were not tested. No production test records written.
- Historical raw-original links issued before this feature have no tracked revocation record; not claimed revoked. The existing 6th-phase PNG link flow is unchanged. New generated Excel replacement/TTL tested with mocked Storage; live expiry/cache behavior remains unverified.
- Quick SKU observed code cause: cost/vendor input reset selection; version-column source and read-after-write also hardened, not claimed reproduced against live DB.
- Deferred 7th-phase sample policy/history/conditional settlement intentionally unchanged.
