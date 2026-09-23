# Workflow 5 · manager access pending

Base: operating version 194, commit 5a7e452. No SQL has been applied.
The operational QA backlog, product/SKU, sample policies and settlement snapshots are out of scope.

## Implemented independently

- Supplier request modal with existing supplier-document arithmetic reused unchanged.
- Explicit manual supplier offsets applied only when pre-offset amount matches and direction is supplier → company.
- Ambiguous deductions displayed individually with final total requiring review; no guessed signs or double deduction.
- Vendor/company comparison toggle and read-only workflow labels.
- Supplier name and detail option labels are current product references, explicitly labeled; all monetary values remain settlement values.

## Evidence and limitation

Repository SQL was inspected; live pg_policies was NOT accessible. These are candidate policy changes, not a claim about active production policy state.
Existing URL/anon configuration exists; the latest connection attempt failed. No new project/key is needed.

## Smallest safe policy work to verify on the existing project

1. `docs/SUPABASE_SCHEMA.sql`: `phase1 authenticated read settlements`, equivalent policies for `sales_data_imports`, `sales_data_rows`, `settlement_adjustments`, `seller_settlements`, `payment_requests`, `payment_request_batches`, `payment_evidence`, `withholding_tax_items`, `activity_logs` allow broad approved-user reads. Preserve privileged ceo/admin/settlement_cs access; scope manager reads by authenticated profile UUID and actual campaign/recipient relation. Do not authorize by display-name equality. Verify legacy manager IDs explicitly before enabling access.
2. `authenticated campaigns read` also needs review because campaign metadata can contain financial snapshots and payment state. A manager must not obtain other managers' financial payload through campaign or export routes.
3. `docs/WORKSPACE_SYNC.sql`: `approved company users read workspace state` exposes company-wide JSON arrays, including settlements, versions, rows, payment requests and campaigns. A row-level predicate cannot filter elements within a JSON array. Merely adding `manager_id = auth.uid()` to normalized tables is insufficient. Financial workspace entries must be privileged-only, with an authenticated server RPC that projects only the caller's own rows for managers. Audit history read policies and all existing security-definer RPCs as well.
4. Workspace insert/update policies currently allow whole-array writes by approved staff. Managers must not use those routes to submit payment requests or overwrite other requests. An authenticated RPC must validate ownership, confirmed settlement version, existing payout calculation, duplicate status and evidence/account requirements; submit a selected batch transactionally. Manager IDs and monetary amounts must not be trusted from client input. Preserve existing representative approval handling.
5. Preserve administrator/representative full reads. Reuse existing role predicates where present. Review *all* applicable permissive policies: PostgreSQL ORs them, so adding a narrow permissive policy alone does not remove a broad grant.
6. Verify manager A/B/admin sessions against direct REST, RPC, ID changes, workspace arrays, history and exports; confirm approved snapshot JSON and financial totals unchanged. No policy should be deployed before these checks and the compatible manager data loader are ready.

## Required access / user action

No action is needed for the independently deployed document changes. To continue the manager tab, an authorized connection to the existing Supabase project's policy/schema management is needed. Alternatively, an administrator can provide the relevant schema/pg_policies read-only export for a precise migration, then apply the reviewed migration in that existing project. Do not apply the old full schema script, disable RLS or share passwords/service-role keys in chat.

Manager tab, bulk manager payment requests and server policy migration remain NOT implemented and NOT deployed.
