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

Proposal, Sample, and Settlement have separate roles:

- Proposal: expected sample conditions only. It may initialize a Sample request with expected quantity, unit price, and expected cost owner.
- Sample: actual operational values. It stores actual quantity, unit price, sample cost, shipping cost, paid/free status, cost owner, order status, delivery status, cancellation state, and settlement reflection state.
- Settlement: confirmed values. It calculates deductions only from actual Sample records, not directly from Proposal values.

Sample candidates are read by campaignId. Only actual Sample values can become settlement deductions.

Required sample reflection conditions:

- same `campaignId`
- `paymentType = 유상`
- status is not canceled
- actual order or purchase has happened
- cost owner is known, or the unresolved cost owner is surfaced as a blocking review item
- `settlementReflected = false`

Not reflected:

- Proposal expected values without a real Sample record
- canceled samples
- free samples
- samples whose cost owner is undecided
- samples that have not actually been ordered or purchased
- samples already reflected in another settlement

Sample cost is calculated from one actual structure:

```text
sampleTotalCost = quantity * unitPrice + shippingCost
```

In the current type, `sampleCost` is treated as the actual unit price and `unitPrice` is stored as an explicit alias for clarity.

Cost-owner handling:

- `company`: subtract from distributable vendor commission.
- `seller`: subtract from final seller payment amount.
- `manager`: subtract from manager amount.
- `brand`: record only, not reflected in calculations.
- `undecided`: record as a blocking item and prevent review or approval.

When a Sample is reflected in a Settlement, the Sample stores:

- `settlementReflected = true`
- `settlementId`
- `settlementReflectedAt`
- `settlementReflectedBy`

Samples with `settlementReflected = true` are excluded from later settlement candidates to prevent duplicate deductions.

If a sample deduction is removed before approval, the Sample reflection state can be rolled back. After approval-related states, direct deletion is avoided and a new settlement version is created.

If Proposal expected values and actual Sample values differ, the UI should warn:

```text
제안서 예상값과 실제 샘플 비용이 다릅니다.
```

Comparison targets are expected quantity vs actual quantity, expected unit price vs actual unit price, expected owner vs actual owner, and expected total vs actual total.

## My Work Connection

Settlement service creates work items for settlement writing, manager review, evidence confirmation, payment approval, and revision review. Notifications use `relatedType = settlement` and open the settlement detail drawer.

## Settlement Documents

Settlement Detail provides a dedicated document tab with two modes:

- Internal review document
- Seller delivery document

The internal review document can show the full calculation context:

- gross sales
- total commission rate
- gross commission
- seller commission rate
- seller payment amount
- vendor commission
- sample deduction
- event deduction
- other deduction
- distributable vendor commission
- manager amount
- company amount
- calculation steps
- review and approval status

The seller delivery document is an external-facing document. It is designed as a vertical white document that can be captured, printed, or sent as an image.

Seller delivery document includes:

- document title: `[sellerName] 공동구매 정산서`
- campaign name
- supply period
- product
- seller name
- issue date
- sales row table with product, option, quantity, unit price, sales amount, seller commission rate, seller commission
- total quantity
- gross sales
- seller commission rate
- seller settlement amount
- tax/evidence amount by tax type
- masked account placeholder
- evidence request notice
- payment due date
- company placeholder information

## External Information Hiding Rules

The seller delivery document must not expose internal company allocation data:

- vendor commission
- distributable vendor commission
- manager amount
- company amount
- internal approval history
- internal memo

Seller-facing amounts should focus on seller commission rate and seller settlement amount.

## Image, Clipboard, and Print

The MVP does not connect a PDF server. Browser-side actions are provided:

- Image preview: identifies the seller document DOM region used for image generation.
- Save as image: converts the seller document DOM area to a PNG in the browser using SVG `foreignObject` and canvas.
- Copy to clipboard: copies the seller document text content.
- Print: uses print CSS and A4 portrait layout.
- Copy delivery message: generates a seller-facing message from Settlement data.

If image generation fails, the UI shows an error message and users can use print as the fallback.

Print CSS hides:

- Sidebar
- Header
- tabs
- buttons
- internal review information
- settlement status controls

Print CSS shows:

- seller delivery document body
- company information
- tables
- totals
- tax notice
- issue date

Delivery message format:

```text
안녕하세요.
[공동구매명] 정산서를 전달드립니다.

정산금액: [셀러 지급액]
증빙 유형: [세금계산서/현금영수증/3.3%]
증빙 요청일: [날짜]
지급 예정일: [날짜]

정산 내용을 확인해주시고,
수정이 필요한 부분이 있다면 담당 매니저에게 전달 부탁드립니다.
```

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
