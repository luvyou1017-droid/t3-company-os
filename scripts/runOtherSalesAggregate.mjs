import assert from 'node:assert/strict'
import { effectiveSalesRows } from '../src/shared/utils/otherSalesAggregate.ts'
import { calculateSettlement } from '../src/shared/utils/settlement.ts'
import { validateSalesRows } from '../src/shared/utils/salesData.ts'

const imported = [
  { id: 'gloves', optionName: '고무장갑', netSales: 129_810_660, totalCommissionRate: 25, sellerCommissionRate: 18 },
  { id: 'zipper', optionName: '지퍼백', netSales: 10_853_100 },
  { id: 'nitrile', optionName: '니트릴장갑', netSales: 5_198_400 },
].map((row) => ({ salesDataImportId: 'brickglow', campaignId: 'dielisa', quantity: 1, unitPrice: row.netSales, grossSales: row.netSales, canceledQuantity: 0, refundedQuantity: 0, netQuantity: 1, validationStatus: 'valid', validationMessage: '', ...row }))
const original = JSON.stringify(imported)
const source = {
  id: 'brickglow', campaignId: 'dielisa', fileName: 'source.xlsx', fileSize: 0,
  sourceType: 'file', uploadedBy: 'test', uploadedAt: '', reviewStatus: '검수 중', settlementStatus: '정산 전',
  totalQuantity: 2, totalSalesAmount: 145_862_160, notes: '', commissionCalculationType: 'sku',
  totalCommissionRate: 25, sellerCommissionRate: 18,
  otherSalesAggregate: { sourceRowIds: ['zipper', 'nitrile'], totalSales: 16_051_500, totalCommissionRate: 30, sellerCommissionRate: 20, savedAt: '' },
}
const effective = effectiveSalesRows(imported, source)
assert.equal(effective.length, 2)
assert.equal(effective.find((row) => row.aggregateKind === 'other')?.optionName, '기타')
assert.equal(effective.reduce((sum, row) => sum + row.netSales, 0), 145_862_160)
assert.equal(JSON.stringify(imported), original)
const validation = validateSalesRows(source, imported)
assert.equal(validation.status, 'valid')
assert.equal(validation.rows.length, 2)
const calculated = calculateSettlement(source, effective, [], 'tax_invoice')
assert.equal(calculated.grossCommission, Math.round(129_810_660 * .25) + Math.round(16_051_500 * .30))
assert.equal(calculated.sellerCommissionAmount, Math.round(129_810_660 * .18) + Math.round(16_051_500 * .20))
assert.throws(() => effectiveSalesRows(imported.slice(0, 2), source), /원본 판매행/)
assert.throws(() => effectiveSalesRows(imported, { ...source, otherSalesAggregate: { ...source.otherSalesAggregate, sellerCommissionRate: 31 } }), /수수료율/)
console.log('기타 원본 보존·한 번만 반영·수수료 계산·원본 누락 차단 통과')
