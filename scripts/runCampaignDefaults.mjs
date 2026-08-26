const memory = new Map()
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) }
globalThis.window = { dispatchEvent: () => {} }
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail } }

const { sellerMasterService } = await import('../src/shared/services/sellerMasterService.ts')
const { campaignProductCatalogService, validateProductSalesLinkPolicy } = await import('../src/shared/services/campaignProductCatalogService.ts')
const { captureProposalSnapshots, getCampaignEventErrors } = await import('../src/shared/services/campaignCreationService.ts')
const { getCommonAvailableSalesChannels, resolveProductSalesChannelDefaults } = await import('../src/shared/utils/campaignDefaults.ts')
const { campaignDraftService } = await import('../src/shared/services/campaignDraftService.ts')

const selection = (id, displayOrder) => {
  const product = campaignProductCatalogService.getProduct(id)
  return { id: `selection-${id}`, brandId: product.brandId, brandName: product.brandName, productId: id, productName: product.productName, displayOrder }
}
const one = [selection('prd-lock-001', 0)]
const sameDefaults = [selection('prd-lock-001', 0), selection('prd-lock-002', 1)]
const mixedDefaults = [selection('prd-lock-001', 0), selection('prd-lock-003', 1)]
const snapshot = captureProposalSnapshots(one, 2, 'seller_checkout')[0]
const supplierSnapshot = captureProposalSnapshots([selection('prd-lock-003', 0)], 0, 'supplier_link')[0]
const seller = sellerMasterService.getDefaults('seller-kim-minji')
const base = {
  sellerId: seller.id, sellerName: seller.name, businessType: seller.businessType,
  brandId: one[0].brandId, products: one, salesChannelType: 'seller_checkout',
  salesChannelSource: 'manual', salesChannelManuallyOverridden: true, sellerExtraPgRate: 2,
  startDate: '2026-08-01', endDate: '2026-08-07', linkOpenTime: '', linkCloseTime: '',
  settlementDueDate: '2026-08-28', settlementDueDateOverridden: false,
  winnerAnnouncementDate: '', winnerAnnouncementDateOverride: false,
  managerId: seller.defaultManagerId, mdId: seller.defaultMdId, memo: '', events: [],
  campaignName: '', nameOverridden: false,
}
const saved = campaignDraftService.createCampaignDraft('u-001', '허윤정', base)
const restored = campaignDraftService.getCampaignDraftById(saved.id)?.formData
const invalidProduct = { ...campaignProductCatalogService.getProduct('prd-lock-001'), defaultSalesChannelType: 'wise_shop_link', wiseShopAvailable: false }

const checks = [
  ['셀러 검색과 기본 정보 자동 연동', seller?.businessType === 'simplified_business' && seller.defaultManagerName === '김병희'],
  ['상품 1개 기본 링크 자동 적용', resolveProductSalesChannelDefaults(one).salesChannelType === 'wise_shop_link'],
  ['동일 기본 링크 다중 상품 자동 적용', resolveProductSalesChannelDefaults(sameDefaults).salesChannelType === 'wise_shop_link'],
  ['다중 상품 기본 링크 충돌', resolveProductSalesChannelDefaults(mixedDefaults).source === 'mixed_products'],
  ['다중 상품 공통 링크 계산', getCommonAvailableSalesChannels(sameDefaults).join(',') === 'supplier_link,wise_shop_link'],
  ['사용 불가 기본 링크 저장 차단', validateProductSalesLinkPolicy(invalidProduct)?.includes('사용 불가 상태')],
  ['브랜드 4%와 셀러 추가 2% 분리', snapshot.brandPgSupportRate === 4 && snapshot.sellerExtraPgRate === 2],
  ['최종 셀러 수수료 계산', snapshot.effectiveSellerCommissionRate === snapshot.sellerCommissionRate + 2],
  ['배송비 snapshot 유지', snapshot.shippingAmount === 0],
  ['업체링크 %p 차감 snapshot', supplierSnapshot.supplierLinkPgDeductionRate === 5 && supplierSnapshot.actualCommissionRate === supplierSnapshot.totalCommissionRate - 5],
  ['업체링크 스룩페이 비용 미생성', supplierSnapshot.actualSalesChannel === 'supplier_link' && supplierSnapshot.actualPgCost === undefined],
  ['자동 적용 출처와 override draft 복원', restored?.salesChannelSource === 'manual' && restored.salesChannelManuallyOverridden && restored.sellerExtraPgRate === 2],
  ['이벤트 필수값 규칙', getCampaignEventErrors({ id: 'e', payer: 'vendor', eventType: 'first_come', rewardUnitPrice: 0, plannedQuantity: 0, estimatedTotalAmount: 0 }).length === 3],
]
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
