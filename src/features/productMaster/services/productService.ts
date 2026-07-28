import { getDataProviderMode } from '../../../shared/lib/dataProvider'
import { supabase } from '../../../shared/lib/supabase'
import { LocalProductRepository } from '../repositories/LocalProductRepository'
import { SupabaseProductRepository } from '../repositories/SupabaseProductRepository'
import type { ProductRepository } from '../repositories/productRepository'
import type { BrandMaster, CampaignProductMasterSnapshot, ProductMaster, ProductMasterInput, ProductPolicy, ProductPolicyOverrides, ProductSku, ResolvedProductPolicy, SellerCatalogProduct, VendorMaster } from '../types'

const repository: ProductRepository = getDataProviderMode() === 'supabase' && supabase
  ? new SupabaseProductRepository(supabase)
  : new LocalProductRepository()

export function validateProductPolicy(product: Pick<ProductMaster, 'defaultSalesChannelType' | 'wiseShopAvailable' | 'sellerCheckoutAvailable' | 'brandPgSupportAvailable' | 'brandPgSupportRate'>) {
  if (product.defaultSalesChannelType === 'wise_shop_link' && !product.wiseShopAvailable) return '와이즈샵을 기본 링크로 선택하려면 사용 가능 상태여야 합니다.'
  if (product.defaultSalesChannelType === 'seller_checkout' && !product.sellerCheckoutAvailable) return '셀러 결제창을 기본 링크로 선택하려면 사용 가능 상태여야 합니다.'
  if (product.brandPgSupportAvailable && !product.brandPgSupportRate) return '브랜드 PG 지원율을 선택해주세요.'
  return undefined
}

function validateSkuPolicies(product: ProductMaster) {
  for (const sku of product.skus) {
    const policy = resolveProductPolicy(undefined, undefined, product, sku)
    if (policy.defaultSalesChannelType.value === 'wise_shop_link' && !policy.wiseShopAvailable.value) return `${sku.optionName}: 와이즈샵을 기본 링크로 사용하려면 사용 가능 상태여야 합니다.`
    if (policy.defaultSalesChannelType.value === 'seller_checkout' && !policy.sellerCheckoutAvailable.value) return `${sku.optionName}: 셀러 결제창을 기본 링크로 사용하려면 사용 가능 상태여야 합니다.`
  }
  return undefined
}

export function createCampaignProductSnapshot(product: ProductMaster, sku?: ProductSku): CampaignProductMasterSnapshot {
  const policy = resolveProductPolicy(undefined, undefined, product, sku)
  return {
    productMasterId: product.id, skuId: sku?.id, skuCode: sku?.skuCode,
    productMasterVersion: product.version, capturedAt: new Date().toISOString(),
    regularPrice: Number(policy.regularPrice.value), salePrice: Number(policy.groupBuyPrice.value), supplyPrice: Number(policy.supplyPrice.value),
    shippingFee: Number(policy.shippingFee.value), freeShippingThreshold: policy.freeShippingThreshold?.value,
    totalCommissionRate: Number(policy.totalCommissionRate.value), sellerCommissionRate: Number(policy.sellerCommissionRate.value),
    defaultSalesChannelType: policy.defaultSalesChannelType.value!, wiseShopAvailable: Boolean(policy.wiseShopAvailable.value),
    sellerCheckoutAvailable: Boolean(policy.sellerCheckoutAvailable.value), brandPgSupportAvailable: Boolean(policy.brandPgSupportAvailable.value),
    brandPgSupportRate: policy.brandPgSupportRate?.value,
    shippingPolicy: {
      courierName: policy.courierName?.value, jejuExtraFee: product.jejuExtraFee, islandExtraFee: product.islandExtraFee,
      bundleShippingAvailable: product.bundleShippingAvailable, orderDeadlineTime: policy.orderDeadlineTime?.value,
    },
    sampleSupportType: product.sampleSupportType,
    policySources: Object.fromEntries(Object.entries(policy).map(([key, entry]) => [key, entry.source])),
  }
}

const policyKeys: Array<keyof ProductPolicy> = [
  'regularPrice', 'groupBuyPrice', 'supplyPrice', 'shippingFee', 'freeShippingThreshold',
  'totalCommissionRate', 'sellerCommissionRate', 'defaultSalesChannelType', 'wiseShopAvailable',
  'sellerCheckoutAvailable', 'brandPgSupportAvailable', 'brandPgSupportRate', 'courierName', 'orderDeadlineTime',
]

export function resolveProductPolicy(vendor: VendorMaster | undefined, brand: BrandMaster | undefined, product: ProductMaster, sku?: ProductSku): ResolvedProductPolicy {
  const productPolicy: ProductPolicyOverrides = product.defaultPolicy ?? {
    regularPrice: product.regularPrice, groupBuyPrice: product.salePrice, supplyPrice: product.supplyPrice,
    shippingFee: product.shippingFee, freeShippingThreshold: product.freeShippingThreshold,
    totalCommissionRate: product.totalCommissionRate, sellerCommissionRate: product.sellerCommissionRate,
    defaultSalesChannelType: product.defaultSalesChannelType, wiseShopAvailable: product.wiseShopAvailable,
    sellerCheckoutAvailable: product.sellerCheckoutAvailable, brandPgSupportAvailable: product.brandPgSupportAvailable,
    brandPgSupportRate: product.brandPgSupportRate, courierName: product.courierName, orderDeadlineTime: product.orderDeadlineTime,
  }
  const layers = [
    { source: 'vendor' as const, values: vendor?.defaultPolicy },
    { source: 'brand' as const, values: brand?.defaultPolicy },
    { source: 'product' as const, values: productPolicy },
    { source: 'sku' as const, values: sku ? {
      regularPrice: sku.regularPrice, groupBuyPrice: sku.groupBuyPrice, supplyPrice: sku.supplyPrice,
      shippingFee: sku.shippingFee, freeShippingThreshold: sku.freeShippingThreshold,
      totalCommissionRate: sku.totalCommissionRate, sellerCommissionRate: sku.sellerCommissionRate,
      defaultSalesChannelType: sku.defaultSalesChannelType, wiseShopAvailable: sku.wiseShopAvailable,
      sellerCheckoutAvailable: sku.sellerCheckoutAvailable, brandPgSupportAvailable: sku.brandPgSupportAvailable,
      brandPgSupportRate: sku.brandPgSupportRate, ...sku.policyOverrides,
    } : undefined },
  ]
  return Object.fromEntries(policyKeys.map((key) => {
    const selected = [...layers].reverse().find((layer) => layer.values?.[key] !== undefined)
    return [key, { value: selected?.values?.[key], source: selected?.source ?? 'product' }]
  })) as ResolvedProductPolicy
}

function range(values: number[], fallback: number): [number, number] {
  const safe = values.length ? values : [fallback]
  return [Math.min(...safe), Math.max(...safe)]
}

export function toSellerCatalogProduct(product: ProductMaster): SellerCatalogProduct | null {
  if (!product.active || !product.sellerPortalVisible) return null
  const visibleSkus = product.skus.filter((sku) => sku.active && sku.sellerPortalVisible !== false)
  return {
    id: product.id, brandName: product.brandName, productName: product.productName, category: product.category,
    representativeImageUrl: product.representativeImageUrl ?? product.imageUrl,
    additionalImageUrls: product.additionalImageUrls ?? [], sellerDescription: product.sellerDescription,
    regularPriceRange: range(visibleSkus.map((sku) => sku.regularPrice), product.regularPrice),
    groupBuyPriceRange: range(visibleSkus.map((sku) => sku.groupBuyPrice), product.salePrice),
    shippingGuide: product.shippingFee === 0 ? '무료배송' : `배송비 ${product.shippingFee.toLocaleString('ko-KR')}원${product.freeShippingThreshold ? ` · ${product.freeShippingThreshold.toLocaleString('ko-KR')}원 이상 무료` : ''}`,
    sampleAvailable: product.sampleAvailable, sellerPortalStatus: product.sellerPortalStatus,
    badges: product.badges ?? [],
    options: visibleSkus.map((sku) => ({ id: sku.id, optionName: sku.optionName, regularPrice: sku.regularPrice, groupBuyPrice: sku.groupBuyPrice, stockStatus: sku.stockStatus ?? 'available' })),
    managerName: product.managerName || '김병희', managerContact: product.managerContact,
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
      skus: input.skus ?? [], sellerPortalVisible: input.sellerPortalVisible ?? false,
      sellerPortalStatus: input.sellerPortalStatus ?? 'closed', sampleAvailable: input.sampleAvailable ?? false,
      createdAt: now, updatedAt: now, version: 1,
    }
    const policyError = validateProductPolicy(product) ?? validateSkuPolicies(product)
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
    const policyError = validateProductPolicy(product) ?? validateSkuPolicies(product)
    if (policyError) throw new Error(policyError)
    return repository.updateProduct(product)
  },
  deactivateProduct: (id: string) => repository.deactivateProduct(id),
  async listSellerCatalog() {
    const products = await repository.listProducts()
    return products.map(toSellerCatalogProduct).filter((product): product is SellerCatalogProduct => Boolean(product))
  },
  async getSellerCatalogProduct(id: string) {
    const product = await repository.getProductById(id)
    return product ? toSellerCatalogProduct(product) : null
  },
  resolveProductPolicy,
  createCampaignProductSnapshot,
}
