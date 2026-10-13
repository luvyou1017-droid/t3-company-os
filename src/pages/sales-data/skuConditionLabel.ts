import type { ProductMaster } from '../../features/productMaster/types'
import type { SettlementSkuCondition } from '../../shared/types/settlementTerms'

export function skuConditionProductLabel(item: SettlementSkuCondition, products: ProductMaster[]) {
  const product = products.find(product => product.id === item.productId)
  if (product) return [product.brandName?.trim(), product.productName.trim()].filter(Boolean).join(' · ')
  // Retain explicit saved product names when the linked master is unavailable.
  return item.productName.match(/^\[([^\]]+)\]/)?.[1]?.trim() || item.productName.trim() || '상품 확인 필요'
}

export function skuConditionLabel(item: SettlementSkuCondition, products: ProductMaster[]) {
  const product = skuConditionProductLabel(item, products)
  const option = item.skuOptionName?.trim() || item.optionName.trim() || '옵션 확인 필요'
  const detail = item.detailOption?.trim()
  const rate = item.sellerCommissionRate === undefined ? '수수료 확인 필요' : `${Number(item.sellerCommissionRate.toFixed(2))}%`
  return `[${product}] ${option}${detail && !option.includes(detail) ? ` · ${detail}` : ''} | ${item.supplyLabel || '공급 구분 확인 필요'} | ${rate}`
}

export function groupSkuConditions(items: SettlementSkuCondition[]) {
  const groups = new Map<string, SettlementSkuCondition[]>()
  for (const item of items) groups.set(item.productId, [...(groups.get(item.productId) ?? []), item])
  return [...groups].map(([productId, conditions]) => ({ productId, conditions }))
}
