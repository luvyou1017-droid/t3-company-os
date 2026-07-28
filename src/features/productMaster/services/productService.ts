import { getDataProviderMode } from '../../../shared/lib/dataProvider'
import { supabase } from '../../../shared/lib/supabase'
import { LocalProductRepository } from '../repositories/LocalProductRepository'
import { SupabaseProductRepository } from '../repositories/SupabaseProductRepository'
import type { ProductRepository } from '../repositories/productRepository'
import type { CampaignProductMasterSnapshot, ProductMaster, ProductMasterInput } from '../types'

const repository: ProductRepository = getDataProviderMode() === 'supabase' && supabase
  ? new SupabaseProductRepository(supabase)
  : new LocalProductRepository()

export function validateProductPolicy(product: Pick<ProductMaster, 'defaultSalesChannelType' | 'wiseShopAvailable' | 'sellerCheckoutAvailable' | 'brandPgSupportAvailable' | 'brandPgSupportRate'>) {
  if (product.defaultSalesChannelType === 'wise_shop_link' && !product.wiseShopAvailable) return '와이즈샵을 기본 링크로 선택하려면 사용 가능 상태여야 합니다.'
  if (product.defaultSalesChannelType === 'seller_checkout' && !product.sellerCheckoutAvailable) return '셀러 결제창을 기본 링크로 선택하려면 사용 가능 상태여야 합니다.'
  if (product.brandPgSupportAvailable && !product.brandPgSupportRate) return '브랜드 PG 지원율을 선택해주세요.'
  return undefined
}

export function createCampaignProductSnapshot(product: ProductMaster): CampaignProductMasterSnapshot {
  return {
    productMasterId: product.id, productMasterVersion: product.version, capturedAt: new Date().toISOString(),
    regularPrice: product.regularPrice, salePrice: product.salePrice, supplyPrice: product.supplyPrice,
    shippingFee: product.shippingFee, freeShippingThreshold: product.freeShippingThreshold,
    totalCommissionRate: product.totalCommissionRate, sellerCommissionRate: product.sellerCommissionRate,
    defaultSalesChannelType: product.defaultSalesChannelType, wiseShopAvailable: product.wiseShopAvailable,
    sellerCheckoutAvailable: product.sellerCheckoutAvailable, brandPgSupportAvailable: product.brandPgSupportAvailable,
    brandPgSupportRate: product.brandPgSupportRate,
    shippingPolicy: {
      courierName: product.courierName, jejuExtraFee: product.jejuExtraFee, islandExtraFee: product.islandExtraFee,
      bundleShippingAvailable: product.bundleShippingAvailable, orderDeadlineTime: product.orderDeadlineTime,
    },
    sampleSupportType: product.sampleSupportType,
  }
}

export const productService = {
  listProducts: () => repository.listProducts(),
  getProductById: (id: string) => repository.getProductById(id),
  searchProductsByBrand: (brandId: string, query?: string) => repository.searchProductsByBrand(brandId, query),
  async createProduct(input: ProductMasterInput) {
    const now = new Date().toISOString()
    const product: ProductMaster = {
      ...input, id: crypto.randomUUID(), companyCommissionRate: input.totalCommissionRate - input.sellerCommissionRate,
      brandPgSupportRate: input.brandPgSupportAvailable ? input.brandPgSupportRate : undefined,
      createdAt: now, updatedAt: now, version: 1,
    }
    const policyError = validateProductPolicy(product)
    if (policyError) throw new Error(policyError)
    return repository.createProduct(product)
  },
  async updateProduct(id: string, input: ProductMasterInput) {
    const current = await repository.getProductById(id)
    if (!current) throw new Error('상품을 찾을 수 없습니다.')
    const product: ProductMaster = {
      ...current, ...input, id, companyCommissionRate: input.totalCommissionRate - input.sellerCommissionRate,
      brandPgSupportRate: input.brandPgSupportAvailable ? input.brandPgSupportRate : undefined,
      updatedAt: new Date().toISOString(), version: current.version + 1,
    }
    const policyError = validateProductPolicy(product)
    if (policyError) throw new Error(policyError)
    return repository.updateProduct(product)
  },
  deactivateProduct: (id: string) => repository.deactivateProduct(id),
  createCampaignProductSnapshot,
}
