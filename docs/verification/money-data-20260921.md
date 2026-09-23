# Money/data accuracy — base production 202

## Implemented
- Supplier outbound payment uses explicitly reviewed `supplierPayment.lines[].companySupplyPrice` × net quantity, plus `shipping.supplier`, plus signed adjustments. Only `currentTradeTerms.companySupplyPrice` is offered from SKU; legacy generic supplyPrice, seller price, sales×rate and original file totals are not fallback company costs.
- Shipping seller/company burdens and supplier payable amount are separate fields. Original 88,000 is not automatically assigned. Missing company cost or supplier shipping is unknown, not zero. User can confirm zero shipping.
- Adjustment kinds: sample, prepayment, return/cancel, shipping, other offset, additional payment. Saved per settlement; confirmed records cannot be edited. Existing confirmed legacy documents retain prior arithmetic. Supplier-link incoming commission unchanged.
- Supplier terms copied into subsequent settlement version records. Existing versions are not rewritten.
- Seller profile saves merge omitted fields, preserve unknown metadata and reject concurrent updates. Account saves reload existing master, update only the selected business, preserve the root account for non-primary businesses. Payment creation awaits account persistence and snapshots the selected business account.
- Sales list hides only explicitly deleted campaign placeholders with no file, source analysis, manual entry, rows, quantity, amount or settlement. No source record is deleted. Restoring campaign reveals same ID. Missing campaigns alone do not trigger deletion.

## Verification
Passed: runSupplierPaymentSafety (explicit cost/missing data/stale SKU/quantity/signed adjustment/legacy/confirmed write guard); runSellerAccountPreservation (isolated local); runDeletedPlaceholderSafety (isolated local); runSellerCheckoutRegression (actual supplied workbook, reviewed prices provided by user, not live SKU DB); runSellerPayoutCorrection (10 in-memory tests); runNotionSellerSync (model tests); runOperationalUxIntegration (10 mocked integration tests including template/SKU); verifyBaljumoaGeneratedFile (write actual XLSX to disk and reopen); production build.

Baljumoa exact template: Supply sheet, 28 unchanged columns. A sample ID, B order date, D orderer name, E orderer phone, F recipient, G recipient phone, I address, K product, L option/detail, M quantity. H postcode blank. Non-data ZIP XML/styles preserved; two generated rows reopen successfully. TEST file not submitted as a real order.

## NOT verified in production
No authenticated Supabase session or compatible DB connector available in this execution context. Existing public configuration is not permission to bypass RLS. No production records were written for tests.
- Actual Harusalim/Idasol payment→withholding records and approval screen: unverified, automatic linkage code unchanged.
- 411 Notion vs 45 T3: actual counts and import history unverified. Code preview does not insert sellers; apply requires decisions and reloads existing sellers. T3 query has no 45-row limit. This is not proof that 411 were only previewed. No bulk import performed.
- Quick SKU: mocked service save/requery/duplicate protection passes; live DB save and browser return/autoselection unverified. No speculative quick SKU fix.
- Baljumoa external upload acceptance: unverified, no external authenticated importer available. Export remains distinct from sales file parsing.
- Actual supplier payment for Juwangsan: cannot determine company cost or whether 88,000 is supplier payable from summary alone; explicit review still required.

## Data and deployment
No SQL migration/new project. Optional fields in existing settlement/version JSON; existing seller metadata retained. No historic settlement/SKU/Notion records mass-changed. Deferred phase7 remains untouched. Source changes are separated into supplier, seller account and campaign-placeholder commits. Deployment status must be taken from the Sites response, not this document.
