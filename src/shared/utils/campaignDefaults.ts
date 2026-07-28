import type { CampaignSalesChannelType } from '../types/campaign'
import type { CampaignProductSelection } from '../types/campaignCreation'
import { campaignProductCatalogService } from '../services/campaignProductCatalogService.ts'

export type SalesChannelSource = 'product_default' | 'manual' | 'mixed_products'

export function getCommonAvailableSalesChannels(products: CampaignProductSelection[]): CampaignSalesChannelType[] {
  if (!products.length) return ['supplier_link']
  const masters = products.map((selection) => campaignProductCatalogService.getProduct(selection.productId)).filter(Boolean)
  const channels: CampaignSalesChannelType[] = ['supplier_link']
  if (masters.length === products.length && masters.every((product) => product?.wiseShopAvailable)) channels.push('wise_shop_link')
  if (masters.length === products.length && masters.every((product) => product?.sellerCheckoutAvailable)) channels.push('seller_checkout')
  return channels
}

export function resolveProductSalesChannelDefaults(products: CampaignProductSelection[]): {
  salesChannelType?: CampaignSalesChannelType
  source: SalesChannelSource
  warning?: string
} {
  if (!products.length) return { source: 'manual' }
  const invalidPolicy = products.map((selection) => campaignProductCatalogService.validateSalesLinkPolicy(selection.productId)).find(Boolean)
  if (invalidPolicy) return { source: 'mixed_products', warning: invalidPolicy }
  const defaults = products.map((selection) => campaignProductCatalogService.getProduct(selection.productId)?.defaultSalesChannelType)
  if (defaults.some((value) => !value)) {
    return { source: 'mixed_products', warning: '선택한 상품에 기본 판매 링크 유형이 등록되지 않았습니다. 상품 정보를 먼저 완성해주세요.' }
  }
  const unique = new Set(defaults)
  if (unique.size > 1) {
    return { source: 'mixed_products', warning: '선택한 상품들의 기본 판매 링크 유형이 서로 다릅니다. 판매 링크 유형을 확인해주세요.' }
  }
  return { salesChannelType: defaults[0], source: 'product_default' }
}
