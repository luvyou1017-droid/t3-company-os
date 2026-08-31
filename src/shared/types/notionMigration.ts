import type { Campaign } from './campaign'

export type NotionIntegratedListRecord = {
  sourceId: string
  title: string
  startDate: string
  endDate?: string
  landingPage?: '공급사' | '와이즈(스룩)' | '와이즈(네이버)' | '셀러'
  sellerId: string
  sellerName: string
  productId: string
  productName: string
  supplierId?: string
  supplierName?: string
  managerId: string
  managerName: string
  inputCompleted?: boolean
  landingPageCompleted?: boolean
  settlementDocumentCompleted?: boolean
  sellerSettlementCompleted?: boolean
  managerSettlementCompleted?: boolean
  supplierSettlementCompleted?: boolean
  sellerDeductionMemo?: string
  vendorDeductionMemo?: string
}

export type NotionCampaignMigrationPreview = {
  source: NotionIntegratedListRecord
  campaign: Campaign
  warnings: string[]
}

