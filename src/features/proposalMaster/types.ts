export type ProposalStatus = 'draft' | 'reviewing' | 'shareable' | 'archived'
export type ProposalMasterRole = 'admin' | 'md' | 'team_lead' | 'manager' | 'settlement' | 'seller'
export type ProposalSaveState = 'idle' | 'saving' | 'saved' | 'failed'

export interface ProposalProductItem {
  id: string
  proposalId?: string
  productId: string
  skuIds: string[]
  vendorId?: string
  vendorName?: string
  brandId: string
  brandName: string
  productName: string
  displayProductName?: string
  imageUrl?: string
  additionalImageUrls?: string[]
  optionSummary?: string
  compositionText?: string
  regularPrice: number
  groupBuyPrice: number
  discountRate: number
  sellerCommissionRate?: number
  shippingText?: string
  sampleText?: string
  keyPoints: string[]
  sellerDescription?: string
  displayOrder: number
  visibleInSharedView: boolean
  representative: boolean
  priceOverridden?: boolean
  commissionOverridden?: boolean
  sourceVersion: number
  capturedAt: string
  // Internal snapshot. Never pass this object to the shared preview component.
  internalSnapshot: {
    supplyPrice: number
    totalCommissionRate: number
    companyCommissionRate: number
    brandPgSupportAvailable: boolean
    brandPgSupportRate?: number
    wiseShopAvailable: boolean
    sellerCheckoutAvailable: boolean
    defaultSalesChannelType: string
    settlementMemo?: string
    internalMemo?: string
  }
}

export interface ProposalShippingGuide {
  courierName?: string
  shippingFee?: number
  freeShippingThreshold?: number
  jejuExtraFee?: number
  islandExtraFee?: number
  bundleShippingAvailable?: boolean
  shippingSchedule?: string
  orderDeadlineTime?: string
  sampleAvailable: boolean
  sampleConditions?: string
  exchangeReturnNotes?: string
  operationNotes?: string
}

export interface ProposalMaster {
  id: string
  proposalName: string
  title: string
  subtitle?: string
  category?: string
  vendorId?: string
  vendorName?: string
  brandIds: string[]
  brandNames: string[]
  representativeImageUrl?: string
  referenceDate: string
  status: ProposalStatus
  authorName: string
  mdName?: string
  managerName?: string
  managerContact?: string
  spreadsheetUrl?: string
  previewImageUrls: string[]
  sharedImageUrls: string[]
  internalBoardSharedAt?: string
  internalMemo?: string
  sellingPoints: string[]
  shippingGuide: ProposalShippingGuide
  productItems: ProposalProductItem[]
  sourceProposalId?: string
  campaignCreationReady: boolean
  testData?: boolean
  createdAt: string
  updatedAt: string
  version: number
}

export type ProposalMasterInput = Omit<ProposalMaster, 'createdAt' | 'updatedAt' | 'version'>

/** Strict allow-list model consumed by the shareable preview only. */
export interface SharedProposalView {
  id: string
  companyLabel: string
  title: string
  subtitle?: string
  category?: string
  vendorOrBrand?: string
  referenceDateLabel: string
  representativeImageUrl?: string
  sellingPoints: string[]
  shippingGuide: {
    courierName?: string
    shippingText: string
    sampleText: string
    exchangeReturnNotes?: string
    operationNotes?: string
  }
  contact: { managerName: string; managerContact?: string }
  products: Array<{
    id: string
    brandName: string
    productName: string
    imageUrl?: string
    compositionText?: string
    regularPrice: number
    groupBuyPrice: number
    discountRate: number
    sellerCommissionRate?: number
    shippingText?: string
    sampleText?: string
    keyPoints: string[]
    representative: boolean
  }>
}

export interface ExportResult {
  success: boolean
  message: string
}

export interface ProposalExportService {
  exportToPng(proposalId: string): Promise<ExportResult>
  exportToPdf(proposalId: string): Promise<ExportResult>
  print(proposalId: string): void
}

export interface CampaignProposalSelection {
  proposalId: string
  proposalName: string
  products: Array<{ productId: string; skuIds: string[]; productName: string; brandName: string }>
  sourceVersion: number
}
