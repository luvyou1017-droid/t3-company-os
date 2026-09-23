import { notionRecentCampaigns } from '../data/notionPilot10'
import type { Campaign } from '../types/campaign'
import type { ProductMaster } from '../../features/productMaster/types'
import type { SalesDataRow } from '../types/salesData'

export function scheduleRequiredErrors(c: Pick<Campaign, 'campaignName' | 'sellerId' | 'sellerName' | 'settlementVendorName' | 'managerId' | 'startDate' | 'endDate' | 'supplyAudience'>) {
  const errors: string[] = []
  if (!c.campaignName?.trim()) errors.push('일정명 필요')
  if (!(c.sellerId && c.sellerName?.trim()) && !c.settlementVendorName?.trim()) errors.push('셀러 또는 요청 대상 확인 필요')
  if (!c.managerId) errors.push('담당 매니저 필요')
  for (const [label, value] of [['시작일', c.startDate], ['종료일', c.endDate]]) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) errors.push(`${label} 확인 필요`)
  }
  if (c.startDate && c.endDate && c.endDate < c.startDate) errors.push('종료일은 시작일 이후여야 합니다')
  if (!['seller', 'vendor'].includes(c.supplyAudience ?? '')) errors.push('거래구분 확인 필요')
  return errors
}
export const linkedId = (id?: string) => Boolean(id && !id.startsWith('unresolved-'))
export function campaignSupplierId(c: Campaign) {
  if (linkedId(c.supplierId)) return c.supplierId
  // The legacy Notion importer stored the supplier in brandId. Only recover a verified original relation.
  const original = notionRecentCampaigns.find(row => row.sourceId.replace(/-/g, '') === c.notionImportMetadata?.sourceId?.replace(/-/g, ''))
  return original?.supplierId === c.brandId ? original.supplierId : undefined
}
export function campaignReadiness(c: Campaign, products: ProductMaster[] = []) {
  const selections = c.campaignProducts?.length ? c.campaignProducts.map(p => p.productId) : c.productId ? [c.productId] : []
  const resolved = selections.map(id => products.find(p => p.id === id))
  const productLinked = selections.length > 0 && selections.every(linkedId) && resolved.every(Boolean)
  const supplierLinked = linkedId(campaignSupplierId(c)) || (resolved.length > 0 && resolved.every(p => linkedId(p?.vendorId)))
  const termErrors = settlementReadinessErrors(c, products)
  const tasks = [!productLinked && '상품 연결 필요', !supplierLinked && '공급처 미연결', termErrors.length > 0 && '정산조건 확인 필요'].filter(Boolean) as string[]
  return { productLinked, supplierLinked, tasks, label: tasks.length ? tasks.join(' · ') : '정산 준비 완료' }
}
export function settlementReadinessErrors(c: Campaign | undefined, products: ProductMaster[], rows?: SalesDataRow[]) {
  if (!c) return ['공구일정 연결 필요']
  const errors: string[] = []
  if (!['seller', 'vendor'].includes(c.supplyAudience ?? '')) errors.push('거래구분 확인 필요')
  if (!c.salesChannelType) errors.push('판매 링크/정산조건 확인 필요')
  const targets = rows?.length ? rows.filter(r => r.netQuantity > 0).map(r => ({ productId: r.productId || c.productId, skuId: r.skuId, sellerSupplyPrice: r.sellerSupplyPrice, sellerCommissionRate: r.sellerCommissionRate }))
    : (c.campaignProducts?.length ? c.campaignProducts : [{ productId: c.productId }]).map(p => ({ productId: p.productId, skuId: undefined, sellerSupplyPrice: undefined, sellerCommissionRate: undefined }))
  if (!targets.length) errors.push('정산 상품/SKU 확인 필요')
  const valid = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  for (const target of targets) {
    const product = products.find(p => p.id === target.productId || (target.skuId && p.skus.some(s => s.id === target.skuId)))
    const sku = product?.skus.find(s => s.id === target.skuId)
    if (!product || (rows && !sku)) { errors.push('정산 상품/SKU 연결 확인 필요'); continue }
    if (!linkedId(campaignSupplierId(c)) && !linkedId(product.vendorId)) errors.push('공급처 미연결')
    const terms = sku?.currentTradeTerms ?? product.currentTradeTerms
    const cost = terms?.companySupplyPrice ?? sku?.policyOverrides?.supplyPrice ?? sku?.supplyPrice ?? product.supplyPrice
    // Legacy zero is frequently a parser default; only an explicit term confirms zero.
    if (!valid(cost) || (cost === 0 && terms?.companySupplyPrice !== 0)) errors.push('회사 실제 공급가 확인 필요')
    if (c.salesChannelType === 'seller_checkout') {
      if (!valid(target.sellerSupplyPrice ?? terms?.sellerSupplyPrice)) errors.push('셀러 적용 공급가 확인 필요')
    } else {
      const rate = target.sellerCommissionRate ?? sku?.sellerCommissionRate ?? c.sellerCommissionRate ?? product.sellerCommissionRate
      if (!valid(rate) || Number(rate) > 100) errors.push('셀러 수수료 조건 확인 필요')
    }
  }
  return [...new Set(errors)]
}

/** Update schedule fields only. Existing business/financial snapshots and IDs remain authoritative. */
export function mergeNotionCampaign(existing: Campaign | undefined, incoming: Campaign): Campaign {
  if (!existing) return incoming
  if (existing.deletedAt || existing.status === 'settled') return existing
  return { ...existing, campaignName: incoming.campaignName, sellerId: existing.sellerId || incoming.sellerId,
    sellerName: existing.sellerName || incoming.sellerName, startDate: incoming.startDate, endDate: incoming.endDate,
    managerId: incoming.managerId, managerName: incoming.managerName,
    supplyAudience: existing.supplyAudience ?? incoming.supplyAudience,
    supplierId: linkedId(existing.supplierId) ? existing.supplierId : incoming.supplierId,
    supplierName: existing.supplierName || incoming.supplierName,
    productId: linkedId(existing.productId) ? existing.productId : incoming.productId,
    productName: existing.productName || incoming.productName,
    brandId: linkedId(existing.brandId) ? existing.brandId : incoming.brandId,
    brandName: existing.brandName || incoming.brandName,
    updatedAt: incoming.updatedAt, notionImportMetadata: incoming.notionImportMetadata }
}
