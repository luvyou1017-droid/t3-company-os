import { getDataProviderMode } from '../../../shared/lib/dataProvider'
import { supabase } from '../../../shared/lib/supabase'
import { LocalProductRepository } from '../repositories/LocalProductRepository'
import { SupabaseProductRepository } from '../repositories/SupabaseProductRepository'
import type { ProductRepository } from '../repositories/productRepository'
import type { BrandMaster, CampaignProductMasterSnapshot, PartnerCatalogProduct, ProductLifecycleStatus, ProductMaster, ProductMasterInput, ProductPolicy, ProductPolicyOverrides, ProductSku, ProductTradeTerms, ResolvedProductPolicy, SellerCatalogProduct, VendorMaster } from '../types'

const repository: ProductRepository = getDataProviderMode() === 'supabase' && supabase
  ? new SupabaseProductRepository(supabase)
  : new LocalProductRepository()

export const normalizeProductIdentity = (value?: string) => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]/g, '')

const isSimilarIdentity = (left: string, right: string) => {
  const a = normalizeProductIdentity(left)
  const b = normalizeProductIdentity(right)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const before = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]))
      diagonal = before
    }
  }
  return previous[b.length] <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.2))
}

export function findProductIdentityCandidates(products: ProductMaster[], brandName: string, productName: string) {
  const normalizedBrand = normalizeProductIdentity(brandName)
  return products.filter((product) => normalizeProductIdentity(product.brandName) === normalizedBrand && isSimilarIdentity(product.productName, productName))
}

export function validateProductPolicy(product: Pick<ProductMaster, 'defaultSalesChannelType' | 'supplierLinkAvailable' | 'supplierLinkPgPolicy' | 'supplierLinkPgDeductionRate' | 'wiseShopAvailable' | 'sellerCheckoutAvailable' | 'brandPgSupportAvailable' | 'brandPgSupportRate'>) {
  if (product.defaultSalesChannelType === 'supplier_link' && product.supplierLinkAvailable === false) return '업체링크를 기본 링크로 선택하려면 사용 가능 상태여야 합니다.'
  if (product.supplierLinkAvailable && !product.supplierLinkPgPolicy) return '업체링크 PG 비용 처리 정책을 선택해주세요.'
  if (product.supplierLinkPgPolicy === 'deduct_from_commission_rate' && !(product.supplierLinkPgDeductionRate && product.supplierLinkPgDeductionRate > 0)) return '총 수수료율에서 차감할 %p를 입력해주세요.'
  if (product.defaultSalesChannelType === 'wise_shop_link' && !product.wiseShopAvailable) return '와이즈샵을 기본 링크로 선택하려면 사용 가능 상태여야 합니다.'
  if (product.defaultSalesChannelType === 'seller_checkout' && !product.sellerCheckoutAvailable) return '셀러 결제창을 기본 링크로 선택하려면 사용 가능 상태여야 합니다.'
  if (product.brandPgSupportAvailable && !product.brandPgSupportRate) return '브랜드 PG 지원율을 선택해주세요.'
  return undefined
}

function validateSkuPolicies(product: ProductMaster) {
  const quantityTiersByProduct = new Map<string, ProductSku[]>()
  product.skus.filter((sku) => sku.active && sku.pricingType === 'quantity_tier').forEach((sku) => {
    const key = (sku.productName || product.productName).trim().toLowerCase()
    quantityTiersByProduct.set(key, [...(quantityTiersByProduct.get(key) ?? []), sku])
  })
  for (const quantityTiers of quantityTiersByProduct.values()) {
    quantityTiers.sort((left, right) => (left.minimumQuantity ?? 0) - (right.minimumQuantity ?? 0))
    for (const [index, sku] of quantityTiers.entries()) {
      if (!sku.minimumQuantity || sku.minimumQuantity < 1) return `${sku.optionName}: 수량 구간의 최소 수량을 입력해주세요.`
      if (sku.maximumQuantity && sku.maximumQuantity < sku.minimumQuantity) return `${sku.optionName}: 최대 수량은 최소 수량보다 크거나 같아야 합니다.`
      const next = quantityTiers[index + 1]
      if (next && (!sku.maximumQuantity || sku.maximumQuantity >= (next.minimumQuantity ?? 0))) return `${sku.optionName}: 다음 수량 구간과 범위가 겹칩니다.`
    }
  }
  for (const sku of product.skus) {
    const policy = resolveProductPolicy(undefined, undefined, product, sku)
    if (policy.defaultSalesChannelType.value === 'wise_shop_link' && !policy.wiseShopAvailable.value) return `${sku.optionName}: 와이즈샵을 기본 링크로 사용하려면 사용 가능 상태여야 합니다.`
    if (policy.defaultSalesChannelType.value === 'seller_checkout' && !policy.sellerCheckoutAvailable.value) return `${sku.optionName}: 셀러 결제창을 기본 링크로 사용하려면 사용 가능 상태여야 합니다.`
  }
  return undefined
}

export function createCampaignProductSnapshot(product: ProductMaster, sku?: ProductSku): CampaignProductMasterSnapshot {
  const policy = resolveProductPolicy(undefined, undefined, product, sku)
  const actualSalesChannel = policy.defaultSalesChannelType.value!
  const supplierLinkPgDeductionRate = product.supplierLinkPgPolicy === 'deduct_from_commission_rate' ? product.supplierLinkPgDeductionRate : undefined
  const actualCommissionRate = actualSalesChannel === 'supplier_link' ? Math.max(Number(policy.totalCommissionRate.value) - (supplierLinkPgDeductionRate ?? 0), 0) : Number(policy.totalCommissionRate.value)
  return {
    productMasterId: product.id, skuId: sku?.id, skuCode: sku?.skuCode,
    productMasterVersion: product.version, capturedAt: new Date().toISOString(),
    regularPrice: Number(policy.regularPrice.value), salePrice: Number(policy.groupBuyPrice.value), supplyPrice: Number(policy.supplyPrice.value),
    shippingFee: Number(policy.shippingFee.value), freeShippingThreshold: policy.freeShippingThreshold?.value,
    totalCommissionRate: Number(policy.totalCommissionRate.value), sellerCommissionRate: Number(policy.sellerCommissionRate.value),
    defaultSalesChannelType: actualSalesChannel, supplierLinkAvailable: product.supplierLinkAvailable ?? true,
    supplierLinkPgPolicy: product.supplierLinkPgPolicy ?? 'manual', supplierLinkPgDeductionRate,
    wiseShopAvailable: Boolean(policy.wiseShopAvailable.value), wiseSrookPgRate: product.wiseSrookPgRate,
    sellerCheckoutAvailable: Boolean(policy.sellerCheckoutAvailable.value), brandPgSupportAvailable: Boolean(policy.brandPgSupportAvailable.value),
    brandPgSupportRate: policy.brandPgSupportRate?.value, actualSalesChannel, actualCommissionRate,
    actualSellerCommissionRate: Number(policy.sellerCommissionRate.value), actualPgCost: undefined,
    actualPgSupport: actualSalesChannel === 'seller_checkout' ? policy.brandPgSupportRate?.value : undefined,
    salesChannelOverridden: false,
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
  'supplierLinkAvailable', 'supplierLinkPgPolicy', 'supplierLinkPgDeductionRate', 'wiseSrookPgRate',
  'sellerCheckoutAvailable', 'brandPgSupportAvailable', 'brandPgSupportRate', 'courierName', 'orderDeadlineTime',
]

export function resolveProductPolicy(vendor: VendorMaster | undefined, brand: BrandMaster | undefined, product: ProductMaster, sku?: ProductSku): ResolvedProductPolicy {
  const productPolicy: ProductPolicyOverrides = product.defaultPolicy ?? {
    regularPrice: product.regularPrice, groupBuyPrice: product.salePrice, supplyPrice: product.supplyPrice,
    shippingFee: product.shippingFee, freeShippingThreshold: product.freeShippingThreshold,
    totalCommissionRate: product.totalCommissionRate, sellerCommissionRate: product.sellerCommissionRate,
    defaultSalesChannelType: product.defaultSalesChannelType, wiseShopAvailable: product.wiseShopAvailable,
    supplierLinkAvailable: product.supplierLinkAvailable, supplierLinkPgPolicy: product.supplierLinkPgPolicy,
    supplierLinkPgDeductionRate: product.supplierLinkPgDeductionRate, wiseSrookPgRate: product.wiseSrookPgRate,
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
  if (product.sampleOnly || !product.active || !product.sellerPortalVisible) return null
  const visibleSkus = product.skus.filter((sku) => !sku.sampleOnly && sku.active && sku.sellerPortalVisible !== false)
  if (product.skus.length && !visibleSkus.length) return null
  return {
    id: product.id, brandName: product.brandName, productName: product.productName, category: product.category,
    representativeImageUrl: product.representativeImageUrl ?? product.imageUrl, productUrl: product.productUrl,
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

export function toPartnerCatalogProduct(product: ProductMaster): PartnerCatalogProduct | null {
  if (product.sampleOnly || !product.active || !product.partnerPortalVisible) return null
  const visibleSkus = product.skus.filter((sku) => sku.active && !sku.sampleOnly)
  if (product.skus.length && !visibleSkus.length) return null
  return {
    id: product.id,
    brandName: product.brandName,
    productName: product.productName,
    category: product.category,
    representativeImageUrl: product.representativeImageUrl ?? product.imageUrl,
    productUrl: product.productUrl,
    description: product.partnerDescription || product.sellerDescription,
    shippingGuide: product.shippingFee === 0 ? '무료배송' : `배송비 ${product.shippingFee.toLocaleString('ko-KR')}원`,
    minimumOrder: product.partnerMinimumOrder,
    supplyNote: product.partnerSupplyNote,
    options: visibleSkus.map((sku) => ({
      id: sku.id,
      optionName: sku.optionName,
      groupBuyPrice: sku.groupBuyPrice,
      supplyPrice: sku.supplyPrice,
      stockStatus: sku.stockStatus ?? 'available',
    })),
    managerName: product.managerName || '와이즈벤더 담당자',
    managerContact: product.managerContact,
  }
}

export const productService = {
  // Reads are side-effect free. Repair/merge/deactivation must only happen after an explicit user action.
  listProducts: async () => (await repository.listProducts()).filter(product => !product.sampleOnly).map(product => ({ ...product, skus: product.skus.filter(sku => !sku.sampleOnly) })),
  listProductsForImport: () => repository.listProducts(),
  getProductById: (id: string) => repository.getProductById(id),
  searchProductsByBrand: (brandId: string, query?: string) => repository.searchProductsByBrand(brandId, query),
  async createProduct(input: ProductMasterInput) {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const product: ProductMaster = {
      ...input, id, lifecycleStatus: input.lifecycleStatus ?? (input.active ? 'active' : 'inactive'), skus: input.skus.map((sku) => ({ ...sku, productId: id, lifecycleStatus: sku.lifecycleStatus ?? (sku.active ? 'active' : 'inactive') })), companyCommissionRate: input.totalCommissionRate - input.sellerCommissionRate,
      brandPgSupportRate: input.brandPgSupportAvailable ? input.brandPgSupportRate : undefined,
      sellerPortalVisible: input.sellerPortalVisible ?? false,
      sellerPortalStatus: input.sellerPortalStatus ?? 'closed', sampleAvailable: input.sampleAvailable ?? false,
      createdAt: now, updatedAt: now, version: 1,
    }
    const policyError = validateProductPolicy(product) ?? validateSkuPolicies(product)
    if (policyError) throw new Error(policyError)
    return repository.createProduct(product)
  },
  async updateProduct(id: string, input: ProductMasterInput, expectedSnapshot?: string) {
    const current = await repository.getProductById(id)
    if (!current) throw new Error('상품을 찾을 수 없습니다.')
    if (expectedSnapshot && JSON.stringify(current) !== expectedSnapshot) throw new Error('검토 이후 상품이 변경되었습니다. 다시 비교해주세요.')
    const incomingIds = new Set(input.skus.map((sku) => sku.id))
    const removedIds = current.skus.filter((sku) => !incomingIds.has(sku.id)).map((sku) => sku.id)
    if (removedIds.length) throw new Error('기존 SKU는 삭제할 수 없습니다. 미사용 또는 삭제 보관 상태로 변경해주세요.')
    const product: ProductMaster = {
      ...current, ...input, id, lifecycleStatus: input.lifecycleStatus ?? (input.active ? 'active' : 'inactive'), skus: input.skus.map((sku) => ({ ...sku, productId: id, lifecycleStatus: sku.lifecycleStatus ?? (sku.active ? 'active' : 'inactive') })), companyCommissionRate: input.totalCommissionRate - input.sellerCommissionRate,
      brandPgSupportRate: input.brandPgSupportAvailable ? input.brandPgSupportRate : undefined,
      updatedAt: new Date().toISOString(), version: current.version + 1,
    }
    const policyError = validateProductPolicy(product) ?? validateSkuPolicies(product)
    if (policyError) throw new Error(policyError)
    return repository.updateProduct(product, expectedSnapshot ? current.version : undefined)
  },
  deactivateProduct: (id: string) => repository.deactivateProduct(id),
  setProductActive: (id: string, active: boolean) => repository.setProductActive(id, active),
  async setProductLifecycleStatus(id: string, status: ProductLifecycleStatus) {
    const current = await repository.getProductById(id)
    if (!current) throw new Error('상품을 찾을 수 없습니다.')
    return repository.updateProduct({ ...current, lifecycleStatus: status, active: status === 'active', updatedAt: new Date().toISOString(), version: current.version + 1 }, current.version)
  },
  findProductIdentityCandidates,
  async registerQuickSku(input: {
    productId?: string
    sampleOnly?: boolean
    brandName: string
    productName: string
    optionName: string
    detailOption: string
    vendorName: string
    companySupplyPrice: number
    sellerSupplyPrice?: number
  }) {
    const products = await repository.listProducts()
    const candidates = findProductIdentityCandidates(products, input.brandName, input.productName)
    const exactProducts = candidates.filter((product) => normalizeProductIdentity(product.productName) === normalizeProductIdentity(input.productName))
    let product = input.productId ? products.find((item) => item.id === input.productId) : exactProducts.length === 1 ? exactProducts[0] : undefined
    if (!product && input.sampleOnly && !candidates.length) {
      const brand = products.find(item => normalizeProductIdentity(item.brandName) === normalizeProductIdentity(input.brandName))
      if (!brand) throw new Error('샘플 전용 상품은 등록된 브랜드명을 선택해주세요.')
      if (!input.optionName.trim() || !input.vendorName.trim() || !Number.isFinite(input.companySupplyPrice) || input.companySupplyPrice < 0 || (!input.sampleOnly && input.sellerSupplyPrice === undefined) || (input.sellerSupplyPrice !== undefined && (!Number.isFinite(input.sellerSupplyPrice) || input.sellerSupplyPrice < 0))) throw new Error('필수값과 공급가를 확인해주세요.')
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      product = { id, productCode: `SAMPLE-${id}`, brandId: brand.brandId, brandName: brand.brandName,
        productName: input.productName.trim(), vendorName: input.vendorName.trim(), sampleOnly: true,
        regularPrice: 0, salePrice: 0, supplyPrice: input.companySupplyPrice, shippingFee: 0,
        totalCommissionRate: 0, sellerCommissionRate: 0, companyCommissionRate: 0,
        defaultSalesChannelType: 'supplier_link', supplierLinkAvailable: true, supplierLinkPgPolicy: 'manual',
        wiseShopAvailable: false, sellerCheckoutAvailable: false, brandPgSupportAvailable: false,
        skus: [], sellerPortalVisible: false, sellerPortalStatus: 'closed', sampleAvailable: true,
        active: true, lifecycleStatus: 'active', createdAt: now, updatedAt: now, version: 0 }
    }
    if (!product) throw new Error(candidates.length ? '유사 상품을 먼저 선택해주세요.' : '빠른 SKU 등록은 기존 상품을 선택한 뒤 진행해주세요.')
    if ((product.lifecycleStatus ?? (product.active ? 'active' : 'inactive')) !== 'active') throw new Error('미사용 또는 삭제 보관 상품에는 SKU를 추가할 수 없습니다.')
    if (normalizeProductIdentity(product.brandName) !== normalizeProductIdentity(input.brandName)) throw new Error('선택한 상품의 브랜드가 입력한 브랜드와 다릅니다.')
    if (!input.optionName.trim() || !input.vendorName.trim() || !Number.isFinite(input.companySupplyPrice) || input.companySupplyPrice < 0 || (!input.sampleOnly && input.sellerSupplyPrice === undefined) || (input.sellerSupplyPrice !== undefined && (!Number.isFinite(input.sellerSupplyPrice) || input.sellerSupplyPrice < 0))) throw new Error('필수값과 공급가를 확인해주세요.')
    const detail = input.detailOption.trim()
    const exactSku = product.skus.find((sku) => normalizeProductIdentity(sku.optionName) === normalizeProductIdentity(input.optionName)
      && normalizeProductIdentity(Object.values(sku.optionValues ?? {}).join(' ')) === normalizeProductIdentity(detail))
    if (exactSku) {
      if (!exactSku.active || ['inactive','archived'].includes(exactSku.lifecycleStatus ?? '')) throw new Error('동일한 미사용/삭제보관 SKU가 있습니다. 상품 관리에서 확인해주세요. 중복 등록하지 않았습니다.')
      return { product, sku: exactSku, created: false, candidates }
    }
    const now = new Date().toISOString()
    const tradeTerms: ProductTradeTerms = {
      companySupplyPrice: Math.floor(input.companySupplyPrice),
      sellerSupplyPrice: input.sellerSupplyPrice === undefined ? undefined : Math.floor(input.sellerSupplyPrice),
      capturedAt: now,
    }
    const sku: ProductSku = {
      id: crypto.randomUUID(), skuCode: `SKU-${crypto.randomUUID()}`, productId: product.id, sampleOnly: input.sampleOnly === true,
      productName: product.productName, optionName: input.optionName.trim(), optionValues: detail ? { 세부옵션: detail } : undefined,
      currentTradeTerms: tradeTerms, pricingType: 'fixed', regularPrice: 0, groupBuyPrice: 0,
      supplyPrice: Math.floor(input.companySupplyPrice), sellerPortalVisible: false, representative: false,
      stockStatus: 'available', lifecycleStatus: 'active', active: true, createdAt: now, updatedAt: now,
    }
    const nextProduct = {
      ...product,
      vendorName: product.vendorName || input.vendorName.trim(),
      skus: [...product.skus, sku],
      updatedAt: now,
      version: product.version + 1,
    }
    const updated = product.version === 0 ? await repository.createProduct(nextProduct) : await repository.updateProduct(nextProduct, product.version)
    const persisted = await repository.getProductById(updated.id)
    const savedSku = persisted?.skus.find(item => item.id === sku.id)
    if (!persisted || !savedSku) throw new Error('SKU 저장 결과를 확인하지 못했습니다. 다시 등록하지 말고 상품 목록을 확인해주세요.')
    return { product: persisted, sku: savedSku, created: true, candidates }
  },
  async listSellerCatalog() {
    const products = await repository.listProducts()
    return products.map(toSellerCatalogProduct).filter((product): product is SellerCatalogProduct => Boolean(product))
  },
  async getSellerCatalogProduct(id: string) {
    const product = await repository.getProductById(id)
    return product ? toSellerCatalogProduct(product) : null
  },
  async listPartnerCatalog() {
    if (getDataProviderMode() === 'supabase' && supabase) {
      const { data, error } = await supabase.rpc('list_partner_catalog')
      if (error) throw error
      return (Array.isArray(data) ? data : []) as PartnerCatalogProduct[]
    }
    const products = await repository.listProducts()
    return products.map(toPartnerCatalogProduct).filter((product): product is PartnerCatalogProduct => Boolean(product))
  },
  resolveProductPolicy,
  createCampaignProductSnapshot,
}
