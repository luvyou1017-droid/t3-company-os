import type { CampaignSalesChannelType } from './campaign'
import type { SupplierLinkPgPolicy } from '../../features/productMaster/types'

export type CampaignCreationBusinessType = 'general_business' | 'simplified_business' | 'freelancer'
export type EventPayer = 'vendor' | 'seller' | 'company' | 'company_support' | 'manager' | 'shared'
export type CampaignEventCostOwner = 'seller' | 'company' | 'vendor' | 'manager'
export interface CampaignEventCostShare {
  owner: CampaignEventCostOwner
  rate?: number
  amount?: number
}
export type CampaignEventType = 'first_come' | 'purchase_complete' | 'try_it' | 'other'
export type CampaignEventCostHandling = 'company_direct' | 'vendor_free' | 'manager_prepaid'
export type CampaignEventShippingStatus = 'winner_registration_pending' | 'shipping_pending' | 'scheduled_this_week' | 'shipped'
export type ManagerPrepaymentStatus = 'not_requested' | 'approval_pending' | 'approved' | 'unapproved' | 'evidence_confirmed'

export interface ProductSalesLinkPolicy {
  defaultSalesChannelType: CampaignSalesChannelType
  wiseShopAvailable: boolean
  sellerCheckoutAvailable: boolean
  brandPgSupportAvailable: boolean
  brandPgSupportRate?: 1 | 2 | 3 | 4 | 5
  supplierLinkAvailable?: boolean
  supplierLinkPgPolicy?: SupplierLinkPgPolicy
  supplierLinkPgDeductionRate?: number
  wiseSrookPgRate?: number
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
  actualSalesChannel: CampaignSalesChannelType
  supplierLinkAvailable: boolean
  supplierLinkPgPolicy: SupplierLinkPgPolicy
  supplierLinkPgDeductionRate?: number
  wiseSrookLinkAvailable: boolean
  wiseSrookPgRate?: number
  sellerCheckoutPgSupportRate?: number
  actualCommissionRate: number
  actualSellerCommissionRate: number
  actualPgCost?: number
  actualPgSupport?: number
  salesChannelOverridden: boolean
  salesChannelOverrideReason?: string
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
  costShares?: CampaignEventCostShare[]
  rewardProductMode?: 'master' | 'same_as_target' | 'direct' | 'none'
  eventName?: string
  costHandling?: CampaignEventCostHandling
  shippingOwner?: 'company' | 'vendor'
  shippingStatus?: CampaignEventShippingStatus
  winners?: Array<{ id: string; name: string; contact?: string }>
  winnerCountConfirmed?: boolean
  managerPrepayment?: {
    status: ManagerPrepaymentStatus
    reason?: string
    requestedAmount?: number
    approvedAmount?: number
    actualAmount?: number
    evidenceConfirmed?: boolean
    paidAt?: string
    managerId?: string
  }
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
