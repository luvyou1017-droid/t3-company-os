const creation = await import('../src/shared/services/campaignCreationService.ts')
const { campaignProductCatalogService } = await import('../src/shared/services/campaignProductCatalogService.ts')

const products = campaignProductCatalogService.listProductsByBrand('brand-locknlock').slice(0, 2).map((product, displayOrder) => ({
  id: `selection-${product.id}`, brandId: product.brandId, brandName: product.brandName,
  productId: product.id, productName: product.productName, displayOrder,
}))
const snapshots = creation.captureProposalSnapshots(products)
const events = [
  creation.calculateEventAmounts({ id: 'event-1', payer: 'vendor', eventType: 'first_come', rewardUnitPrice: 12000, plannedQuantity: 30, estimatedTotalAmount: 0 }),
  creation.calculateEventAmounts({ id: 'event-2', payer: 'seller', eventType: 'purchase_complete', rewardUnitPrice: 5000, plannedQuantity: 10, estimatedTotalAmount: 0 }),
]
const summary = creation.summarizeEvents(events)
const legacy = {
  id: 'legacy', campaignCode: 'LEGACY', campaignName: '기존 일정', sellerId: 's', sellerName: '셀러',
  brandId: 'b', brandName: '브랜드', productId: 'p', productName: '기존 단일 상품', managerId: 'm',
  managerName: '매니저', mdId: 'md', mdName: 'MD', startDate: '2026-01-01', endDate: '2026-01-02',
  linkOwner: '자사', businessType: '법인사업자', settlementDueDate: '2026-01-23', createdAt: '', updatedAt: '',
}

const checks = [
  ['공동구매명 자동 생성', creation.generateCampaignName({ sellerName: '윤정마켓', selectedProducts: products }) === '윤정마켓 × 락앤락 밀폐용기 6종 세트 외 1종'],
  ['다중 상품 snapshot', snapshots.length === 2 && snapshots.every((item) => item.sourceVersion > 0)],
  ['수수료 자동 계산', snapshots[0].effectiveSellerCommissionRate === snapshots[0].sellerCommissionRate + snapshots[0].extraPgSupportRate],
  ['정산 예정일 +21일', creation.calculateSettlementDueDate('2026-08-07') === '2026-08-28'],
  ['발표자 선정일 +7일', creation.calculateWinnerAnnouncementDate('2026-08-02') === '2026-08-09'],
  ['로컬 날짜 요일 표시', creation.formatDateWithWeekday('2026-07-27') === '2026-07-27 (월)'],
  ['사업자 유형 한글 표시', creation.getBusinessTypeLabel('corporation') === '법인/개인사업자' && creation.getBusinessTypeLabel('freelancer') === '프리랜서'],
  ['판매 링크 한글 표시', creation.getSalesChannelTypeLabel('wise_shop_link') === '와이즈샵 링크'],
  ['이벤트 한글 표시', creation.getEventPayerLabel('company_support') === '업체 지원' && creation.getCampaignEventTypeLabel('try_it') === '써볼래요'],
  ['이벤트 자동 계산', events[0].estimatedTotalAmount === 360000],
  ['부담 주체별 합산', summary.vendor === 360000 && summary.seller === 50000 && summary.total === 410000],
  ['기존 단일 상품 호환', creation.normalizeCampaignProducts(legacy).length === 1 && creation.normalizeCampaignProducts(legacy)[0].productName === '기존 단일 상품'],
  ['기존 사업자 유형 호환', creation.normalizeCreationBusinessType('corporation') === 'general_business' && creation.normalizeCreationBusinessType('individual_business') === 'general_business'],
]

for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
