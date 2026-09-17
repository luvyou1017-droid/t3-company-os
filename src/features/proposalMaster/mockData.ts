import type { ProposalMaster, ProposalProductItem } from './types'

const capturedAt = '2026-07-28T09:00:00.000Z'
const internalSnapshot = {
  supplyPrice: 21000, totalCommissionRate: 25, companyCommissionRate: 8,
  brandPgSupportAvailable: false, wiseShopAvailable: true, sellerCheckoutAvailable: true,
  defaultSalesChannelType: 'wise_shop_link', settlementMemo: '[TEST] 내부 정산 확인 필요',
}
const item = (value: Partial<ProposalProductItem> & Pick<ProposalProductItem, 'id' | 'productId' | 'brandId' | 'brandName' | 'productName' | 'regularPrice' | 'groupBuyPrice'>): ProposalProductItem => ({
  skuIds: [], keyPoints: [], displayOrder: 0, visibleInSharedView: true, representative: false,
  discountRate: Math.round((1 - value.groupBuyPrice / value.regularPrice) * 100), sellerCommissionRate: 17,
  sourceVersion: 1, capturedAt, internalSnapshot, ...value,
})

export const mockProposals: ProposalMaster[] = [
  {
    id: 'proposal-test-food', proposalName: '[TEST] 와이즈 제안서 · 식품 · 푸드웍스 · 데일리푸드 · 2026-07-28',
    title: '간편하고 든든한 데일리 푸드 제안', subtitle: '바쁜 일상에 맞춘 실용적인 식품 구성', category: '식품',
    vendorId: 'vendor-test-food', vendorName: '[TEST] 푸드웍스', brandIds: ['brand-test-food'], brandNames: ['[TEST] 데일리푸드'],
    representativeImageUrl: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&w=900&q=80',
    referenceDate: '2026-07-28', status: 'shareable', authorName: '유시철', mdName: '유시철', managerName: '김병희',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/TEST-FOOD-PROPOSAL', previewImageUrls: ['https://placehold.co/1080x1350/f8fafc/334155?text=TEST+Food+Capture'],
    sharedImageUrls: [], sellingPoints: ['간편한 개별 포장', '아침 식사와 간식으로 활용', '가족 단위 고객에게 추천', '샘플 협의 가능'],
    shippingGuide: { courierName: '롯데택배', shippingFee: 3000, freeShippingThreshold: 50000, jejuExtraFee: 3000, islandExtraFee: 5000, bundleShippingAvailable: true, shippingSchedule: '주문 확인 후 순차 출고', orderDeadlineTime: '11:00', sampleAvailable: true, sampleConditions: '담당 매니저와 수량 협의', exchangeReturnNotes: '식품 특성상 단순 변심 반품은 담당자 확인이 필요합니다.' },
    productItems: [item({ id: 'ppi-food-1', productId: 'product-test-003', skuIds: ['product-test-003-sku-1'], vendorId: 'vendor-test-food', vendorName: '[TEST] 푸드웍스', brandId: 'brand-test-food', brandName: '[TEST] 데일리푸드', productName: '[TEST] 단백질 쉐이크 14팩', imageUrl: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&w=900&q=80', optionSummary: '초코 14팩 · 곡물 14팩', compositionText: '한 끼 대용 14팩 구성', regularPrice: 48000, groupBuyPrice: 34900, keyPoints: ['고단백 간편식', '개별 포장', '휴대와 보관이 간편'], representative: true })],
    campaignCreationReady: true, testData: true, createdAt: capturedAt, updatedAt: capturedAt, version: 1,
  },
  {
    id: 'proposal-test-living', proposalName: '[TEST] 와이즈 제안서 · 생활 · 홈앤코 · 리빙랩 · 2026-07-28',
    title: '집안일을 가볍게 만드는 리빙 컬렉션', subtitle: '실용성과 반복 구매 가능성을 함께 제안합니다.', category: '생활',
    vendorId: 'vendor-test-home', vendorName: '[TEST] 홈앤코', brandIds: ['brand-test-living'], brandNames: ['[TEST] 리빙랩'],
    representativeImageUrl: 'https://images.unsplash.com/photo-1584634731339-252c581abfc5?auto=format&fit=crop&w=900&q=80',
    referenceDate: '2026-07-28', status: 'reviewing', authorName: '유시철', mdName: '유시철', managerName: '서주희',
    previewImageUrls: [], sharedImageUrls: [], sellingPoints: ['주방 정리 고민 해결', '다양한 가족 구성에 맞는 옵션', '선물용으로도 활용 가능'],
    shippingGuide: { courierName: 'CJ대한통운', shippingFee: 0, bundleShippingAvailable: true, shippingSchedule: '평일 기준 2~3일 내 출고', orderDeadlineTime: '14:00', sampleAvailable: true, sampleConditions: '대표 SKU 1세트 지원' },
    productItems: [
      item({ id: 'ppi-life-1', productId: 'product-test-001', skuIds: ['product-test-001-sku-1','product-test-001-sku-2'], vendorId: 'vendor-test-home', vendorName: '[TEST] 홈앤코', brandId: 'brand-test-living', brandName: '[TEST] 리빙랩', productName: '[TEST] 올인원 밀폐용기 세트', imageUrl: 'https://images.unsplash.com/photo-1584634731339-252c581abfc5?auto=format&fit=crop&w=900&q=80', compositionText: '6종 기본 또는 10종 패밀리 구성', regularPrice: 69000, groupBuyPrice: 39900, keyPoints: ['깔끔한 수납', '실용적인 구성'], representative: true }),
      item({ id: 'ppi-life-2', productId: 'product-test-004', skuIds: ['product-test-004-sku-1'], vendorId: 'vendor-test-life', vendorName: '[TEST] 라이프유통', brandId: 'brand-test-life', brandName: '[TEST] 홈데이', productName: '[TEST] 프리미엄 타월 세트', imageUrl: 'https://images.unsplash.com/photo-1583845112203-29329902332e?auto=format&fit=crop&w=900&q=80', compositionText: '화이트 타월 5장', regularPrice: 56000, groupBuyPrice: 36900, keyPoints: ['도톰한 중량', '부드러운 촉감'], displayOrder: 1 }),
    ],
    campaignCreationReady: true, testData: true, createdAt: capturedAt, updatedAt: capturedAt, version: 1,
  },
]
