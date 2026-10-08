import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// No credentials, real database or existing browser storage are used.
const state = new Map()
globalThis.localStorage = { getItem: key => state.get(key) ?? null, setItem: (key, value) => state.set(key, value), removeItem: key => state.delete(key) }
const server = await createServer({ server: { middlewareMode: true, hmr: false }, envDir: false, appType: 'custom' })
try {
  const { managerOptions } = await server.ssrLoadModule('/src/shared/services/managerDirectoryService.ts')
  const managers = managerOptions([{ id: 'legacy', name: '동명' }, { id: 'real', name: '동명' }, { id: 'inactive', name: '비활성', active: false }])
  assert.equal(managers.length, 2)
  assert.notEqual(managers[0].id, managers[1].id)
  const { sellerMasterService: sellers } = await server.ssrLoadModule('/src/shared/services/sellerMasterService.ts')
  const id = crypto.randomUUID()
  await sellers.saveSellerProfile({ id, name: '기존 셀러', instagramId: 'seller_account', realName: '실명', defaultMdId: 'u-004', defaultManagerId: 'real', businesses: [{ id: 'biz', businessName: '세컨드 사업자', active: true, isPrimary: true, businessType: 'general_business' }] })
  for (const query of ['기존셀러', '@seller_account', '세컨드사업자', '실명']) assert.equal(sellers.searchSellers(query)[0].id, id)
  const { campaignService: campaigns } = await server.ssrLoadModule('/src/shared/services/campaignService.ts')
  campaigns.saveCampaigns([])
  const result = campaigns.createCampaign({ supplyAudience: 'seller', sellerId: id, sellerName: '기존 셀러', campaignName: '일정', managerId: 'real', managerName: '현재 매니저', mdId: 'u-004', startDate: '2026-10-10', endDate: '2026-10-11', brandName: '', productName: '', linkOwner: 'brand', businessType: 'general_business', totalCommissionRate: 0, sellerCommissionRate: 0 })
  assert.ok(result.campaign, JSON.stringify(result.errors))
  assert.equal(result.campaign.managerId, 'real')
  assert.equal(result.campaign.managerName, '현재 매니저')
  const { historicalSellers } = await server.ssrLoadModule('/src/shared/components/SellerHistoryNotice.tsx')
  assert.deepEqual(historicalSellers(sellers.listSellers(true)), [])
  const before = JSON.stringify(sellers.listSellers(true))
  campaigns.saveCampaigns([{ ...result.campaign, sellerId: 'unlinked-existing', sellerName: '확인 필요' }])
  assert.equal(historicalSellers(sellers.listSellers(true))[0].id, 'unlinked-existing')
  assert.equal(JSON.stringify(sellers.listSellers(true)), before)
  const { QuickSellerModal } = await server.ssrLoadModule('/src/shared/components/QuickSellerModal.tsx')
  const html = renderToStaticMarkup(createElement(QuickSellerModal, { name: '기존 셀러', managerId: 'real', managers, onClose() {}, onSaved() {} }))
  assert.ok(html.includes('기존 셀러 선택'))
  assert.ok(html.includes('aria-modal="true"'))
  assert.ok(!html.includes('href='))
  assert.equal(JSON.stringify(sellers.listSellers(true)), before)
  const pending = campaigns.createCampaign({ supplyAudience: 'seller', sellerId: id, sellerName: '기존 셀러', campaignName: '사업자 미등록 일정', managerId: 'real', managerName: '현재 매니저', mdId: 'u-004', startDate: '2026-10-10', endDate: '2026-10-11', brandName: '', productName: '', linkOwner: 'brand', businessType: '', totalCommissionRate: 0, sellerCommissionRate: 0 })
  assert.ok(pending.campaign, JSON.stringify(pending.errors))
  assert.equal(pending.campaign.businessType, '미정')
  assert.equal(pending.campaign.creationBusinessType, undefined)
  const initialSeller = sellers.getSellerById(id)
  const savedBeforeEdit = JSON.stringify(initialSeller)
  const editHtml = renderToStaticMarkup(createElement(QuickSellerModal, { name: '', managerId: 'real', managers, initialSeller, businessId: 'biz', onClose() {}, onSaved() {} }))
  assert.ok(editHtml.includes('셀러 정보 수정'))
  assert.ok(editHtml.includes('수정하고 선택'))
  assert.ok(!editHtml.includes('href='))
  assert.equal(JSON.stringify(initialSeller), savedBeforeEdit)
  console.log('PASS manager IDs/active status; seller name/Instagram/business/real-name search; schedule manager ID/name; historical detection without data mutation; duplicate seller popup preserves existing record')
} finally {
  await server.close()
}
