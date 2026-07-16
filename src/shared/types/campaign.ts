export type LinkOwner = '자사' | '브랜드사' | '셀러'

export type BusinessType = '개인사업자' | '법인사업자' | '미정'

export type Campaign = {
  id: string
  campaignCode: string
  campaignName: string
  sellerId: string
  sellerName: string
  brandId: string
  brandName: string
  productId: string
  productName: string
  managerId: string
  managerName: string
  mdId: string
  mdName: string
  startDate: string
  endDate: string
  linkOwner: LinkOwner
  businessType: BusinessType
  settlementDueDate: string
  createdAt: string
  updatedAt: string
  status?: 'draft' | 'preparing' | 'active' | 'closed' | 'settled'
  round?: string
  options?: string[]
  supportCompany?: string
  contact?: string
  todayTask?: string
  landingPageCompleted?: boolean
  pendingTaskCount?: number
  pendingCsCount?: number
  pendingSampleCount?: number
  linkReviewPending?: boolean
  orderPending?: boolean
  vendorSettlementCompleted?: boolean
  settlementDocumentCompleted?: boolean
  sellerPaymentCompleted?: boolean
  managerPaymentCompleted?: boolean
  revenue?: string
}

export type CampaignSummary = {
  id: string
  campaignCode: string
  campaignName: string
  sellerName: string
  brandName: string
  productName: string
  managerName: string
  mdName: string
  period: string
  linkOwner: LinkOwner
  businessType: BusinessType
}

export type CampaignRelatedCounts = {
  csCount: number
  sampleCount: number
  workItemCount: number
  notificationCount: number
}
