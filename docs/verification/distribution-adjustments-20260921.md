# Pre-distribution adjustments

Supersedes the direct-target adjustment interpretation in production 204 per the latest explicit user request.
Explicit direction payment/deduction now contributes +/− to the distributable commission before manager allocation, regardless of recipient. It is not additionally applied after allocation or to seller payout. Legacy untyped reimbursements, promotions and costs retain their existing treatment.

Snapshot optional metadata: adjustmentCalculationVersion=2, distributionPaymentTotal, distributionDeductionTotal; deduction unitPrice/quantity. No SQL migration. Confirmed snapshots retain their prior version and amounts. Draft detail refresh and confirmation upgrade only the active, unconfirmed statement; no batch rewrite.

Manager calculation shows adjustment totals before the final pool. Detail rows are collapsed and include unit/quantity when known. Unknown historic unit/quantity display an em dash.

Validation (isolated memory, no live DB record access):
- Saved/synchronized explicit +/-3000 for all three recipients changes pool by +/-3000 and 50% manager share by +/-1500; no second recipient credit/debit.
- User-supplied fixture 60175 - 29738 - 6199 + 3000 = 27238; share 13619.
- Removing payment restores 24238; deduction3000 yields21238.
- Save/sync/remove tested. Detail component renders collapsed with unit/quantity.
- Confirmed snapshot and deduction storage bytes unchanged after sync/recalculation.
- Legacy manager prepaid regression and ten seller-payout regression checks pass.
- Production TypeScript/Vite build passes.

Actual authenticated production statement could not be accessed; live record/UI verification is not claimed.
