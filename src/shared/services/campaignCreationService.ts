import type { Campaign } from '../types/campaign'
import type { AiCampaignDraft, CampaignEvent, CampaignImportProvider, CampaignProductProposalSnapshot, CampaignProductSelection } from '../types/campaignCreation'
import { campaignProductCatalogService } from './campaignProductCatalogService.ts'

export function generateCampaignName({ sellerName, selectedProducts }: { sellerName: string; selectedProducts: CampaignProductSelection[] }) {
  const first = [...selectedProducts].sort((a, b) => a.displayOrder - b.displayOrder)[0]
  if (!sellerName.trim() || !first) return ''
  const extra = selectedProducts.length > 1 ? ` 외 ${selectedProducts.length - 1}종` : ''
  return `${sellerName.trim()} × ${first.brandName} ${first.productName}${extra}`
}

export function calculateSettlementDueDate(endDate: string) {
  return addLocalCalendarDays(endDate, 21)
}

export function calculateWinnerAnnouncementDate(endDate: string) {
  return addLocalCalendarDays(endDate, 7)
}

function addLocalCalendarDays(value: string, days: number) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDateWithWeekday(value?: string) {
  if (!value) return '미입력'
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return value
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${value} (${weekday})`
}

export function getBusinessTypeLabel(value?: string) {
  if (value === 'simplified_business') return '간이사업자'
  if (value === 'freelancer') return '프리랜서'
  if (value === 'general_business' || value === 'corporation' || value === 'individual_business' || value === 'sole_proprietor') return '법인/개인사업자'
  return value || '미입력'
}

export function getSalesChannelTypeLabel(value?: string) {
  if (value === 'supplier_link') return '공급사 링크'
  if (value === 'wise_shop_link') return '와이즈샵 링크'
  if (value === 'seller_checkout') return '셀러 결제창'
  return value || '미입력'
}

export function getEventPayerLabel(value?: string) {
  if (value === 'vendor') return '벤더 부담'
  if (value === 'seller') return '셀러 부담'
  if (value === 'company_support') return '업체 지원'
  if (value === 'manager') return '매니저 부담'
  if (value === 'shared') return '공동 부담'
  return value || '미입력'
}

export function getCampaignEventTypeLabel(value?: string) {
  if (value === 'first_come') return '선착순'
  if (value === 'purchase_complete') return '구매 완료'
  if (value === 'try_it') return '써볼래요'
  if (value === 'other') return '기타'
  return value || '미입력'
}

export function captureProposalSnapshots(selections: CampaignProductSelection[], sellerExtraPgRate = 0, selectedSalesChannelType?: Campaign['salesChannelType']): CampaignProductProposalSnapshot[] {
  return selections.map((selection) => {
    const product = campaignProductCatalogService.getProduct(selection.productId)
    if (!product || !campaignProductCatalogService.hasCompletePolicy(selection.productId)) throw new Error(`선택한 상품에 수수료 정책이 등록되지 않았습니다. 상품 정보를 먼저 완성해주세요. (${selection.productName})`)
    const seller = product.sellerCommissionRate!
    const extra = sellerExtraPgRate
    return {
      productId: product.id, regularPrice: product.regularPrice, salePrice: product.salePrice,
      shippingAmount: product.shippingAmount, supplyPrice: product.supplyPrice,
      totalCommissionRate: product.totalCommissionRate!, sellerCommissionRate: seller,
      extraPgSupportRate: extra, sellerExtraPgRate: extra, effectiveSellerCommissionRate: seller + extra,
      companyCommissionRate: product.totalCommissionRate! - seller - extra, notes: product.notes,
      defaultSalesChannelType: product.defaultSalesChannelType,
      wiseShopAvailable: Boolean(product.wiseShopAvailable),
      sellerCheckoutAvailable: Boolean(product.sellerCheckoutAvailable),
      brandPgSupportAvailable: Boolean(product.brandPgSupportAvailable),
      brandPgSupportRate: product.brandPgSupportAvailable ? product.brandPgSupportRate : undefined,
      selectedSalesChannelType,
      capturedAt: new Date().toISOString(), sourceVersion: product.version,
    }
  })
}

export function normalizeCampaignProducts(campaign: Campaign): CampaignProductSelection[] {
  if (campaign.campaignProducts?.length) return campaign.campaignProducts
  return [{ id: `legacy-${campaign.id}-${campaign.productId}`, brandId: campaign.brandId, brandName: campaign.brandName, productId: campaign.productId, productName: campaign.productName, displayOrder: 0 }]
}

export function normalizeCreationBusinessType(value: string) {
  if (value === 'simplified_business') return 'simplified_business' as const
  if (value === 'freelancer') return 'freelancer' as const
  return 'general_business' as const
}

export function calculateEventAmounts(event: CampaignEvent): CampaignEvent {
  return { ...event, estimatedTotalAmount: event.rewardUnitPrice * event.plannedQuantity, confirmedTotalAmount: event.confirmedQuantity === undefined ? undefined : event.rewardUnitPrice * event.confirmedQuantity }
}

export function summarizeEvents(events: CampaignEvent[]) {
  const byPayer: Record<CampaignEvent['payer'], number> = { vendor: 0, seller: 0, company_support: 0, manager: 0, shared: 0 }
  events.forEach((event) => { byPayer[event.payer] += event.estimatedTotalAmount })
  return { ...byPayer, total: Object.values(byPayer).reduce((sum, amount) => sum + amount, 0) }
}

export function getCampaignEventErrors(event: CampaignEvent) {
  const errors: string[] = []
  const requiresProducts = event.eventType !== 'other'
  if (requiresProducts && !event.targetProductId) errors.push(event.eventType === 'try_it' ? '체험 대상 상품을 선택해주세요.' : '이벤트 적용 상품을 선택해주세요.')
  if (requiresProducts && !event.rewardProductName) errors.push('증정·경품 상품을 선택해주세요.')
  if ((event.eventType === 'first_come' || event.eventType === 'purchase_complete') && event.plannedQuantity <= 0) errors.push('예정 수량을 입력해주세요.')
  return errors
}

const mockDraft: AiCampaignDraft = {
  sellerName: '김민지', brandName: '락앤락', productNames: ['밀폐용기 6종 세트', '메트로 텀블러'],
  startDate: '2026-08-01', endDate: '2026-08-07', settlementDueDate: calculateSettlementDueDate('2026-08-07'),
  salesChannelType: 'wise_shop_link', confidence: 0.86, unresolvedFields: ['셀러 마스터 매칭', '담당 매니저'],
  events: [{ payer: 'vendor', eventType: 'first_come', rewardProductName: '메트로 텀블러', plannedQuantity: 30, rewardUnitPrice: 29900 }],
}

export const mockNotionCampaignImportProvider: CampaignImportProvider = {
  async preview(source) { return { sourceLabel: source.pageUrlOrId || 'Mock Notion Page', draft: mockDraft, mappedFields: ['셀러', '브랜드', '상품', '기간', '판매 링크', '이벤트'] } },
  async import() { return structuredClone(mockDraft) },
}

export const mockAiCampaignDraftService = {
  async createDraft(input: string): Promise<AiCampaignDraft> {
    return { ...structuredClone(mockDraft), confidence: input.trim() ? 0.86 : 0.4, unresolvedFields: input.trim() ? mockDraft.unresolvedFields : ['자연어 입력'] }
  },
}
