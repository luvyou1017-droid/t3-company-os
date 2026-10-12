import assert from 'node:assert/strict'
import { createServer } from 'vite'
const values = new Map()
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
const vite = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { buildManualSalesCompletion } = await vite.ssrLoadModule('/src/shared/utils/manualSalesCompletion.ts')
  const { completeSalesManually } = await vite.ssrLoadModule('/src/shared/services/manualSalesCompletionService.ts')
  const { isCompletedSalesImport } = await vite.ssrLoadModule('/src/shared/utils/settlementArchive.ts')
  const { STORAGE_KEYS } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
  const { salesDataService } = await vite.ssrLoadModule('/src/shared/services/salesDataService.ts')
  const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
  const original = { id: 'sales-brickglo-5', campaignId: 'existing-campaign', totalQuantity: 42423, totalSalesAmount: 900000, reviewStatus: '오류 확인 필요', settlementStatus: '정산 전', notes: '원본 보존', manualSettlement: { companySupplyPrice: 10000 } }
  const originalJson = JSON.stringify(original)
  const other = { ...original, id: 'other-import', notes: '다른 공구' }
  const actor = { id: 'user', name: '허윤정' }
  for (const amount of [NaN, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildManualSalesCompletion(original, amount, actor, 'now'))
  const model = buildManualSalesCompletion(original, 123456789, actor, '2026-10-12T09:00:00Z')
  assert.equal(model.manualCompletion.grossSales, 123456789)
  assert.equal(model.totalSalesAmount, original.totalSalesAmount)
  assert.equal(model.reviewStatus, original.reviewStatus)
  assert.equal(model.id, original.id)
  assert.equal(model.campaignId, original.campaignId)
  assert.deepEqual(model.manualSettlement, original.manualSettlement)
  assert.equal(JSON.stringify(original), originalJson)
  assert.equal(buildManualSalesCompletion(model, 100, actor, 'later'), model)
  assert.equal(isCompletedSalesImport(model, []), true)
  assert.equal(isCompletedSalesImport(original, []), false)
  let records = [original, other], activeSettlements = [], role = 'ceo', conflict = false, writes = 0, revision = 1
  const filters = []
  const client = { auth: { async getUser() { return { data: { user: { id: 'user' } }, error: null } } }, from(table) {
    let storageKey, write
    return {
      select() { return this }, eq(key, value) { if (key === 'storage_key') storageKey = value; filters.push([key,value]); return this },
      update(patch) { assert.equal(table, 'workspace_state'); assert.deepEqual(Object.keys(patch), ['payload']); write = patch; return this },
      async maybeSingle() {
        if (table === 'profiles') return { data: { role, display_name: '허윤정', active: true, approval_status: 'approved' }, error: null }
        assert.equal(table, 'workspace_state')
        if (write) { if (conflict) return { data: null, error: null }; writes++; records = write.payload; revision++; return { data: { payload: records, updated_at: 'after' }, error: null } }
        return { data: { payload: storageKey === STORAGE_KEYS.salesDataImports ? records : activeSettlements, revision, updated_at: 'before', deleted: false }, error: null }
      }
    }
  } }
  role = 'manager'
  await assert.rejects(() => completeSalesManually(original.id, 123, client), /대표·관리자/)
  assert.equal(writes, 0)
  role = 'ceo'; activeSettlements = [{ salesDataImportId: original.id, status: 'draft', calculationSnapshot: { unchanged: true } }]
  await assert.rejects(() => completeSalesManually(original.id, 123, client), /기존 정산서/)
  assert.equal(writes, 0)
  activeSettlements = []; conflict = true
  await assert.rejects(() => completeSalesManually(original.id, 123, client), /다른 사용자/)
  assert.equal(values.get(STORAGE_KEYS.salesDataImports), undefined)
  conflict = false
  const first = await completeSalesManually(original.id, 123456789, client)
  const second = await completeSalesManually(original.id, 999, client)
  assert.equal(writes, 1)
  assert.deepEqual(first, second)
  assert.deepEqual(records[1], other)
  assert(filters.some(([key]) => key === 'revision'))
  assert(filters.some(([key]) => key === 'updated_at'))
  assert.equal(salesDataService.getSalesDataImportById(original.id).manualCompletion.grossSales, 123456789)
  const priorSnapshots = values.get(STORAGE_KEYS.settlementVersions)
  assert.equal(settlementService.createSettlementFromSalesData(original.id), undefined)
  assert.equal(await settlementService.prepareSettlementFromSalesData(original.id), undefined)
  assert.equal(values.get(STORAGE_KEYS.settlementVersions), priorSnapshots)
  console.log('PASS gross-sales-only manual completion; server-first persistence; approved-admin guard; concurrent change rejection; existing settlement protection; repeated clicks idempotent; unrelated imports/original totals preserved; no new settlement/Snapshot')
} finally { await vite.close() }
