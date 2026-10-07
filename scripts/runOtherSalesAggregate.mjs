import assert from 'node:assert/strict'
class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}
globalThis.localStorage = new MemoryStorage()
const { createServer } = await import('vite')
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
const { effectiveSalesRows, prepareOtherSalesRevision, assertOtherSourceRowsPreserved } = await vite.ssrLoadModule('/src/shared/utils/otherSalesAggregate.ts')
const { calculateSettlement } = await vite.ssrLoadModule('/src/shared/utils/settlement.ts')
const { validateSalesRows } = await vite.ssrLoadModule('/src/shared/utils/salesData.ts')
const { salesDataService } = await vite.ssrLoadModule('/src/shared/services/salesDataService.ts')
const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
const { settlementReadinessErrors } = await vite.ssrLoadModule('/src/shared/utils/campaignReadiness.ts')
const { STORAGE_KEYS, storageService } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
const imported = [
  { id: 'gloves', optionName: '일반 테스트 품목', netSales: 100_000, totalCommissionRate: 25, sellerCommissionRate: 18 },
  { id: 'zipper', optionName: '기타 테스트 품목 A', netSales: 10_000 },
  { id: 'nitrile', optionName: '기타 테스트 품목 B', netSales: 5_000 },
].map((row) => ({ salesDataImportId: 'fixture-import', campaignId: 'fixture-campaign', quantity: 1, unitPrice: row.netSales, grossSales: row.netSales, canceledQuantity: 0, refundedQuantity: 0, netQuantity: 1, validationStatus: 'valid', validationMessage: '', ...row }))
const original = JSON.stringify(imported)
const source = {
  id: 'fixture-import', campaignId: 'fixture-campaign', fileName: 'source.xlsx', fileSize: 0,
  sourceType: 'file', uploadedBy: 'test', uploadedAt: '', reviewStatus: '검수 중', settlementStatus: '정산 전',
  totalQuantity: 2, totalSalesAmount: 115_000, notes: '', commissionCalculationType: 'sku',
  totalCommissionRate: 25, sellerCommissionRate: 18,
  otherSalesAggregate: { sourceRowIds: ['zipper', 'nitrile'], totalSales: 15_000, totalCommissionRate: 30, sellerCommissionRate: 20, savedAt: '' },
}
const effective = effectiveSalesRows(imported, source)
assert.equal(effective.length, 2)
assert.equal(effective.find((row) => row.aggregateKind === 'other')?.optionName, '기타')
assert.equal(effective.reduce((sum, row) => sum + row.netSales, 0), 115_000)
assert.equal(JSON.stringify(imported), original)
const validation = validateSalesRows(source, imported)
assert.equal(validation.status, 'valid')
assert.equal(validation.rows.length, 2)
const calculated = calculateSettlement(source, effective, [], 'tax_invoice')
assert.equal(calculated.grossCommission, Math.round(100_000 * .25) + Math.round(15_000 * .30))
assert.equal(calculated.sellerCommissionAmount, Math.round(100_000 * .18) + Math.round(15_000 * .20))
assert.throws(() => effectiveSalesRows(imported.slice(0, 2), source), /원본 판매행/)
assert.throws(() => effectiveSalesRows(imported, { ...source, otherSalesAggregate: { ...source.otherSalesAggregate, sellerCommissionRate: 31 } }), /수수료율/)
assert.throws(() => effectiveSalesRows(imported, { ...source, commissionCalculationType: 'campaign_total' }), /품목별/)
const revised = effective.map((row) => row.aggregateKind ? { ...row, unitPrice: 12_000, totalCommissionRate: 28, sellerCommissionRate: 19 } : row)
const prepared = prepareOtherSalesRevision(source, imported, revised)
assert.equal(prepared.source.otherSalesAggregate.totalSales, 12_000)
assert.equal(prepared.source.otherSalesAggregate.totalCommissionRate, 28)
assert.deepEqual(prepared.rows.filter(row => ['zipper', 'nitrile'].includes(row.id)), imported.slice(1))
assert.throws(() => prepareOtherSalesRevision(source, imported, revised.slice(0, 1)), /원본 연결/)
assert.throws(() => prepareOtherSalesRevision(source, imported, [...revised, revised[1]]), /원본 연결/)
assert.throws(() => assertOtherSourceRowsPreserved(imported, imported.slice(0, 2), source), /수정·삭제/)
assert.throws(() => assertOtherSourceRowsPreserved(imported, imported.map(row => row.id === 'zipper' ? { ...row, unitPrice: 1 } : row), source), /수정·삭제/)
const campaign = { id: 'fixture-campaign', salesChannelType: 'supplier_link' }
assert.deepEqual(settlementReadinessErrors(campaign, [], [effective[1]], source), [])
assert.ok(settlementReadinessErrors({ ...campaign, salesChannelType: 'seller_checkout' }, [], [effective[1]], source).some(error => error.includes('공급사 링크')))
assert.ok(settlementReadinessErrors(campaign, [], effective, source).includes('SKU 매칭 필요'))
salesDataService.saveImports([source])
salesDataService.saveRows(imported)
salesDataService.addSalesDataRows(source.id, imported)
assert.equal(salesDataService.getSalesDataImportById(source.id).totalQuantity, 2)
assert.throws(() => salesDataService.addSalesDataRows(source.id, imported.slice(0, 2)), /수정·삭제/)
salesDataService.validateSalesData(source.id)
assert.deepEqual(salesDataService.getRowsByImportId(source.id).map(row => row.id), ['gloves', 'zipper', 'nitrile'])
const draft = { id: 'other-draft', campaignId: 'fixture-campaign', salesDataImportId: 'fixture-import', status: 'draft', settlementConfirmed: false, taxType: 'tax_invoice', currentCalculation: calculated, settlementVersion: 1 }
storageService.setItem(STORAGE_KEYS.settlementDeductions, [])
const refreshed = settlementService.refreshRevisionFlags([draft], new Map([[source.id, source]]))[0]
assert.equal(refreshed.currentCalculation.grossCommission, calculated.grossCommission)
assert.equal(refreshed.currentCalculation.sellerCommissionAmount, calculated.sellerCommissionAmount)
const confirmed = { ...draft, id: 'other-confirmed', status: 'completed', settlementConfirmed: true, calculationSnapshot: calculated }
const before = JSON.stringify(confirmed)
const result = settlementService.refreshRevisionFlags([draft, confirmed], new Map([[source.id, source]]))[1]
assert.equal(result, confirmed)
assert.equal(JSON.stringify(result), before)
storageService.setItem(STORAGE_KEYS.settlements, [draft, confirmed])
const saved = settlementService.saveRevision({ settlementId: draft.id, reason: '기타 수수료 수정', rows: revised, totalCommissionRate: 25, sellerCommissionRate: 18, deductions: [] }, '격리검증', '정산 담당자')
assert.equal(saved.currentCalculation.grossCommission, Math.round(100_000 * .25) + Math.round(12_000 * .28))
assert.equal(saved.currentCalculation.sellerCommissionAmount, Math.round(100_000 * .18) + Math.round(12_000 * .19))
assert.deepEqual(salesDataService.getRowsByImportId(source.id).filter(row => ['zipper', 'nitrile'].includes(row.id)).map(({ validationStatus, validationMessage, ...row }) => row), imported.slice(1).map(({ validationStatus, validationMessage, ...row }) => row))
assert.equal(salesDataService.getSalesDataImportById(source.id).otherSalesAggregate.totalSales, 12_000)
assert.equal(settlementService.getSettlementById(draft.id).currentCalculation.grossCommission, saved.currentCalculation.grossCommission)
const savedSnapshot = JSON.stringify(storageService.getItem(STORAGE_KEYS.settlements, []).find(row => row.id === confirmed.id))
assert.throws(() => settlementService.saveRevision({ settlementId: confirmed.id, reason: '금지', rows: revised, deductions: [] }, '격리검증', '정산 담당자'), /확정된/)
assert.equal(JSON.stringify(storageService.getItem(STORAGE_KEYS.settlements, []).find(row => row.id === confirmed.id)), savedSnapshot)
console.log('PASS: 기타 합산 1회·개별 수수료·수정 원본 보존·삭제 차단·정산 재조회·확정 Snapshot 보호·채널 제한')
} finally { await vite.close() }
