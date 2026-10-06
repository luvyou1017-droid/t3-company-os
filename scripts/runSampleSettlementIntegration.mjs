import assert from 'node:assert/strict'
import { createServer } from 'vite'

// Memory-only service regression. No browser, network sync or operational DB writes.
class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}
globalThis.localStorage = new MemoryStorage()
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { storageService, STORAGE_KEYS: K } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
  const { settlementService: service } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
  const { calculateSettlement } = await vite.ssrLoadModule('/src/shared/utils/settlement.ts')
  const { sampleSettlementCandidate } = await vite.ssrLoadModule('/src/features/samples/sampleSettlementCandidate.ts')
  const { sampleSettlementStatus } = await vite.ssrLoadModule('/src/features/samples/sampleSettlementStatus.ts')
  const { createSampleOrder, transitionSample, reserveSampleExport } = await vite.ssrLoadModule('/src/features/samples/sampleOrderModel.ts')
  const actor = { id: 'regression-manager', name: '격리 테스트' }
  const at = '2026-10-06T00:00:00Z'
  const draft = { sellerId: 'regression-seller', sellerName: '격리 셀러', campaignId: 'regression-campaign', campaignName: '격리 공구', productId: 'existing-product', supplierId: 'existing-supplier', supplierName: '격리 공급처', skuId: 'existing-sku', brandName: '격리 브랜드', productName: '샘플', optionName: '기본', detailOption: '', quantity: 1, recipient: '격리 수령인', phone: '01000000000', address: '격리 주소', purpose: '촬영', deliveryMemo: '', memo: '', payer: 'seller', supportType: 'full', supportAmount: null, costs: { sellerUnitPrice: 30000, companyUnitCost: 22000, source: 'manual', capturedAt: at } }
  let order = createSampleOrder(draft, actor, 'regression-sample', at)
  order = transitionSample(transitionSample(order, '승인대기', actor, at), '발주대기', actor, at)
  const book = reserveSampleExport({ schemaVersion: 1, orders: [order] }, [order.id], 'regression-batch', actor, at)
  order = transitionSample(book.orders[0], '발주완료', actor, at, 'regression-order')
  const originalCost = JSON.stringify(order.costs)
  assert.equal(sampleSettlementCandidate(order, draft.campaignId).deduction.amount, 30000)
  assert.equal(sampleSettlementStatus(order, [], new Set()), '반영 대기')
  const sales = { id: 'regression-sales', campaignId: draft.campaignId, totalCommissionRate: 25, sellerCommissionRate: 17, supplyAudience: 'seller' }
  const rows = [{ id: 'regression-row', salesDataImportId: sales.id, netSales: 1000000, optionName: '격리 판매' }]
  const base = calculateSettlement(sales, rows, [], 'tax_invoice')
  const settlement = { id: 'regression-settlement', campaignId: draft.campaignId, salesDataImportId: sales.id, status: 'draft', settlementConfirmed: false, settlementVersion: 1, taxType: 'tax_invoice', currentCalculation: base, calculationSteps: [], createdAt: at, updatedAt: at, assigneeName: actor.name }
  const confirmed = { ...settlement, id: 'confirmed-unrelated', status: 'approved', settlementConfirmed: true, calculationSnapshot: structuredClone(base), originalSnapshot: structuredClone(base) }
  storageService.setItem(K.salesDataImports, [sales])
  storageService.setItem(K.salesDataRows, rows)
  storageService.setItem(K.campaigns, [])
  storageService.setItem(K.samples, [])
  storageService.setItem(K.settlementDeductions, [])
  storageService.setItem(K.settlements, [settlement, confirmed])
  const confirmedBefore = JSON.stringify(confirmed)
  const applied = service.addSampleOrderDeduction(settlement.id, order)
  assert.equal(applied.currentCalculation.finalSellerPaymentAmount, base.finalSellerPaymentAmount - 30000)
  assert.equal(applied.currentCalculation.companyAmount, base.companyAmount + 8000)
  assert.equal(applied.currentCalculation.managerAmount, base.managerAmount)
  assert.equal(service.getDeductions().length, 1)
  assert.equal(service.getSettlementVersionsBySettlementId(settlement.id).length, 1)
  assert.equal(sampleSettlementStatus(order, service.getDeductions(), new Set([settlement.id])), '반영 완료')
  console.log('PASS request → campaign → candidate → confirmation → deduction → reflected')
  const stateBeforeDuplicate = JSON.stringify([...localStorage.data])
  assert.throws(() => service.addSampleOrderDeduction(settlement.id, order), /중복/)
  assert.equal(JSON.stringify([...localStorage.data]), stateBeforeDuplicate)
  assert.throws(() => service.addSampleOrderDeduction(confirmed.id, { ...order, id: 'second-sample' }), /확정/)
  assert.equal(JSON.stringify(service.getSettlementById(confirmed.id)), confirmedBefore)
  assert.equal(JSON.stringify(order.costs), originalCost)
  console.log('PASS duplicate sample_request_id blocked without writes; confirmed snapshots and SKU costs unchanged')
  storageService.setItem(K.settlements, [...service.getSettlements(), { ...settlement, id: 'second-draft' }])
  assert.throws(() => service.addSampleOrderDeduction('second-draft', order), /중복/)
  console.log('PASS same sample cannot be deducted in another active settlement')
  const beforeInvalid = JSON.stringify([...localStorage.data])
  for (const invalid of [{ ...order, id: 'canceled', status: '취소' }, { ...order, id: 'wrong-campaign', campaignId: 'other' }, { ...order, id: 'unknown-cost', costs: { ...order.costs, companyUnitCost: null } }]) {
    assert.throws(() => service.addSampleOrderDeduction(settlement.id, invalid))
    assert.equal(JSON.stringify([...localStorage.data]), beforeInvalid)
  }
  console.log('PASS canceled, unrelated and unknown-cost samples blocked before writes')
} finally { await vite.close() }
