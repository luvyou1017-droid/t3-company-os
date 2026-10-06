import assert from 'node:assert/strict'
import { createServer } from 'vite'
class MemoryStorage {
  data = new Map()
  writes = new Map()
  reads = new Map()
  getItem(key) { this.reads.set(key, (this.reads.get(key) ?? 0) + 1); return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)); this.writes.set(key, (this.writes.get(key) ?? 0) + 1) }
  removeItem(key) { this.data.delete(key) }
}
globalThis.localStorage = new MemoryStorage()
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { storageService, STORAGE_KEYS } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
  const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
  const { syncProductCommissionRates } = await vite.ssrLoadModule('/src/shared/services/productCommissionSyncService.ts')
  const { initialSalesDataImports, initialSalesDataRows } = await vite.ssrLoadModule('/src/shared/data/salesData.ts')
  const { calculateSettlement } = await vite.ssrLoadModule('/src/shared/utils/settlement.ts')
  const salesImport = initialSalesDataImports.find(item => item.id === 'sales-004')
  const rows = initialSalesDataRows.filter(item => item.salesDataImportId === salesImport.id)
  assert.ok(rows.length)
  storageService.setItem(STORAGE_KEYS.salesDataImports, [salesImport])
  storageService.setItem(STORAGE_KEYS.salesDataRows, rows)
  const sample = { id: 'SAMPLE-PERF-1', campaignId: salesImport.campaignId, settlementReflected: false }
  storageService.setItem(STORAGE_KEYS.samples, [sample])
  const deduction = { id: 'deduction-SAMPLE-PERF-1', settlementId: 'settlement-perf', campaignId: salesImport.campaignId, type: 'sample', title: '샘플비', amount: 1000, costOwner: 'seller', applyLocation: 'seller_payment', linkedData: 'sample:SAMPLE-PERF-1', evidenceStatus: 'pending', createdAt: '2026-09-01', updatedAt: '2026-09-01' }
  storageService.setItem(STORAGE_KEYS.settlementDeductions, [deduction])
  const calculation = calculateSettlement(salesImport, rows, [deduction], 'tax_invoice')
  const settlement = { id: 'settlement-perf', campaignId: salesImport.campaignId, salesDataImportId: salesImport.id, status: 'draft', settlementVersion: 1, taxType: 'tax_invoice', currentCalculation: calculation, calculationSteps: [], createdAt: '2026-09-01', updatedAt: '2026-09-01' }
  storageService.setItem(STORAGE_KEYS.settlements, [settlement, { ...settlement, id: 'settlement-perf-second' }])
  localStorage.reads.clear()
  const first = settlementService.getSettlements().find(item => item.id === settlement.id)
  for (const key of [STORAGE_KEYS.salesDataImports, STORAGE_KEYS.campaigns, STORAGE_KEYS.salesDataRows, STORAGE_KEYS.settlementDeductions]) {
    assert.equal(localStorage.reads.get(key), 1, `${key} should only be read once per settlement list`)
  }
  const reflected = JSON.parse(localStorage.getItem(STORAGE_KEYS.samples))[0]
  assert.equal(reflected.settlementId, first.id)
  const sampleWrites = localStorage.writes.get(STORAGE_KEYS.samples)
  const second = settlementService.getSettlements().find(item => item.id === settlement.id)
  assert.equal(second.currentCalculation.finalSellerPaymentAmount, first.currentCalculation.finalSellerPaymentAmount)
  assert.equal(second.currentCalculation.companyAmount, first.currentCalculation.companyAmount)
  assert.equal(localStorage.writes.get(STORAGE_KEYS.samples), sampleWrites)
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEYS.samples))[0].settlementReflectedAt, reflected.settlementReflectedAt)
  const synced = await syncProductCommissionRates(salesImport.id, [])
  const rowWrites = localStorage.writes.get(STORAGE_KEYS.salesDataRows)
  const importWrites = localStorage.writes.get(STORAGE_KEYS.salesDataImports)
  const repeated = await syncProductCommissionRates(salesImport.id, [])
  assert.equal(synced.changed, true)
  assert.equal(repeated.changed, false)
  assert.equal(localStorage.writes.get(STORAGE_KEYS.salesDataRows), rowWrites)
  assert.equal(localStorage.writes.get(STORAGE_KEYS.salesDataImports), importWrites)
  console.log('PASS settlement read preserves sample reflection and calculation')
  console.log('PASS repeated commission sync makes no storage writes')
} finally {
  await vite.close()
}
