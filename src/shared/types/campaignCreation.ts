import type { CampaignSalesChannelType } from './campaign'

export type CampaignCreationBusinessType = 'general_business' | 'simplified_business' | 'freelancer'
export type EventPayer = 'vendor' | 'seller' | 'company_support'
export type CampaignEventType = 'first_come' | 'purchase_complete' | 'try_it' | 'other'

export interface ProductSalesLinkPolicy {
  defaultSalesChannelType: CampaignSalesChannelType
  wiseShopAvailable: boolean
  sellerCheckoutAvailable: boolean
  brandPgSupportAvailable: boolean
  brandPgSupportRate?: 1 | 2 | 3 | 4 | 5
}

export interface ProductMaster extends Partial<ProductSalesLinkPolicy> {
  id: string
  brandId: string
  brandName: string
  productName: string
  regularPrice: number
  salePrice: number
  shippingAmount: number
  supplyPrice: number
  totalCommissionRate?: number
  sellerCommissionRate?: number
  extraPgSupportRate?: number
  notes: string
  version: number
}

export interface CampaignProductSelection {
  id: string
  brandId: string
  brandName: string
  productId: string
  productName: string
  quantity?: number
  displayOrder: number
}

export interface CampaignProductProposalSnapshot {
  productId: string
  regularPrice: number
  salePrice: number
  shippingAmount: number
  supplyPrice: number
  totalCommissionRate: number
  sellerCommissionRate: number
  extraPgSupportRate: number
  sellerExtraPgRate: number
  defaultSalesChannelType?: CampaignSalesChannelType
  wiseShopAvailable: boolean
  sellerCheckoutAvailable: boolean
  brandPgSupportAvailable: boolean
  brandPgSupportRate?: number
  selectedSalesChannelType?: CampaignSalesChannelType
  effectiveSellerCommissionRate: number
  companyCommissionRate: number
  notes: string
  capturedAt: string
  sourceVersion: number
}

export interface CampaignEvent {
  id: string
  campaignId?: string
  payer: EventPayer
  eventType: CampaignEventType
  targetProductId?: string
  targetProductName?: string
  rewardProductId?: string
  rewardProductName?: string
  rewardUnitPrice: number
  rewardUnitPriceOverridden?: boolean
  plannedQuantity: number
  confirmedQuantity?: number
  estimatedTotalAmount: number
  confirmedTotalAmount?: number
  /** @deprecated 신규 등록은 Campaign 공통 기간을 사용합니다. */
  startDate?: string
  /** @deprecated 신규 등록은 Campaign 공통 기간을 사용합니다. */
  endDate?: string
  memo?: string
  rewardProductMode?: 'master' | 'same_as_target' | 'direct' | 'none'
}

export interface AiCampaignDraft {
  sellerName?: string
  brandName?: string
  productNames: string[]
  startDate?: string
  endDate?: string
  settlementDueDate?: string
  salesChannelType?: CampaignSalesChannelType
  events: Partial<CampaignEvent>[]
  confidence: number
  unresolvedFields: string[]
}

export type CampaignImportSource = { provider: 'notion'; pageUrlOrId: string }
export type CampaignImportPreview = { sourceLabel: string; draft: AiCampaignDraft; mappedFields: string[] }
export interface CampaignImportProvider {
  preview(source: CampaignImportSource): Promise<CampaignImportPreview>
  import(source: CampaignImportSource): Promise<AiCampaignDraft>
}
