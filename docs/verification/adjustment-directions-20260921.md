# Deduction/payment correction — base 203

Cause: payment button created owner=company_manager_prepaid (a pre-distribution expense plus manager reimbursement), not an independent payment type. Changing owner lost the apparent payment classification. All seller_payment deductions, including legacy promotion payments, were also summed as deductions while promotion was separately added, cancelling the credit.

New eventCosts and generated settlement deductions persist direction=deduction/payment with nonnegative amounts. Payment targets are seller/company/manager only. Explicit company adjustments apply to company attribution after distribution, meeting the requested +/-3,000 acceptance criteria. Legacy pre-distribution expenses and manager prepaid reimbursements remain unchanged, and are not inferred to be new payments. Unknown historical intent cannot be reconstructed from a label or owner.

Company and manager additions have separate snapshot totals. New direction is retained through save and sync. Seller credits excluded from deduction sums and added once through the existing payout calculation, with existing VAT/withholding policy unchanged. Manager payment/readiness/document calculations include additional payments. Seller-link receivable decreases for seller credits, rather than erroneously increasing the amount requested from the seller. Supplier payable logic unchanged.

Tests: runAdjustmentDirections passed save→sync→calculation for seller/manager/company payments +3,000 and deductions -3,000 using isolated tax-invoice fixture, with other recipients unchanged, validation passing, legacy promotion credit, legacy pre-distribution deduction preservation, and confirmed snapshot/deduction bytes unchanged. runManagerPrepaid passed. runSellerPayoutCorrection passed 10 tests. No authenticated live DB/session used; not a claim of production browser verification. Existing tax rules still apply when displaying tax-adjusted seller amounts.

No SQL migration or bulk data update. Existing confirmed calculations are not rewritten; both sales-event and sales-cost synchronization return before writing confirmed records. Phase7 policies and unrelated workflows unchanged.
