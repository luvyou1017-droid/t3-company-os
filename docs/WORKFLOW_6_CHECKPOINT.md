# Workflow 6 · migration applied, live link verification pending

## 2026-09-20 production migration follow-up
- Original implementation commit d1738f0 remains unchanged. No application source edits in this follow-up.
- Authenticated Supabase dashboard via secure GitHub sign-in. Confirmed existing production project eumvguklgapvwqjwxzof matches the existing deployment configuration.
- Applied ACCOUNTING_WORKFLOW_6.sql verbatim after preflight confirmed required profiles columns, no pre-existing 6th-phase objects, and private seller-documents bucket. SQL returned success. Confirmed two RLS-enabled tables and three functions. Do not rerun the migration blindly: policies now exist.
- Executed a transaction with existing CEO and MD profile contexts under authenticated role, plus anon role. Verified CEO month close/report/paid/reopen, frozen amount retention, stale revision rejection, closed-month write rejection; MD cannot read the test accounting rows or invoke accounting writes; anon cannot read either new table or call the share RPC. Share metadata interval verified as 14 days. Test transaction rolled back; both new tables were confirmed empty afterward.
- These are database role-context tests, not separate browser logins. Existing policies were not changed. Existing seller-documents SELECT policy still allows approved staff; manager-policy redesign remains deferred.
- Uploaded synthetic workflow6-expiry-test.png (no customer data) to seller-documents and generated a 14-day signed link through Storage UI. Exact image loaded (400px width). The synthetic file remains for follow-up; no existing files were changed/deleted.
- Custom fractional-day expiry attempts did not yield a distinct signed link. Navigating with an altered object path returned browser ERR_BLOCKED_BY_CLIENT, not an inspectable Supabase rejection. Therefore actual expired-token rejection and cross-object server rejection remain UNVERIFIED.
- App-level real-data monthly list/Excel/share generation/payout persistence verification remains outstanding. No production payouts or historical snapshots were changed. Operating version remains 195; no deployment performed.

Base operating version: 195, commit 1c5547d. Workflow 5 and both deferred backlogs remain unchanged.

## Source changes
- Settlement > withholding management: existing freelancer request/tax records, attribution-month filter, same-data XLSX export.
- Existing calculateWithholding is untouched. No tax/legal rule changes. No historical backfill or resynchronization is run.
- Separate monthly closing snapshot, revision guard, immutable closed amounts, administrator-only reopen with previous snapshots retained in history.
- Single payout completion now stores actualPaidAmount alongside existing completedAt/completedBy/status. Existing completed records remain untouched.
- Seller-only settlement PNG, stored in existing private seller-documents bucket, random object path, signed server token with 14-day validity; existing message generation reused. Link records contain creation/expiry and the signed URL. No view tracking is implemented.

## Database migration required before publication
`docs/ACCOUNTING_WORKFLOW_6.sql` adds two isolated tables and three restricted RPCs. It does not change existing policies, manager-tab permissions, product/SKU/sample data or settlement snapshots. SQL was applied to the existing production project in the follow-up above.
Monthly snapshots freeze the accounting report, not the original operational records. New requests or later payout changes are shown as a mismatch requiring administrator review, never silently replacing the closing snapshot.
Only accounting roles can read these new tables or use RPCs. Direct table writes are revoked. Reopening is restricted to ceo/admin.

## Validation / remaining gates
Local formula regression, row joins, export round-trip, immutable input and boundary tests are provided in scripts/runWorkflow6.mjs. Static policy checks are not a substitute for executing SQL and testing RLS.
Verified locally: production build passed; Workflow 6 checks 23/23 passed; settlement document regression 15/15 passed. The existing settlement-payout runner stopped before scenarios because its expected settlement dummy fixtures were absent. No production fixtures were inserted to bypass that failure.
Still required: application-level real-data verification and live different-object/expired-token rejection. CEO/MD/anon database role tests passed as described above; admin/settlement_cs/manager browser sessions were not tested.
Do not deploy as complete until these gates pass. Do not disable RLS or use browser-only expiry. Downloaded images cannot be recalled after a link expires; the online object URL is what the server protects.
