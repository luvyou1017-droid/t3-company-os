import type { CampaignSalesChannelType } from '../../shared/types/campaign'

export type ProductPgSupportRate = 1 | 2 | 3 | 4 | 5

export interface ProductMaster {
  id: string
  productCode: string
  brandId: string
  brandName: string
  productName: string
  category?: string
  imageUrl?: string
  memo?: string
  regularPrice: number
  salePrice: number
  supplyPrice: number
  shippingFee: number
  freeShippingThreshold?: number
  totalCommissionRate: number
  sellerCommissionRate: number
  companyCommissionRate: number
  defaultSalesChannelType: CampaignSalesChannelType
  wiseShopAvailable: boolean
  sellerCheckoutAvailable: boolean
  brandPgSupportAvailable: boolean
  brandPgSupportRate?: ProductPgSupportRate
  courierName?: string
  jejuExtraFee?: number
  islandExtraFee?: number
  bundleShippingAvailable?: boolean
  orderDeadlineTime?: string
  sampleSupportType?: string
  manufactureInfo?: string
  shelfLifeInfo?: string
  orderMemo?: string
  settlementMemo?: string
  internalMemo?: string
  active: boolean
  testData?: boolean
  createdAt: string
  updatedAt: string
  version: number
}

export type ProductMasterInput = Omit<ProductMaster, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'companyCommissionRate'> & {
  companyCommissionRate?: number
}

export interface CampaignProductMasterSnapshot {
  productMasterId: string
  productMasterVersion: number
  capturedAt: string
  regularPrice: number
  salePrice: number
  supplyPrice: number
  shippingFee: number
  freeShippingThreshold?: number
  totalCommissionRate: number
  sellerCommissionRate: number
  defaultSalesChannelType: CampaignSalesChannelType
  wiseShopAvailable: boolean
  sellerCheckoutAvailable: boolean
  brandPgSupportAvailable: boolean
  brandPgSupportRate?: ProductPgSupportRate
  shippingPolicy: Pick<ProductMaster, 'courierName' | 'jejuExtraFee' | 'islandExtraFee' | 'bundleShippingAvailable' | 'orderDeadlineTime'>
  sampleSupportType?: string
}
