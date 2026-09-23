import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { containsCampaignReference, assertCampaignDeletionAllowed, deleteUnlinkedCampaign } from '../src/shared/utils/campaignDeletionGuard.ts'
import { applyScheduleDisplayFields, scheduleDisplayFields } from '../src/shared/utils/campaignScheduleFields.ts'
import { skuDetailDisplay } from '../src/pages/sales-data/skuDetailDisplay.ts'

// Isolated fixtures; never delete or modify real campaigns for testing.
let count = 0
async function test(name, run) { await run(); console.log(`PASS ${name}`); count++ }
const deleted = { id: 'existing-campaign', productId: '', deletedAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z' }
await test('정확한 ID와 중첩 Snapshot·샘플 참조 검사', () => {
  assert.equal(containsCampaignReference({ orders: [{ campaignId: deleted.id }] }, [deleted.id]), true)
  assert.equal(containsCampaignReference({ snapshots: [{ campaign: { id: deleted.id } }] }, [deleted.id]), true)
  assert.equal(containsCampaignReference({ title: `${deleted.id}-different` }, [deleted.id]), false)
})
await test('활성 일정 완전삭제 차단', () => assert.throws(() => assertCampaignDeletionAllowed({ ...deleted, deletedAt: undefined }, []), /휴지통/))
await test('현재 상품·제안서·이벤트 연결 삭제 차단', () => {
  for (const patch of [{ productId: 'p' }, { proposalSnapshots: [{}] }, { campaignProducts: [{}] }, { campaignEvents: [{}] }]) assert.throws(() => assertCampaignDeletionAllowed({ ...deleted, ...patch }, []), /연결/)
})
await test('정산·과거이력 연결 삭제 차단', () => assert.throws(() => assertCampaignDeletionAllowed(deleted, ['정산', '과거 공용 이력']), /정산/))
await test('연결 없는 휴지통 일정만 삭제 호출', async () => {
  let writes = 0
  await deleteUnlinkedCampaign({ inspect: async () => ({ campaign: deleted, linkedSources: [], revision: '1' }), remove: async campaign => { assert.equal(campaign.id, deleted.id); writes++ } }, deleted.id, deleted.updatedAt)
  assert.equal(writes, 1)
})
await test('검사 실패 시 삭제 호출 없음', async () => {
  let writes = 0
  await assert.rejects(deleteUnlinkedCampaign({ inspect: async () => { throw new Error('permission unavailable') }, remove: async () => { writes++ } }, deleted.id, deleted.updatedAt))
  assert.equal(writes, 0)
})
await test('검사 사이 신규 연결 발생 시 삭제 차단', async () => {
  let reads = 0, writes = 0
  await assert.rejects(deleteUnlinkedCampaign({ inspect: async () => ({ campaign: deleted, linkedSources: ++reads === 2 ? ['샘플발주'] : [], revision: '1' }), remove: async () => { writes++ } }, deleted.id, deleted.updatedAt), /연결/)
  assert.equal(writes, 0)
})
await test('검사 사이 revision 변경과 오래된 일정 차단', async () => {
  let reads = 0, writes = 0
  const repo = { inspect: async () => ({ campaign: deleted, linkedSources: [], revision: String(++reads) }), remove: async () => { writes++ } }
  await assert.rejects(deleteUnlinkedCampaign(repo, deleted.id, deleted.updatedAt), /변경/)
  await assert.rejects(deleteUnlinkedCampaign(repo, deleted.id, 'stale'), /변경/)
  assert.equal(writes, 0)
})
const snapshot = { skuId: 'existing-sku', salePrice: 30000, supplyPrice: 22000 }
const campaign = { ...deleted, proposalSnapshots: [snapshot], linkOpenTime: '09:00', linkCloseTime: '23:00', winnerAnnouncementDate: '2026-10-01', settlementDueDate: '2026-10-10' }
const beforeCampaign = JSON.stringify(campaign)
await test('일정 표시 값 불러오기', () => assert.deepEqual(scheduleDisplayFields(campaign), { linkOpenTime: '09:00', linkCloseTime: '23:00', winnerAnnouncementDate: '2026-10-01' }))
await test('일정 표시 수정 후 ID·Snapshot·정산일 불변', () => {
  const next = applyScheduleDisplayFields(campaign, { linkOpenTime: '10:00', linkCloseTime: '21:30', winnerAnnouncementDate: '2026-10-02' })
  assert.equal(next.id, campaign.id); assert.equal(next.proposalSnapshots, campaign.proposalSnapshots)
  assert.equal(next.settlementDueDate, campaign.settlementDueDate); assert.equal(next.winnerAnnouncementDateOverride, true)
  assert.equal(JSON.stringify(campaign), beforeCampaign)
  assert.throws(() => applyScheduleDisplayFields(campaign, { ...scheduleDisplayFields(campaign), linkOpenTime: '29:30' }))
})
const product = { id: 'product', active: true, brandName: '미스더데코', productName: '빨래바구니', skus: [{ id: 'existing-sku', active: true, optionName: '2단', optionValues: { 컬러: '베이지', 사이즈: '대형' }, supplyPrice: 22000, currentTradeTerms: { companySupplyPrice: 22000, sellerSupplyPrice: 30000 } }] }
const beforeProduct = JSON.stringify(product)
await test('SKU ID로 상품·옵션·세부옵션·현재 공급가 표시', () => {
  const detail = skuDetailDisplay([product], 'product', 'existing-sku')
  assert.equal(detail.productName, '빨래바구니'); assert.equal(detail.optionName, '2단')
  assert.equal(detail.detail, '컬러: 베이지 · 사이즈: 대형'); assert.equal(detail.companySupplyPrice, 22000); assert.equal(detail.sellerSupplyPrice, 30000)
})
await test('동명이거나 가격이 같아도 다른 SKU 추정 금지', () => assert.equal(skuDetailDisplay([product], 'product', 'different-sku'), undefined))
await test('빈 공급가와 명시적 0 구분, 이전연결 표시', () => {
  const p = { ...product, skus: [{ ...product.skus[0], active: false, supplyPrice: 0, currentTradeTerms: { sellerSupplyPrice: 0 } }] }
  const detail = skuDetailDisplay([p], 'product', 'existing-sku')
  assert.equal(detail.companySupplyPrice, undefined); assert.equal(detail.sellerSupplyPrice, 0); assert.equal(detail.inactive, true)
})
await test('조회 후 상품/SKU·Snapshot 원본 불변', () => { assert.equal(JSON.stringify(product), beforeProduct); assert.equal(JSON.stringify(campaign), beforeCampaign) })
await test('보호 경로 정적 검증: 연결 자료 삭제 및 Snapshot 재계산 없음', () => {
  const deletion = readFileSync(new URL('../src/shared/services/campaignDeletionService.ts', import.meta.url), 'utf8')
  assert.equal((deletion.match(/\.delete\(\)/g) ?? []).length, 1)
  assert.ok(deletion.includes("from('campaigns').delete()")); assert.ok(deletion.includes(".eq('updated_at', campaign.updatedAt)"))
  const page = readFileSync(new URL('../src/pages/campaign-detail/CampaignDetailPage.tsx', import.meta.url), 'utf8')
  assert.ok(!page.includes('recalculateSettlement(')); assert.ok(!page.includes('proposalSnapshots?.map'))
  const detail = readFileSync(new URL('../src/pages/sales-data/skuDetailDisplay.ts', import.meta.url), 'utf8')
  assert.ok(!detail.includes('updateProduct')); assert.ok(!detail.includes('save'))
})
console.log(`operational UX completion: ${count} checks passed; browser/live-data writes NOT run`)
