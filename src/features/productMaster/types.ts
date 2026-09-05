import type { CampaignSalesChannelType } from '../../shared/types/campaign'
import type { CommissionCalculationType } from '../../shared/types/commission'

export type ProductPgSupportRate = 1 | 2 | 3 | 4 | 5
export type SupplierLinkPgPolicy = 'supplier_bears_pg' | 'deduct_from_commission_rate' | 'manual'
export type PolicySource = 'vendor' | 'brand' | 'product' | 'sku'
export type SellerPortalStatus = 'available' | 'coming_soon' | 'paused' | 'sold_out' | 'closed'
export type ProductBadge = 'new' | 'popular' | 'recommended' | 'recently_successful'
export type ProductStockStatus = 'available' | 'limited' | 'out_of_stock' | 'discontinued'
export type ProductSkuPricingType = 'fixed' | 'quantity_tier'

export interface ProductPolicy {
  regularPrice: number
  groupBuyPrice: number
  supplyPrice: number
  shippingFee: number
  freeShippingThreshold?: number
  totalCommissionRate: number
  sellerCommissionRate: number
  defaultSalesChannelType: CampaignSalesChannelType
  supplierLinkAvailable?: boolean
  supplierLinkPgPolicy?: SupplierLinkPgPolicy
  supplierLinkPgDeductionRate?: number
  wiseShopAvailable: boolean
  wiseSrookPgRate?: number
  sellerCheckoutAvailable: boolean
  brandPgSupportAvailable: boolean
  brandPgSupportRate?: ProductPgSupportRate
  courierName?: string
  orderDeadlineTime?: string
}

export type ProductPolicyOverrides = Partial<ProductPolicy>

export interface ProductSku {
  id: string
  skuCode: string
  productId: string
  productName?: string
  category?: string
  optionName: string
  optionValues?: Record<string, string>
  pricingType?: ProductSkuPricingType
  minimumQuantity?: number
  maximumQuantity?: number
  policyOverrides?: ProductPolicyOverrides
  regularPrice: number
  groupBuyPrice: number
  supplyPrice: number
  shippingFee?: number
  freeShippingThreshold?: number
  totalCommissionRate?: number
  sellerCommissionRate?: number
  defaultSalesChannelType?: CampaignSalesChannelType
  wiseShopAvailable?: boolean
  sellerCheckoutAvailable?: boolean
  brandPgSupportAvailable?: boolean
  brandPgSupportRate?: ProductPgSupportRate
  stockStatus?: ProductStockStatus
  sellerPortalVisible?: boolean
  representative?: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface VendorMaster {
  id: string
  vendorName: string
  defaultPolicy?: ProductPolicyOverrides
}

export interface BrandMaster {
  id: string
  vendorId?: string
  brandName: string
  defaultPolicy?: ProductPolicyOverrides
}

export interface Proposal {
  id: string
  proposalName: string
  vendorId?: string
  brandIds: string[]
  productIds: string[]
  skuIds: string[]
  spreadsheetUrl?: string
  previewImageUrls: string[]
  category?: string
  active: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ProductCampaignReference {
  id: string
  sellerName: string
  campaignDate?: string
  salesAmount?: number
  note?: string
  linkUrl?: string
}

export interface ProductMaster {
  id: string
  productCode: string
  vendorId?: string
  vendorName?: string
  brandId: string
  brandName: string
  productName: string
  category?: string
  subCategory?: string
  imageUrl?: string
  representativeImageUrl?: string
  productUrl?: string
  additionalImageUrls?: string[]
  internalDescription?: string
  sellerDescription?: string
  memo?: string
  regularPrice: number
  salePrice: number
  supplyPrice: number
  shippingFee: number
  freeShippingThreshold?: number
  totalCommissionRate: number
  sellerCommissionRate: number
  companyCommissionRate: number
  commissionCalculationType?: CommissionCalculationType
  defaultSalesChannelType: CampaignSalesChannelType
  supplierLinkAvailable?: boolean
  supplierLinkPgPolicy?: SupplierLinkPgPolicy
  supplierLinkPgDeductionRate?: number
  wiseShopAvailable: boolean
  wiseSrookPgRate?: number
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
  defaultPolicy?: ProductPolicy
  skus: ProductSku[]
  sellerPortalVisible: boolean
  partnerPortalVisible?: boolean
  partnerDescription?: string
  partnerMinimumOrder?: string
  partnerSupplyNote?: string
  sourceFileName?: string
  sourceSpreadsheetUrl?: string
  sourceImportedAt?: string
  sellerPortalStatus: SellerPortalStatus
  badges?: ProductBadge[]
  sampleAvailable: boolean
  managerName?: string
  managerContact?: string
  campaignReferences?: ProductCampaignReference[]
  active: boolean
  testData?: boolean
  createdAt: string
  updatedAt: string
  version: number
}

export type ProductMasterInput = Omit<ProductMaster, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'companyCommissionRate'> & {
  companyCommissionRate?: number
}

export interface ResolvedPolicyValue<T> {
  value: T | undefined
  source: PolicySource
}

export type ResolvedProductPolicy = {
  [K in keyof ProductPolicy]: ResolvedPolicyValue<ProductPolicy[K]>
}

/** Seller-safe DTO. Internal values must never be added to this shape. */
export interface SellerCatalogProduct {
  id: string
  brandName: string
  productName: string
  category?: string
  representativeImageUrl?: string
  productUrl?: string
  additionalImageUrls: string[]
  sellerDescription?: string
  regularPriceRange: [number, number]
  groupBuyPriceRange: [number, number]
  shippingGuide: string
  sampleAvailable: boolean
  sellerPortalStatus: SellerPortalStatus
  badges: ProductBadge[]
  options: Array<{ id: string; optionName: string; regularPrice: number; groupBuyPrice: number; stockStatus: ProductStockStatus }>
  managerName: string
  managerContact?: string
}

/** Approved partner-vendor DTO. Seller fees and company margin must never be added here. */
export interface PartnerCatalogProduct {
  id: string
  brandName: string
  productName: string
  category?: string
  representativeImageUrl?: string
  productUrl?: string
  description?: string
  shippingGuide: string
  minimumOrder?: string
  supplyNote?: string
  options: Array<{ id: string; optionName: string; groupBuyPrice: number; supplyPrice: number; stockStatus: ProductStockStatus }>
  managerName: string
  managerContact?: string
}

export interface CampaignProductMasterSnapshot {
  productMasterId: string
  skuId?: string
  skuCode?: string
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
  supplierLinkAvailable: boolean
  supplierLinkPgPolicy: SupplierLinkPgPolicy
  supplierLinkPgDeductionRate?: number
  wiseShopAvailable: boolean
  wiseSrookPgRate?: number
  sellerCheckoutAvailable: boolean
  brandPgSupportAvailable: boolean
  brandPgSupportRate?: ProductPgSupportRate
  actualSalesChannel: CampaignSalesChannelType
  actualCommissionRate: number
  actualSellerCommissionRate: number
  actualPgCost?: number
  actualPgSupport?: number
  salesChannelOverridden: boolean
  salesChannelOverrideReason?: string
  shippingPolicy: Pick<ProductMaster, 'courierName' | 'jejuExtraFee' | 'islandExtraFee' | 'bundleShippingAvailable' | 'orderDeadlineTime'>
  sampleSupportType?: string
  policySources?: Partial<Record<keyof ProductPolicy, PolicySource>>
}
