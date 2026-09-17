import type { CampaignSalesChannelType } from './campaign'

export type SettlementSkuCondition = {
  skuId: string
  productId: string
  productName: string
  optionName: string
  supplyLabel?: string
  conditionOrigin?: string
  salesOptionName?: string
  groupBuyPrice: number
  totalCommissionRate?: number
  sellerCommissionRate?: number
}
export type SettlementTerms = {
  salesChannelType: CampaignSalesChannelType
  moneyCollector: 'seller' | 'company' | 'supplier'
  confirmedAt: string
  skuConditions: SettlementSkuCondition[]
}
export type SettlementDocumentAuthor = 'supplier' | 'seller' | 'company'
export type SettlementDocumentKind = 'customer_sales' | 'supplier_cost' | 'supplier_net_settlement' | 'combined_commission'
