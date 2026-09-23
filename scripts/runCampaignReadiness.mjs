import assert from 'node:assert/strict'
import { createServer } from 'vite'
const values = new Map()
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key), clear: () => values.clear() }
const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { notionRecentCampaigns } = await server.ssrLoadModule('/src/shared/data/notionPilot10.ts')
  const { notionCampaignMigrationService: migration } = await server.ssrLoadModule('/src/shared/services/notionCampaignMigrationService.ts')
  const { campaignReadiness, scheduleRequiredErrors, settlementReadinessErrors } = await server.ssrLoadModule('/src/shared/utils/campaignReadiness.ts')
  const { campaignService } = await server.ssrLoadModule('/src/shared/services/campaignService.ts')
  const raw = migration.preview(notionRecentCampaigns)
  // Simulates the user's explicit trade-type choice, never a database migration.
  const previews = migration.preview(notionRecentCampaigns.map(r => ({ ...r, supplyAudience: 'seller' })))
  const eligible = previews.filter(p => !p.blockingErrors.length)
  console.log(JSON.stringify({ records: previews.length, eligibleBeforeTradeTypeConfirmation: raw.filter(p => !p.blockingErrors.length).length, eligibleAfterExplicitTradeTypeConfirmation: eligible.length, supplierUnlinked: eligible.filter(p => !p.source.supplierId).length, blockers: previews.filter(p => p.blockingErrors.length).map(p => p.blockingErrors) }))
  assert.equal(previews.length, 42)
  const source = { ...notionRecentCampaigns[0], supplyAudience: 'seller', supplierId: undefined, supplierName: undefined, productId: '', productName: '' }
  const pending = migration.preview([source])[0]
  assert.deepEqual(pending.blockingErrors, [])
  assert(campaignReadiness(pending.campaign).tasks.includes('공급처 미연결'))
  assert(campaignReadiness(pending.campaign).tasks.includes('상품 연결 필요'))
  for (const field of ['title', 'sellerId', 'managerId', 'startDate', 'endDate', 'supplyAudience']) {
    assert(migration.preview([{ ...source, [field]: '' }])[0].blockingErrors.length, field)
  }
  assert(migration.preview([{ ...source, endDate: '2026-02-30' }])[0].blockingErrors.length)
  assert.equal(migration.preview([{ ...source, sellerId: '', sellerName: '', settlementVendorName: '검증 대상 벤더', supplyAudience: 'vendor' }])[0].blockingErrors.length, 0)
  const input = { ...pending.campaign, brandName: '', productName: '', linkOwner: 'company', businessType: '', totalCommissionRate: 0, sellerCommissionRate: 0 }
  assert.deepEqual(campaignService.validateCampaign(input), {})
  const product = { id: 'p', vendorId: 'supplier', supplyPrice: 22000, sellerCommissionRate: 20, skus: [{ id: 'sku', supplyPrice: 22000, sellerCommissionRate: 20 }] }
  const complete = { ...pending.campaign, productId: 'p', supplierId: 'supplier', salesChannelType: 'supplier_link' }
  assert.equal(campaignReadiness(complete, [product]).label, '정산 준비 완료')
  assert.deepEqual(settlementReadinessErrors(complete, [product], [{ productId: 'p', skuId: 'sku', netQuantity: 1 }]), [])
  assert(settlementReadinessErrors(pending.campaign, [], [{ netQuantity: 1 }]).length)
  assert(settlementReadinessErrors(complete, [{ ...product, supplyPrice: 0, skus: [{ id: 'sku', supplyPrice: 0 }] }], [{ skuId: 'sku', netQuantity: 1 }]).includes('회사 실제 공급가 미등록'))
  const laytable = { ...complete, salesChannelType: 'wise_shop_link', supplyAudience: 'seller' }
  const importTerms = { supplyAudience: 'seller', settlementTerms: { salesChannelType: 'wise_shop_link' }, commissionSyncUnmatchedRows: 0 }
  assert.deepEqual(settlementReadinessErrors(laytable, [product], [{ productId: 'p', skuId: 'sku', netQuantity: 1 }], importTerms), [])
  assert.deepEqual(settlementReadinessErrors({ ...laytable, supplierId: undefined }, [{ ...product, vendorId: undefined }], [{ productId: 'p', skuId: 'sku', netQuantity: 1 }], importTerms), [])
  assert.deepEqual(settlementReadinessErrors({ ...laytable, salesChannelType: undefined }, [product], [{ productId: 'p', skuId: 'sku', netQuantity: 1 }], importTerms), [])
  assert(settlementReadinessErrors({ ...laytable, salesChannelType: 'seller_checkout' }, [product], [{ productId: 'p', skuId: 'sku', netQuantity: 1 }], importTerms).includes('거래구분 불일치'))
  assert(settlementReadinessErrors({ ...laytable, salesChannelType: undefined }, [product], [{ productId: 'p', skuId: 'sku', netQuantity: 1 }], { ...importTerms, settlementTerms: { salesChannelType: undefined } }).includes('거래구분 미등록'))
  assert(settlementReadinessErrors(laytable, [product], [{ productId: 'p', skuId: 'sku', netQuantity: 1 }], { ...importTerms, commissionSyncUnmatchedRows: 2 }).includes('SKU 매칭 필요'))
  const existing = { ...complete, id: 'existing-id', proposalSnapshots: [{ id: 'keep', salePrice: 12345 }], sellerBusinessId: 'business', supplierId: 'existing-supplier' }
  const before = JSON.stringify(existing)
  const once = migration.mergeCampaigns([existing], [pending])
  const twice = migration.mergeCampaigns(once, [pending])
  assert.equal(twice.length, 1)
  assert.equal(twice[0].id, 'existing-id')
  assert.equal(twice[0].productId, 'p')
  assert.equal(twice[0].supplierId, 'existing-supplier')
  assert.deepEqual(twice[0].proposalSnapshots, existing.proposalSnapshots)
  assert.equal(JSON.stringify(existing), before)
  for (const protection of [{ status: 'settled' }, { deletedAt: '2026-09-01' }]) {
    const protectedCampaign = { ...existing, ...protection }
    assert.deepEqual(migration.mergeCampaigns([protectedCampaign], [pending]), [protectedCampaign])
  }
  assert.throws(() => migration.mergeCampaigns([existing, { ...existing, id: 'duplicate' }], [pending]), /중복/)
  assert.equal(scheduleRequiredErrors(complete).length, 0)
  const created = campaignService.createCampaign({ ...input, campaignName: '필수정보만 있는 테스트 일정' })
  assert(created.campaign)
  assert.equal(created.campaign.productId, '')
  assert.equal(created.campaign.brandId, '')
  assert.deepEqual(created.campaign.proposalSnapshots, [])
  const { SupabaseCampaignRepository } = await server.ssrLoadModule('/src/shared/repositories/campaignRepository.ts')
  const repository = Object.create(SupabaseCampaignRepository.prototype)
  const writes = []
  repository.table = 'campaigns'
  repository.client = { from() { return {
    select: async () => ({ data: [{ id: '12345678-1234-4123-a123-123456789012', metadata: existing }], error: null }),
    upsert: async rows => { writes.push(...rows); return { error: null } },
    delete: () => { throw new Error('Deletion forbidden') },
  } } }
  const saved = await repository.upsertNotionSnapshot([pending.campaign])
  assert.equal(saved.failed, 0)
  assert.equal(writes[0].id, '12345678-1234-4123-a123-123456789012')
  assert.deepEqual(writes[0].metadata.proposalSnapshots, existing.proposalSnapshots)
  assert.equal(repository.toRow(pending.campaign).product_id, null)
  assert.equal(repository.toRow(pending.campaign).brand_id, null)
  const { validateSampleDraft } = await server.ssrLoadModule('/src/features/samples/sampleOrderModel.ts')
  const sample = { productId: 'p', skuId: 'sku', sellerId: 'seller', quantity: 1, recipient: '검증', phone: '01000000000', address: '테스트 주소', purpose: '검증', payer: 'company', supportType: 'full', supportAmount: null, costs: { companyUnitCost: 1000, sellerUnitPrice: 2000 } }
  assert.throws(() => validateSampleDraft(sample, true), /공급처/)
  assert.doesNotThrow(() => validateSampleDraft({ ...sample, supplierId: 'supplier' }, true))
  console.log('PASS: minimal registration, required-field failures, financial-stage guard, source identity, snapshots and deletion protection')
} finally { await server.close() }
