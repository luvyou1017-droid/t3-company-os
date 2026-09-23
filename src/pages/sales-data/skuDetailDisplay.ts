import type { ProductMaster } from '../../features/productMaster/types'

// Display only. Never copy current catalog terms into a settlement row or Snapshot.
export function skuDetailDisplay(products: ProductMaster[], productId?: string, skuId?: string) {
  const product = products.find(item => item.id === productId && item.skus.some(sku => sku.id === skuId))
  const sku = product?.skus.find(item => item.id === skuId)
  if (!product || !sku) return undefined
  const validMoney = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
  return {
    brandName: product.brandName, productName: product.productName, optionName: sku.optionName,
    detail: Object.entries(sku.optionValues ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ') || '미등록',
    companySupplyPrice: validMoney(sku.currentTradeTerms?.companySupplyPrice ?? (sku.supplyPrice > 0 ? sku.supplyPrice : undefined)),
    sellerSupplyPrice: validMoney(sku.currentTradeTerms?.sellerSupplyPrice),
    inactive: !product.active || !sku.active || (product.lifecycleStatus !== undefined && product.lifecycleStatus !== 'active') || (sku.lifecycleStatus !== undefined && sku.lifecycleStatus !== 'active'),
  }
}
