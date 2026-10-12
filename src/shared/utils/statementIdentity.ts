import type { Campaign } from '../types/campaign'
import type { SalesDataRow } from '../types/salesData'
import type { ProductMaster } from '../../features/productMaster/types'
const clean = (value?: string) => value?.trim() || ''
export function statementIdentity(campaign?: Campaign, rows: SalesDataRow[] = [], products: ProductMaster[] = []) {
  const explicit = clean(campaign?.round).match(/^(\d+)\s*차?$/)?.[1]
  const fromTitle = clean(campaign?.campaignName).match(/(?:^|\s)(\d+)\s*차\s*$/)?.[1]
  const round = explicit && fromTitle && explicit !== fromTitle ? '차수 확인 필요' : explicit || fromTitle ? `${explicit || fromTitle}차` : '차수 확인 필요'
  const linked = products.filter(product => product.id === campaign?.productId || rows.some(row => row.productId === product.id || product.skus.some(sku => sku.id === row.skuId)))
  const brands = [...new Set(linked.map(product => clean(product.brandName)).filter(Boolean))]
  const campaignBrand = clean(campaign?.brandName)
  const brand = campaignBrand && !/확인 필요|미등록|미정/.test(campaignBrand) ? campaignBrand : brands.join(' · ') || '브랜드 확인 필요'
  const options = [...new Set(rows.map(row => clean(row.optionName)).filter(Boolean))]
  const itemNames = options.length ? options : [...new Set([...(campaign?.campaignProducts ?? []).map(p=>p.productName), campaign?.productName].map(clean).filter(name=>name && name!==brand))]
  return { campaignName: clean(campaign?.campaignName) || '공구명 확인 필요', brand, round, items: itemNames.join(' / ') || '진행 물품 확인 필요' }
}
export function matchesBusinessSearch(query: string, parts: Array<string | undefined>) {
  const normalize = (value: string) => value.toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]/g,'')
  const text = normalize(parts.filter(Boolean).join(' '))
  return query.trim().split(/\s+/).filter(Boolean).every(word=>text.includes(normalize(word)))
}
