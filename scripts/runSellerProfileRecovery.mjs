import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const state = new Map()
globalThis.localStorage = { getItem: key => state.get(key) ?? null, setItem: (key, value) => state.set(key, value), removeItem: key => state.delete(key) }
const server = await createServer({ server: { middlewareMode: true, hmr: false }, envDir: false, appType: 'custom' })
try {
  const { sellerEditorBusinesses, validateSellerBusinesses } = await server.ssrLoadModule('/src/shared/utils/sellerBusinessProfile.ts')
  const { sellerMasterService: master } = await server.ssrLoadModule('/src/shared/services/sellerMasterService.ts')
  const { campaignService: campaigns } = await server.ssrLoadModule('/src/shared/services/campaignService.ts')
  const { historicalSellers, historicalSellerDraft, linkHistoricalSeller, savedSellerInformation } = await server.ssrLoadModule('/src/shared/services/sellerHistoryService.ts')
  const { STORAGE_KEYS } = await server.ssrLoadModule('/src/shared/services/storageService.ts')
  const id = crypto.randomUUID()
  const profile = { id, name: '기존 셀러', realName: '실명', businessType: 'freelancer', bankName: '기존 은행', accountNumber: 'TEST-ACCOUNT', accountHolder: '실명', defaultMdId: 'md', defaultManagerId: 'manager', sourceMetadata: { retained: true } }
  const businesses = sellerEditorBusinesses(profile)
  assert.equal(businesses[0].businessType, 'freelancer')
  assert.equal(businesses[0].representativeName, '실명')
  assert.equal(businesses[0].accountNumber, 'TEST-ACCOUNT')
  assert.equal(validateSellerBusinesses({ ...profile, businesses }), '')
  assert.match(validateSellerBusinesses({ ...profile, businesses: [{ ...businesses[0], representativeName: '' }] }), /실명/)
  assert.match(validateSellerBusinesses({ ...profile, businesses: [{ ...businesses[0], businessType: 'general_business' }] }), /사업자명/)
  assert.match(validateSellerBusinesses({ ...profile, businesses }, { [businesses[0].id]: '123' }), /13자리/)
  const original = await master.saveSellerProfile({ ...profile, businesses })
  const campaign = { id: 'history-campaign', sellerId: 'legacy-seller', sellerName: '이전 이름', campaignName: '기존 일정', managerId: 'manager', mdId: 'md' }
  campaigns.saveCampaigns([campaign])
  state.set(STORAGE_KEYS.sellerSettlementRules, JSON.stringify([{ campaignId: campaign.id, businessType: 'freelancer', updatedAt: '2026-10-01' }]))
  state.set(STORAGE_KEYS.settlementVersions, JSON.stringify([{ id: 'confirmed', sellerId: 'legacy-seller', account: 'original', businessType: 'general_business' }]))
  const protectedKeys = [STORAGE_KEYS.campaigns, STORAGE_KEYS.settlementVersions, STORAGE_KEYS.sellerSettlementRules]
  const before = protectedKeys.map(key => state.get(key))
  assert.equal(historicalSellers(master.listSellers(true)).length, 1)
  await linkHistoricalSeller({ id: campaign.sellerId, name: campaign.sellerName }, id)
  assert.equal(master.getSellerById('legacy-seller').id, id)
  assert.equal(master.getSellerById(id).businesses[0].id, businesses[0].id)
  assert.equal(master.getSellerById(id).sourceMetadata.retained, true)
  assert.equal(historicalSellers(master.listSellers(true)).length, 0)
  assert.deepEqual(protectedKeys.map(key => state.get(key)), before)
  assert.equal(savedSellerInformation(master.listSellers(true))[0].seller.id, id)
  await assert.rejects(linkHistoricalSeller({ id: campaign.sellerId, name: campaign.sellerName }, id), /이미 연결/)
  await assert.rejects(linkHistoricalSeller({ id: '', name: 'ID 없음' }, id), /자동 연결/)
  await assert.rejects(master.saveSellerProfile(original, { createOnly: true }), /이미 등록/)
  const notionId = '192ddc8b-71f1-80ff-88fc-cbd11348459d'
  assert.equal(historicalSellerDraft({ id: notionId, name: '이름' }).id, notionId)
  const { sensitiveIdentityService } = await server.ssrLoadModule('/src/shared/services/sensitiveIdentityService.ts')
  sensitiveIdentityService.stage('seller', id, '0000000000000') // synthetic only, never a real identity
  assert.ok([...state.values()].every(value => !value.includes('0000000000000')))
  const { SellerHistoryNotice } = await server.ssrLoadModule('/src/shared/components/SellerHistoryNotice.tsx')
  const html = renderToStaticMarkup(createElement(SellerHistoryNotice, { sellers: master.listSellers(true), onRegister() {} }))
  assert.ok(html.includes('정산관리에서 저장한 사업자 정보'))
  assert.ok(html.includes('현재 셀러 정보 수정'))
  console.log('PASS freelancer validation; legacy root fields; explicit historical ID linking; original IDs/accounts/metadata and confirmed snapshots unchanged; no plaintext identity persistence; duplicate registration rejection; saved settlement information lookup')
} finally { await server.close() }
