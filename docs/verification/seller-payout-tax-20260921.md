# Seller payout / withholding correction — 2026-09-21

Scope: business-type payouts, new payment requests, withholding list/monthly UI, seller message account. Base: deployed v199 / a42c66f. No product, sample, Notion, storage, link or RLS changes.

## Cause and evidence

The old seller payout utility applied VAT removal and withholding to the **commission before adjustments**, then subtracted seller deductions. The general-business amount displayed was commission less deductions (plus any payment adjustments). This made the three displayed types use different effective VAT-inclusive bases.

Illustrative reproduction (NOT a read of the live Harusalim row): commission 372,940 and deductions 29,050 reproduce all three reported values exactly:
- general: 372,940 − 29,050 = 343,890
- simplified: round(372,940 / 1.1) − 29,050 = 309,986
- freelancer: 339,036 − 10,170 − 1,010 − 29,050 = 298,806

These inputs are not uniquely determined by the displayed totals. Live Harusalim deductions and business-type/request fields were not retrieved; do not claim these are its actual stored inputs.

The old local-tax helper used base × 0.003 instead of truncated income tax × 0.1. This was corrected to the explicitly requested sequence; it is not, by itself, the cause of the reported multi-thousand-won error.

The accounting list iterated sidecar tax items and required an exact payment-request link, silently omitting freelancer requests when that link/item was missing. It now iterates saved freelancer requests and displays stored tax fields; missing figures are marked for review, never recalculated from current formulas. New requests use the selected seller-master business type and the document's common tax result for the request and linked ledger.

## Formula and protection

New/unconfirmed: VAT-inclusive amount = commission − existing deductions + existing additional payments. Divide this amount by 1.1 and round to won; income tax is floor(base × .03 / 10) × 10; local tax is floor(incomeTax × .1 / 10) × 10. Subtract both taxes. Shared seller payout and withholding helpers used by document, payment request, confirmation, tax list and export.

Optional `sellerPayoutVersion: 2` is stored with newly calculated/confirmed JSON snapshots. Legacy confirmed snapshots without a marker retain policy 1. No SQL migration or production bulk update. Recalculation of confirmed settlements returns the existing record. Filed tax rows remain unchanged. Month-close records retain their original rows. User must explicitly reopen/revise eligible past settlements if correction is wanted; this release does not rewrite them.

## Verification

- Targeted isolated service tests: 10 pass, including user-supplied gross 343,890 -> base 312,627, income 9,370, local 930, total 10,300, net 302,327.
- Reproduction of old displayed amounts, adjustment-order tests, truncation boundaries.
- Real application request/document/ledger functions on in-memory repositories: freelancer master overrides stale general-business rule for new request; ledger linked once; duplicate request rejected; saved snapshot bytes preserved.
- Missing ledger visibility, missing tax details review state, canceled/non-freelancer exclusion, Excel amounts match.
- Legacy confirmed policy and recalculation guard; filed tax row preservation.
- Account string includes bank/account/holder, incomplete account produces `계좌정보 확인 필요`.
- Settlement document regression tests: 15 pass.

Live Harusalim DB record and authenticated browser workflow were NOT verified (no authenticated operating-data access in this session). No live settlement or ledger was modified. The known older all-in-one payout fixture suite had a pre-existing missing fixture/tax item failure; this change uses a new isolated test rather than altering unrelated fixture assumptions.
