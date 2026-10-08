import assert from 'node:assert/strict'
import { createServer } from 'vite'
const state = new Map()
globalThis.localStorage = { getItem: key => state.get(key) ?? null, setItem: (key, value) => state.set(key, value), removeItem: key => state.delete(key) }
const server = await createServer({ server: { middlewareMode: true, hmr: false }, envDir: false, appType: 'custom' })
try {
  const { campaignService: campaigns } = await server.ssrLoadModule('/src/shared/services/campaignService.ts')
  const { persistRegisteredCampaign, mergeRegisteredCampaigns } = await server.ssrLoadModule('/src/shared/services/campaignRegistrationService.ts')
  const { STORAGE_KEYS } = await server.ssrLoadModule('/src/shared/services/storageService.ts')
  campaigns.saveCampaigns([])
  state.set(STORAGE_KEYS.settlementVersions, JSON.stringify([{ id: 'confirmed', original: true }]))
  state.set(STORAGE_KEYS.campaignCreateDraft, JSON.stringify({ input: 'retained' }))
  const before = [...state]
  const input = { supplyAudience: 'seller', sellerId: 'original-seller', sellerName: '신규 셀러', campaignName: '신규 셀러 × 대표 제품', managerId: 'manager', managerName: '매니저', mdId: 'u-004', startDate: '2026-10-10', endDate: '2026-10-15', brandName: '브랜드', productName: '대표 제품', linkOwner: 'brand', businessType: '', totalCommissionRate: 0, sellerCommissionRate: 0 }
  const prepared = campaigns.createCampaign(input, { prepareOnly: true })
  assert.ok(prepared.campaign)
  assert.deepEqual([...state], before)
  await assert.rejects(persistRegisteredCampaign(prepared.campaign, { upsert: async () => { throw Error('server unavailable') } }), /server unavailable/)
  assert.deepEqual([...state], before)
  await assert.rejects(persistRegisteredCampaign(prepared.campaign, { upsert: async c => ({ ...c, id: 'wrong-id' }) }), /저장 결과/)
  assert.deepEqual([...state], before)
  let release
  const pending = persistRegisteredCampaign(prepared.campaign, { upsert: async campaign => { await new Promise(resolve => { release = resolve }); return campaign } })
  assert.equal(campaigns.getCampaigns().length, 0)
  release(); const result = await pending
  assert.equal(campaigns.getCampaigns()[0].id, prepared.campaign.id)
  assert.equal(result.campaign.sellerId, 'original-seller')
  const after = [...state]
  await persistRegisteredCampaign(prepared.campaign, { upsert: async campaign => campaign })
  assert.deepEqual([...state], after)
  const merged = mergeRegisteredCampaigns([{ ...prepared.campaign, campaignName: 'server latest' }], [prepared.campaign, { ...prepared.campaign, id: 'local-only' }])
  assert.equal(merged.campaigns.length, 2)
  assert.equal(merged.campaigns.find(c => c.id === prepared.campaign.id).campaignName, 'server latest')
  assert.equal(merged.unpersisted[0].id, 'local-only')
  assert.equal(JSON.parse(state.get(STORAGE_KEYS.settlementVersions))[0].original, true)
  console.log('PASS prepare without writes; failed/mismatched server saves keep draft and records; success published only after server response; idempotent retry; local-only registrations retained; latest server record preserved; confirmed snapshot untouched. No production writes.')
} finally { await server.close() }
