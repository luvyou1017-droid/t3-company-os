# Settlement V2

## Purpose

Settlement V2 explains why each settlement amount was calculated. The MVP uses mock data and localStorage only. Supabase, bank transfer, Hometax, real PDF or Excel generation, and sensitive personal data are intentionally not connected.

## Core Terms

- Gross commission: the full commission T3 receives from the brand. This is calculated from gross sales and total commission rate.
- Seller commission: the commission paid to the seller. This is calculated separately from gross sales and seller commission rate.
- Vendor commission: the remaining commission after seller commission is removed from gross commission.
- Distributable vendor commission: the amount manager and company split after company-owned costs are deducted from vendor commission.

The total commission rate and seller commission rate are different values. Example: if total commission rate is 25% and seller commission rate is 17%, the remaining 8% becomes vendor commission before cost deductions.

## Calculation Formula

All amounts are VAT-inclusive and stored as integer KRW. Percent values are stored as numbers like `25`, not `0.25`.

```text
grossCommission = grossSales * totalCommissionRate
sellerCommissionAmount = grossSales * sellerCommissionRate
vendorCommission = grossCommission - sellerCommissionAmount

distributableVendorCommission =
  vendorCommission
  - companySampleDeduction
  - companyEventDeduction
  - companyOtherDeduction

managerAmount =
  distributableVendorCommission * managerShareRate
  - managerDeduction

companyAmount = distributableVendorCommission - managerAmount

finalSellerPaymentAmount =
  sellerCommissionAmount
  - sellerDeduction
  - applicableTax
```

`companyAmount` is the reconciliation value so `managerAmount + companyAmount` exactly equals `distributableVendorCommission`. If manager deduction exists, it reduces `managerAmount`; the remaining difference stays in `companyAmount`.

## Revenue Tiers

Revenue tiers use VAT-inclusive gross sales.

| Gross sales | Manager | Company |
| --- | ---: | ---: |
| 0 to 9,999,999 KRW | 50% | 50% |
| 10,000,000 to 19,999,999 KRW | 60% | 40% |
| 20,000,000 KRW or more | 70% | 30% |

Boundary values:

- 9,999,999 KRW -> 50:50
- 10,000,000 KRW -> 60:40
- 19,999,999 KRW -> 60:40
- 20,000,000 KRW -> 70:30

## Required Validation

Settlement calculation is invalid when:

- total commission rate is lower than seller commission rate
- total commission rate is 0 or lower
- seller commission rate is negative
- vendor commission is negative
- distributable vendor commission is negative
- manager amount plus company amount differs from distributable vendor commission
- any reflected deduction has `costOwner = undecided`

## Required Example

```text
grossSales = 3,136,000
totalCommissionRate = 25
sellerCommissionRate = 17
companySampleDeduction = 112,000

grossCommission = 3,136,000 * 25% = 784,000
sellerCommissionAmount = 3,136,000 * 17% = 533,120
vendorCommission = 784,000 - 533,120 = 250,880
distributableVendorCommission = 250,880 - 112,000 = 138,880
managerShareRate = 50
companyShareRate = 50
managerAmount = 69,440
companyAmount = 69,440
```

These equations must hold:

```text
grossCommission = sellerCommissionAmount + vendorCommission
vendorCommission = distributableVendorCommission + companySampleDeduction + companyEventDeduction + companyOtherDeduction
distributableVendorCommission = managerAmount + companyAmount
```

## Brand Tax Invoice Amount

For brand-owned links, the tax invoice amount issued to the brand is the gross commission.

```text
brand tax invoice amount = grossCommission
```

Example: if gross commission is 784,000 KRW, the brand tax invoice amount is 784,000 KRW.

## Deduction Rules

Deduction owners:

- `company`: subtract from distributable vendor commission.
- `seller`: subtract from final seller payment amount.
- `manager`: subtract from manager amount.
- `brand`: record only, not reflected in calculations.
- `undecided`: blocks review completion and approval request.

Deduction types are `sample`, `event`, `purchase`, `shipping`, `refund`, `promotion`, and `other`.

## Tax Types

- Corporation or general business operator: `tax_invoice`.
- Simplified business operator or eligible individual business operator: `cash_receipt`.
- Freelancer: `withholding_3_3`.

Withholding tax uses:

```text
taxAmount = Math.round(paymentTargetAmount * 0.033)
finalSellerPaymentAmount = sellerCommissionAmount - sellerDeduction - taxAmount
```

Tax invoice or cash receipt settlements cannot move to payment ready until evidence is confirmed.

## Calculation Log

`SettlementCalculationStep` stores:

- item label
- input values
- formula
- result
- source
- modified flag
- calculated time

The detail drawer displays steps in this order:

1. Gross sales
2. Total commission rate
3. Gross commission
4. Seller commission rate
5. Seller payment amount
6. Vendor commission after seller payment
7. Company sample deduction
8. Company event deduction
9. Company other deduction
10. Distributable vendor commission
11. Revenue tier
12. Manager share rate
13. Company share rate
14. Manager amount
15. Company amount

## Calculation Snapshot

When a settlement reaches manager review or approval states, the current calculation is saved as `calculationSnapshot`.

Snapshot fields include gross sales, total commission rate, gross commission, seller commission rate, seller commission amount, vendor commission, company deductions, seller deduction, manager deduction, distributable vendor commission, share rates, manager amount, company amount, final seller payment amount, tax amount, calculated time, and calculator.

If Sales Data or deduction values change later, the settlement is marked `revision_required` and the UI shows "원본 데이터 변경됨". The previous snapshot remains available for version comparison.

## Version Management

Settlement changes create `SettlementVersion` records instead of overwriting approved values. Each version stores version number, changed time, changed by, reason, before amount, after amount, status, and snapshot.

The version comparison modal compares gross sales, total commission rate, seller commission rate, gross commission, seller commission, vendor commission, deduction total, distributable vendor commission, manager amount, company amount, seller payment amount, tax, and final payment amount.

## Activity History

`SettlementActivityLog` records draft creation, calculation execution, deduction add/update/remove, commission rate update, manager review request/completion, revision request, approval request, approval, payment ready, seller payment completion, manager payment completion, company settlement completion, and final completion.

Each log stores time, actor, action, previous status, next status, reason, and version.

## Sales Data Connection

Only Sales Data imports that meet these conditions can create settlements:

- review status is confirmed
- settlement status is ready
- validation has no error
- campaignId exists
- option row totals match header totals

Sales Data remains the source for gross sales, sales period, total commission rate, and seller commission rate.

## Sample Connection

Sample candidates are read by campaignId. Only paid samples with `settlementReflected = false` are proposed as deductions. The sample cost owner decides where the amount is reflected. Paid sample mock settlement amount is quantity times sample cost plus shipping.

## My Work Connection

Settlement service creates work items for settlement writing, manager review, evidence confirmation, payment approval, and revision review. Notifications use `relatedType = settlement` and open the settlement detail drawer.

## localStorage Structure

Settlement uses only `storageService`.

Keys:

- `t3_company_os_settlements`
- `t3_company_os_settlement_versions`
- `t3_company_os_settlement_deductions`
- `t3_company_os_settlement_activity_logs`

## Supabase Replacement Points

Replace these after the UI and workflow are validated:

- `storageService.ts`
- `settlementService.ts`
- `salesDataService.ts` mutation hooks that trigger revision checks
- `sampleService.ts` mutation hooks that trigger revision checks
- Work item and notification persistence

## Before Real Payment Integration

Do not store resident registration numbers, real account numbers, or Hometax credentials in mock data. Add access control, audit retention, approval permissions, payment idempotency keys, and evidence file storage before connecting bank transfers, Hometax, PDF, or Excel generation.
