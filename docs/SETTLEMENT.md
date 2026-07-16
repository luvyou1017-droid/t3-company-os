# Settlement V2

## Purpose

Settlement V2 explains why each payment amount was calculated. The MVP uses mock data and localStorage only. Supabase, bank transfer, Hometax, real PDF or Excel generation, and sensitive personal data are intentionally not connected.

## Calculation Formula

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

Core formula:

```text
grossCommission = netSales * commissionRate
netCompanyCommission = grossCommission - company sample costs - company event costs - company other costs
managerAmount = netCompanyCommission * managerRate - manager costs
companyAmount = netCompanyCommission - managerAmount
sellerPaymentAmount = netSales - grossCommission - seller costs
```

All amounts are rounded to integer KRW. `companyAmount` is the final reconciliation value so `managerAmount + companyAmount` exactly equals `netCompanyCommission`.

## Deduction Rules

Deduction owners:

- `company`: subtract from company remaining commission.
- `seller`: subtract from seller payment.
- `manager`: subtract from manager payment.
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
finalPaymentAmount = paymentTargetAmount - taxAmount
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

The detail drawer displays these steps as a timeline so operators can trace Sales Data, Campaign commission rate, Sample deductions, manual event costs, manual changes, and system-calculated values.

## Calculation Snapshot

When a settlement reaches manager review or approval states, the current calculation is saved as `calculationSnapshot`.

Snapshot fields include gross sales, net sales, commission rate, gross commission, deductions, net company commission, share rates, manager amount, company amount, seller payment amount, tax amount, final payment amount, calculated time, and calculator.

If Sales Data or deduction values change later, the settlement is marked `revision_required` and the UI shows "원본 데이터 변경됨". The previous snapshot remains available for version comparison.

## Version Management

Settlement changes create `SettlementVersion` records instead of overwriting approved values. Each version stores:

- version number
- changed time
- changed by
- reason
- before amount
- after amount
- status
- snapshot

The version comparison modal compares gross sales, commission rate, gross commission, deduction total, net company commission, manager amount, company amount, seller payment amount, tax, and final payment amount.

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

Sales Data remains the source for gross sales, net sales, sales period, and commission defaults.

## Sample Connection

Sample candidates are read by campaignId. Only paid samples with `settlementReflected = false` are proposed as deductions. The sample cost owner decides where the amount is reflected.

## My Work Connection

Settlement service creates work items for:

- settlement writing
- manager review
- evidence confirmation
- payment approval
- revision review

Assignees in the MVP:

- Settlement writing: 허수정
- Manager review: Campaign manager
- Approval: 허윤정
- Brand/evidence confirmation: 유시철 MD

Notifications use `relatedType = settlement` and open the settlement detail drawer.

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
