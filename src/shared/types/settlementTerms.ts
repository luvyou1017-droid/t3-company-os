import type { CampaignSalesChannelType } from './campaign'

export type SettlementSkuCondition = {
  detailOption?: string
  skuOptionName?: string
  skuId: string
  productId: string
  productName: string
  optionName: string
  supplyLabel?: string
  conditionOrigin?: string
  salesOptionName?: string
  sellerSupplyPrice?: number
  groupBuyPrice: number
  totalCommissionRate?: number
  sellerCommissionRate?: number
}
export type SettlementTerms = {
  sellerCheckoutPricingVersion?: 2
  salesChannelType: CampaignSalesChannelType
  moneyCollector: 'seller' | 'company' | 'supplier'
  confirmedAt: string
  skuConditions: SettlementSkuCondition[]
}
export type SettlementDocumentAuthor = 'supplier' | 'seller' | 'company'
export type SettlementDocumentKind = 'customer_sales' | 'supplier_cost' | 'supplier_net_settlement' | 'combined_commission'
