import type { ProductMaster } from '../../features/productMaster/types'
import type { Campaign, CampaignSalesChannelType } from '../types/campaign'
import type { SalesDataImport, SalesDataRow } from '../types/salesData'
import type { SettlementSkuCondition, SettlementTerms } from '../types/settlementTerms'
import type { SalesPriceCandidate } from './salesDataFileParser'
import type { parseSalesDataFile } from './salesDataFileParser'
import { STORAGE_KEYS, storageService } from '../services/storageService'
import { calculateSalesRow } from './salesData.ts'

export const collectorForChannel = { seller_checkout: 'seller', wise_shop_link: 'company', supplier_link: 'supplier' } as const
export const channelLabels = { seller_checkout: '셀러 링크', wise_shop_link: '와이즈벤더 링크', supplier_link: '브랜드·공급사 링크' }
export const authorLabels = { supplier: '공급사', seller: '셀러', company: '와이즈벤더' }
export const documentKindLabels = { customer_sales: '주문·매출 자료', supplier_cost: '공급대금·배송비 정산', supplier_net_settlement: '셀러 수수료 차감 후 정산', combined_commission: '셀러·벤더 합산 수수료' }

export function campaignChannel(campaign?: Campaign, source?: SalesDataImport): CampaignSalesChannelType | undefined {
  if (source?.settlementTerms) return source.settlementTerms.salesChannelType
  if (campaign?.salesChannelType) return campaign.salesChannelType
  const channels = new Set(campaign?.proposalSnapshots?.map((item) => item.actualSalesChannel))
  if (channels.size === 1) return [...channels][0]
  return campaign?.linkOwner === '셀러' ? 'seller_checkout' : campaign?.linkOwner === '자사' ? 'wise_shop_link' : campaign?.linkOwner === '브랜드사' ? 'supplier_link' : undefined
}

export function getUploadConditions(products: ProductMaster[], campaign?: Campaign, source?: SalesDataImport) {
  const historical = campaign?.proposalSnapshots?.flatMap((item) => item.skuConditions ?? []) ?? []
  const saved = source?.settlementTerms?.skuConditions ?? []
  const audience = source?.supplyAudience ?? campaign?.supplyAudience ?? 'seller'
  const vendor = source?.settlementVendorName ?? campaign?.settlementVendorName
  const vendorTerms = storageService.getItem<Array<{ vendor: string; skuId: string; rate: number }>>(STORAGE_KEYS.vendorSkuTerms, [])
  const catalog: SettlementSkuCondition[] = products.filter((product) => product.supplyAudience !== 'vendor' || (audience === 'vendor' && product.settlementVendorName === vendor?.trim())).flatMap((product) => product.skus.filter((sku) => sku.active).map((sku) => {
    const vendorRate = vendorTerms.find((term) => term.vendor.trim() === vendor?.trim() && term.skuId === sku.id)?.rate
    const dedicated = product.supplyAudience === 'vendor'
    return { skuId: sku.id, productId: product.id, productName: `[${product.productName}] ${sku.productName || sku.optionName}`, optionName: sku.optionName,
      supplyLabel: dedicated ? `${product.settlementVendorName} 공급` : audience === 'vendor' && vendorRate !== undefined ? `${vendor} 공급` : '셀러공급',
      conditionOrigin: audience === 'vendor' && !dedicated && vendorRate === undefined ? '벤더 조건 확인 필요' : '상품 DB',
      groupBuyPrice: sku.groupBuyPrice, totalCommissionRate: sku.totalCommissionRate ?? product.totalCommissionRate,
      sellerCommissionRate: audience === 'vendor' ? vendorRate ?? (dedicated ? sku.sellerCommissionRate ?? product.sellerCommissionRate : undefined) : sku.sellerCommissionRate ?? product.sellerCommissionRate }
  }))
  const savedConditions = saved.map((item) => ({ ...item, supplyLabel: audience === 'vendor' ? vendor ? `${vendor} 공급` : '벤더공급' : '셀러공급', conditionOrigin: '이 공구 저장 조건' }))
  const historicalConditions = historical.map((item) => ({ ...item, supplyLabel: catalog.find((candidate) => candidate.skuId === item.skuId)?.supplyLabel || item.supplyLabel || (audience === 'vendor' ? '벤더공급' : '셀러공급'), conditionOrigin: '공급 대상·수수료 확인 필요', ...(audience === 'vendor' ? { sellerCommissionRate: catalog.find((candidate) => candidate.skuId === item.skuId)?.sellerCommissionRate } : {}) }))
  const all = [...savedConditions, ...historicalConditions, ...catalog].filter((item, index, items) => items.findIndex((other) => other.skuId === item.skuId) === index)
  const productIds = new Set([campaign?.productId, ...(campaign?.campaignProducts?.map((item) => item.productId) ?? [])])
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
  if (campaign?.productName) {
    const same = products.filter((product) => normalize(product.productName) === normalize(campaign.productName!))
    if (same.length === 1) productIds.add(same[0].id)
  }
  const automatic = all.filter((item) => productIds.has(item.productId) || saved.some((other) => other.skuId === item.skuId))
  const asCandidate = (item: SettlementSkuCondition): SalesPriceCandidate => ({ ...item, exactMatchOnly: true })
  return {
    all: all.map((item) => { const parent = products.find((product) => product.id === item.productId); return parent && !item.productName.startsWith('[') ? { ...item, productName: `[${parent.productName}] ${item.productName}` } : item }),
    candidates: [...saved.filter((item) => item.salesOptionName).map((item) => ({ ...asCandidate(item), optionName: item.salesOptionName!, confirmed: true })), ...automatic.map(asCandidate)],
  }
}

export function captureUploadTerms(channel: CampaignSalesChannelType, rows: SalesDataRow[]): SettlementTerms {
  if (!rows.length || rows.some((row) => !row.skuId || !Number.isFinite(row.agreedUnitPrice ?? row.unitPrice) || (row.agreedUnitPrice ?? row.unitPrice) <= 0
    || row.totalCommissionRate === undefined || row.sellerCommissionRate === undefined || !Number.isFinite(row.totalCommissionRate) || !Number.isFinite(row.sellerCommissionRate)
    || row.totalCommissionRate <= 0 || row.totalCommissionRate > 100 || row.sellerCommissionRate < 0 || row.sellerCommissionRate > row.totalCommissionRate)) throw new Error('모든 판매행의 SKU·판매가·총수수료율·셀러수수료율을 확인해주세요.')
  return { salesChannelType: channel, moneyCollector: collectorForChannel[channel], confirmedAt: new Date().toISOString(), skuConditions: rows.map((row) => ({ skuId: row.skuId!, productId: row.productId ?? '', productName: row.productName ?? '', optionName: row.optionName, salesOptionName: row.optionName, groupBuyPrice: row.agreedUnitPrice ?? row.unitPrice, totalCommissionRate: row.totalCommissionRate, sellerCommissionRate: row.sellerCommissionRate })) }
}

export function applyReviewedUpload(parsed: Awaited<ReturnType<typeof parseSalesDataFile>>, edited: SalesDataRow[]) {
  const key = (row: SalesDataRow) => JSON.stringify([row.optionName, row.unitPrice, row.skuId ?? row.productName])
  const patches = new Map(parsed.rowsIncludingPending.map((row, index) => [key(row), edited[index]]))
  const apply = (row: SalesDataRow) => {
    const patch = patches.get(key(row))
    if (!patch) throw new Error('검토 중 판매행이 변경되었습니다. 파일을 다시 선택해주세요.')
    return calculateSalesRow({ ...row, skuId: patch.skuId, productId: patch.productId, productName: patch.productName,
      unitPrice: patch.unitPrice, agreedUnitPrice: patch.agreedUnitPrice, priceSource: patch.priceSource,
      totalCommissionRate: patch.totalCommissionRate, sellerCommissionRate: patch.sellerCommissionRate })
  }
  const rows = parsed.rows.map(apply)
  const rowsIncludingPending = parsed.rowsIncludingPending.map(apply)
  const includedSales = rows.reduce((sum, row) => sum + row.netSales, 0)
  const allSales = rowsIncludingPending.reduce((sum, row) => sum + row.netSales, 0)
  const sourceSales = rowsIncludingPending.reduce((sum, row) => sum + row.grossSales, 0)
  return { rows, rowsIncludingPending, analysis: { ...parsed.analysis, sourceGrossSales: sourceSales, includedGrossSales: includedSales,
    pendingPaymentSales: allSales - includedSales, excludedGrossSales: sourceSales - includedSales,
    statusBreakdown: [
      { status: '정산 반영', quantity: parsed.analysis.includedQuantity, amount: includedSales, included: true },
      { status: '취소·반품', quantity: rowsIncludingPending.reduce((sum, row) => sum + row.canceledQuantity + row.refundedQuantity, 0), amount: sourceSales - allSales, included: false },
      { status: '결제대기', quantity: parsed.analysis.pendingPaymentQuantity, amount: allSales - includedSales, included: false },
    ].filter((item) => item.quantity !== 0 || item.amount !== 0),
  } }
}
