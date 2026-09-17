import type { ProductMaster, ProductSku } from '../../features/productMaster/types'
import type { SalesDataRow } from '../types/salesData'

export const normalizeProductMatchText = (value?: string) => String(value ?? '').toLowerCase().replace(/제품선택\s*:/g, '').replace(/[^0-9a-z가-힣]/g, '')

export function productSkuMatchScore(row: Pick<SalesDataRow, 'optionName' | 'unitPrice'>, product: Pick<ProductMaster, 'productName'>, sku: Pick<ProductSku, 'optionName' | 'productName' | 'pricingType' | 'groupBuyPrice'>, allowTierPriceMatch: boolean) {
  const rowName = normalizeProductMatchText(row.optionName)
  const optionName = normalizeProductMatchText(sku.optionName)
  const productName = normalizeProductMatchText(sku.productName || product.productName)
  let score = 0
  if (rowName === optionName) score = 120
  else if (rowName === productName) score = 110
  else if (optionName.length >= 4 && (rowName.includes(optionName) || optionName.includes(rowName))) score = 90
  else if (productName.length >= 4 && (rowName.includes(productName) || productName.includes(rowName))) score = 80
  const priceMatched = Math.round(row.unitPrice) === Math.round(sku.groupBuyPrice)
  if (priceMatched) score += 20
  if (allowTierPriceMatch && sku.pricingType === 'quantity_tier' && priceMatched) score = Math.max(score, 115)
  return score
}
