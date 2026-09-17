import assert from 'node:assert/strict'
import { manualCommissionComparison } from '../src/shared/utils/manualSettlement.ts'
import { calculateSalesRow, validateSalesRows } from '../src/shared/utils/salesData.ts'
import { calculateSettlement } from '../src/shared/utils/settlement.ts'

const row = (id, quantity, unitPrice, totalCommissionRate, sellerCommissionRate, refundedQuantity = 0) => calculateSalesRow({ id, salesDataImportId: 'test', campaignId: 'test', optionName: id, quantity, unitPrice, totalCommissionRate, sellerCommissionRate, canceledQuantity: 0, refundedQuantity })
// Synthetic commercial terms; the user's screenshot supplies quantities, not prices.
const rows = [row('option1', 110, 10000, 25, 17), row('option2', 43, 20000, 25, 17), row('case', 9, 5000, 10, 7)]
const source = { id: 'test', campaignId: 'test', totalQuantity: 162, totalSalesAmount: 2005000, manualSettlement: { amountType: 'seller_vendor_commission', reportedCommissionAmount: 494500, quantityBasis: 'net', sourceMessage: '업체 전달 원문' } }
const comparison = manualCommissionComparison(source, rows)
assert.equal(comparison.total, 494500)
assert.equal(comparison.difference, 0)
assert.equal(comparison.vendor, comparison.total - comparison.seller)
assert.notEqual(validateSalesRows(source, rows).status, 'error')
const mismatch = { ...source, manualSettlement: { ...source.manualSettlement, reportedCommissionAmount: 674121 } }
assert.equal(validateSalesRows(mismatch, rows).status, 'error')
assert.equal(manualCommissionComparison(mismatch, rows).difference, -179621)
assert.equal(manualCommissionComparison(source, [row('missing', 1, 10000, undefined, undefined)]), undefined)
assert.equal(manualCommissionComparison(source, [row('invalid', -1, 10000, 25, 17)]), undefined)
assert.equal(manualCommissionComparison(source, [row('returned', 110, 10000, 25, 17, 4)]).total, 265000)
assert.equal(manualCommissionComparison(source, [row('already-net', 110, 10000, 25, 17)]).total, 275000)
const roundingRows = [row('a', 1, 3, 17, 10), row('b', 1, 3, 17, 10)]
for (const type of ['sku', 'campaign_total']) {
  const settings = { ...source, commissionCalculationType: type, totalCommissionRate: 17, sellerCommissionRate: 10 }
  assert.equal(manualCommissionComparison(settings, roundingRows).total, calculateSettlement(settings, roundingRows, [], 'tax_invoice').grossCommission)
}
const restored = JSON.parse(JSON.stringify(source))
assert.equal(manualCommissionComparison(restored, rows).difference, 0)
assert.equal(restored.manualSettlement.sourceMessage, '업체 전달 원문')
console.log('PASS manual commission reconciliation, missing conditions, claims, rounding, and saved metadata')
