# Payment / supplier document follow-up

Base: v200, 7c9a37c. Scope only requested settlement/payment/tax/KPI/sales-list/supplier-document/OrderHub parser.

- Reused v200 common seller payout calculation, withholding request linkage, payment-screen accounting and account text. No second implementation or data migration. Added visibility for saved withholding-evidence requests with conflicting business type (review required, no silent reclassification), plus direct links to other attribution months to prevent a current-month filter from concealing applications. An isolated Idasol-named request verifies generic listing; this is not a live DB record.
- KPI selector now contains only seller-direct and vendor supply. Existing direction resolver reused; unknown/conflicting records remain unchanged and are excluded from totals, separately listed only for admin/CEO/settlement staff correction. Existing new-campaign seller default and vendor toggle already present and unchanged.
- Existing sales thresholds (under 10m 50%, under 20m 60%, otherwise 70%) remain. A valid computed share no longer requires a manual checklist flag at preparation/review/approval. New/unconfirmed checklists reflect automatic verification; historical calculation snapshots untouched.
- Sales table replaces seller column with source label and removes net-sales column (retained in detail). Source uses saved file origin/parser format/manual status; no inference from selling-link owner. OrderHub parser records detected format name in existing analysis field.
- Supplier modal exports a separate external DOM subtree through the existing PNG/clipboard helper. Company identity/tax email/bank use existing company profile. Internal DB commentary removed. Ambiguous/internal adjustment reference table remains outside exported subtree. Unknown final amounts remain visibly unknown; no invented financial amounts.

Verification:
- runSellerPayoutCorrection: 10 pass (343890 -> simplified312627; income9370; local930; freelancer302327; request/ledger/Excel; snapshots).
- test:settlement-document:15 pass.
- runOrderHubSettlementReport: actual supplied Juwangsan workbook:3 options,31 units,883386 supplier product amount; explicit TEST18% produces1077300 customer sales; missing rate requires confirmation.
- runPaymentUxVerification: same real file -> actual matching services with isolated synthetic pre-existing SKUs -> sales validation/confirmation -> settlement draft. IDs/catalog/sentinel historical snapshot unchanged. Two KPI classifications plus unresolved protection, source labels, share thresholds/manual gate bypass, supplier server-rendered external company/bank and internal-sentinel exclusion checked.

Limits: no live Harusalim or Idasol record was retrieved/changed. No authenticated production browser clipboard/PNG, production Storage, or live Supabase row verification. File workflow uses in-memory repositories and explicit test commission terms, not verified real campaign conditions. No operating data writes, no SQL migration, no RLS edits.
