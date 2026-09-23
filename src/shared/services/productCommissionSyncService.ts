import { matchFlavorPack, parseFlavorPack } from '../utils/flavorPackMatching'
import { productService } from '../../features/productMaster/services/productService'
import type { ProductMaster, ProductMasterInput, ProductSku } from '../../features/productMaster/types'
import type { SalesDataRow } from '../types/salesData'
import { campaignService } from './campaignService'
import { salesDataService } from './salesDataService'
import { normalizeProductMatchText as normalize, productSkuMatchScore } from '../utils/productSkuMatching'

export const PRODUCT_COMMISSION_SYNC_VERSION = 2

function similarity(left: string, right: string) {
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return 0
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  }
  return Math.round((1 - matrix[a.length][b.length] / Math.max(a.length, b.length)) * 100)
}
const totalRate = (product: ProductMaster, sku: ProductSku) => sku.totalCommissionRate
  ?? (sku.groupBuyPrice > 0 ? ((sku.groupBuyPrice - sku.supplyPrice) / sku.groupBuyPrice) * 100 : product.totalCommissionRate)
const commissionPolicy = (product: ProductMaster, sku: ProductSku) => {
  const resolvedTotalRate = totalRate(product, sku)
  const resolvedSellerRate = sku.sellerCommissionRate ?? product.sellerCommissionRate
  const valid = Number.isFinite(resolvedTotalRate)
    && resolvedTotalRate > 0
    && resolvedTotalRate <= 100
    && Number.isFinite(resolvedSellerRate)
    && resolvedSellerRate > 0
    && resolvedSellerRate <= resolvedTotalRate
  return { totalCommissionRate: resolvedTotalRate, sellerCommissionRate: resolvedSellerRate, valid }
}
const manualMatchKey = (row: Pick<SalesDataRow, 'optionName' | 'unitPrice'>) => `${normalize(row.optionName)}::${Math.round(row.unitPrice)}`

export async function syncProductCommissionRates(salesDataImportId: string) {
  const salesImport = salesDataService.getSalesDataImportById(salesDataImportId)
  if (!salesImport) return { matched: 0, unmatched: 0, rows: [] as SalesDataRow[] }
  if (salesImport.supplyAudience === 'vendor' || salesImport.settlementTerms || salesImport.manualSettlement) return { matched: 0, unmatched: 0, rows: salesDataService.getRowsByImportId(salesDataImportId), issues: [] }
  const campaign = campaignService.getCampaignById(salesImport.campaignId)
  const allProducts = await productService.listProducts()
  const campaignProducts = campaign ? allProducts.filter((product) => product.id === campaign.productId) : []
  const brandProducts = allProducts.filter((product) => {
    if (!campaign) return true
    return product.brandId === campaign.brandId || normalize(product.brandName) === normalize(campaign.brandName)
  })
  const allCandidates = allProducts
    .flatMap((product) => product.skus.filter((sku) => sku.active).map((sku) => ({ product, sku })))
  const manuallyMatchedSkuIds = new Set(Object.values(salesImport.commissionManualMatches ?? {}))
  const manuallyMatchedProductIds = new Set(allCandidates
    .filter(({ sku }) => manuallyMatchedSkuIds.has(sku.id))
    .map(({ product }) => product.id))
  const manuallyMatchedProducts = allProducts.filter((product) => manuallyMatchedProductIds.has(product.id))
  // A confirmed SKU match also confirms the actual product/supplier for sibling
  // options. Keep that product ahead of stale campaign brand data after re-upload.
  const confirmedProduct = manuallyMatchedProducts.length === 1 ? manuallyMatchedProducts[0] : undefined
  const policyProduct = confirmedProduct ?? campaignProducts[0] ?? (brandProducts.length === 1 ? brandProducts[0] : undefined)
  const activePolicySkus = policyProduct?.skus.filter((sku) => sku.active) ?? []
  const policyRatePairs = new Set(activePolicySkus.map((sku) => `${Number(totalRate(policyProduct!, sku).toFixed(4))}:${Number((sku.sellerCommissionRate ?? policyProduct!.sellerCommissionRate).toFixed(4))}`))
  const inferredCampaignTotal = Boolean(policyProduct && activePolicySkus.some((sku) => sku.pricingType === 'quantity_tier') && policyRatePairs.size === 1)
  const commissionCalculationType = policyProduct?.commissionCalculationType ?? (inferredCampaignTotal ? 'campaign_total' : 'sku')
  if (policyProduct && policyProduct.sellerCommissionRate > 0 && commissionCalculationType === 'campaign_total' && manuallyMatchedSkuIds.size === 0) {
    const totalCommissionRate = policyProduct.totalCommissionRate ?? campaign?.totalCommissionRate ?? salesImport.totalCommissionRate
    const sellerCommissionRate = policyProduct.sellerCommissionRate > 0
      ? policyProduct.sellerCommissionRate
      : campaign?.sellerCommissionRate && campaign.sellerCommissionRate > 0
        ? campaign.sellerCommissionRate
        : undefined
    const rows = salesDataService.getRowsByImportId(salesDataImportId).map((row) => ({ ...row, totalCommissionRate, sellerCommissionRate }))
    salesDataService.saveRows([...rows, ...salesDataService.getSalesDataRows().filter((row) => row.salesDataImportId !== salesDataImportId)])
    salesDataService.updateSalesDataImport({
      ...salesImport,
      totalCommissionRate,
      sellerCommissionRate,
      commissionRate: sellerCommissionRate,
      commissionCalculationType: 'campaign_total',
      commissionSyncMatchedRows: rows.length,
      commissionSyncUnmatchedRows: 0,
      commissionSyncedAt: new Date().toISOString(),
      commissionSyncVersion: PRODUCT_COMMISSION_SYNC_VERSION,
      commissionSyncIssues: [],
    })
    return { matched: rows.length, unmatched: 0, rows, issues: [] }
  }
  const candidates = (confirmedProduct ? [confirmedProduct] : campaignProducts.length ? campaignProducts : brandProducts.length ? brandProducts : [])
    .flatMap((product) => product.skus.filter((sku) => sku.active).map((sku) => ({ product, sku })))
  let matched = 0
  const issues: NonNullable<typeof salesImport.commissionSyncIssues> = []
  const rows = salesDataService.getRowsByImportId(salesDataImportId).map((row) => {
    const tierPriceProductIds = new Set(candidates.filter(({ sku }) => sku.pricingType === 'quantity_tier' && Math.round(row.unitPrice) === Math.round(sku.groupBuyPrice)).map(({ product }) => product.id))
    const allowTierPriceMatch = campaignProducts.length > 0 || tierPriceProductIds.size === 1
    const manualSkuId = salesImport.commissionManualMatches?.[manualMatchKey(row)] ?? salesImport.commissionManualMatches?.[normalize(row.optionName)]
    // A confirmed manual match represents the actual supplier/SKU used for the
    // campaign. It must win even when an imported Notion campaign still carries
    // an older supplier or brand id (for example, after the supplier changes).
    const manual = manualSkuId ? allCandidates.find((candidate) => candidate.sku.id === manualSkuId) : undefined
    const ranked = manual ? { ...manual, score: 999 } : candidates.map((candidate) => ({ ...candidate, score: productSkuMatchScore(row, candidate.product, candidate.sku, allowTierPriceMatch) }))
      .filter((candidate) => candidate.score >= 80)
      .sort((a, b) => b.score - a.score)
    const best = !Array.isArray(ranked) ? ranked : ranked[0] && (!parseFlavorPack(row.optionName) || !ranked[1] || ranked[0].score > ranked[1].score) ? ranked[0] : undefined
    if (!best) {
      const suggestions = candidates.map(({ product, sku }) => {
        const optionSimilarity = similarity(row.optionName, sku.optionName)
        const productSimilarity = similarity(row.optionName, sku.productName || product.productName)
        const candidateTotalRate = Number(totalRate(product, sku).toFixed(4))
        const candidateSellerRate = sku.sellerCommissionRate ?? product.sellerCommissionRate
        return {
          skuId: sku.id,
          productId: product.id,
          brandName: product.brandName,
          productName: sku.productName || product.productName,
          optionName: sku.optionName,
          groupBuyPrice: sku.groupBuyPrice,
          pricingType: sku.pricingType,
          minimumQuantity: sku.minimumQuantity,
          maximumQuantity: sku.maximumQuantity,
          similarity: Math.max(optionSimilarity, productSimilarity),
          priceMatched: Math.round(row.unitPrice) === Math.round(sku.groupBuyPrice),
          totalCommissionRate: candidateTotalRate,
          sellerCommissionRate: candidateSellerRate,
          companyCommissionRate: Number(Math.max(candidateTotalRate - candidateSellerRate, 0).toFixed(4)),
        }
      }).sort((a, b) => Number(b.priceMatched) - Number(a.priceMatched) || b.similarity - a.similarity).slice(0, 3)
      issues.push({ rowId: row.id, salesOptionName: row.optionName, unitPrice: row.unitPrice, reason: 'sku_not_found', message: '연결할 상품·SKU를 확인해주세요.', suggestions })
      return row
    }
    const policy = commissionPolicy(best.product, best.sku)
    if (!policy.valid) {
      issues.push({
        rowId: row.id,
        salesOptionName: row.optionName,
        unitPrice: row.unitPrice,
        reason: 'commission_policy_missing',
        message: 'SKU는 연결됐지만 셀러 수수료 조건이 없습니다. 수수료율을 확인해주세요.',
        suggestions: [],
      })
      return { ...row, totalCommissionRate: undefined, sellerCommissionRate: undefined }
    }
    matched += 1
    return {
      ...row,
      skuId: best.sku.id, productId: best.product.id, productName: best.product.productName,
      skuOptionName: best.sku.optionName,
      agreedUnitPrice: row.agreedUnitPrice ?? best.sku.groupBuyPrice,
      sellerSupplyPrice: row.sellerSupplyPrice ?? best.sku.currentTradeTerms?.sellerSupplyPrice,
      detailOption: matchFlavorPack(row.optionName, best.sku.optionName, '', best.sku.productName || best.product.productName)?.detailOption ?? row.detailOption,
      totalCommissionRate: Number(policy.totalCommissionRate.toFixed(4)),
      sellerCommissionRate: policy.sellerCommissionRate,
    }
  })
  salesDataService.saveRows([...rows, ...salesDataService.getSalesDataRows().filter((row) => row.salesDataImportId !== salesDataImportId)])
  salesDataService.updateSalesDataImport({
    ...salesImport,
    ...(matched === rows.length && rows.length > 0 && new Set(rows.map((row) => row.sellerCommissionRate)).size === 1 ? {
      sellerCommissionRate: rows[0].sellerCommissionRate,
      commissionRate: rows[0].sellerCommissionRate,
    } : {}),
    ...(matched === rows.length && rows.length > 0 && new Set(rows.map((row) => row.totalCommissionRate)).size === 1 ? {
      totalCommissionRate: rows[0].totalCommissionRate,
    } : {}),
    commissionSyncMatchedRows: matched,
    commissionSyncUnmatchedRows: rows.length - matched,
    commissionSyncedAt: new Date().toISOString(),
    commissionSyncVersion: PRODUCT_COMMISSION_SYNC_VERSION,
    commissionSyncIssues: issues,
    commissionCalculationType: 'sku',
  })
  return { matched, unmatched: rows.length - matched, rows, issues }
}

export async function manuallyMatchSalesRow(salesDataImportId: string, rowId: string, skuId: string) {
  const salesImport = salesDataService.getSalesDataImportById(salesDataImportId)
  if (!salesImport) throw new Error('판매데이터를 찾을 수 없습니다.')
  if (salesImport.settlementTerms) throw new Error('저장된 공구 조건이 있습니다. 판매 수량·조건 수정에서 변경해주세요.')
  const products = await productService.listProducts()
  const candidate = products.flatMap((product) => product.skus.map((sku) => ({ product, sku }))).find(({ sku }) => sku.id === skuId)
  if (!candidate) throw new Error('선택한 상품 구성을 찾을 수 없습니다.')
  const targetRow = salesDataService.getRowsByImportId(salesDataImportId).find((row) => row.id === rowId)
  if (!targetRow) throw new Error('연결할 판매행을 찾을 수 없습니다.')
  const normalizedOptionName = normalize(targetRow.optionName)
  salesDataService.updateSalesDataImport({
    ...salesImport,
    // Keep both keys. Settlement files can replace a supplier price with the
    // customer sale price, so a price-only key would silently lose the user's
    // confirmed SKU selection after the file is re-uploaded.
    commissionManualMatches: {
      ...salesImport.commissionManualMatches,
      [normalizedOptionName]: skuId,
      [manualMatchKey(targetRow)]: skuId,
    },
  })
  return syncProductCommissionRates(salesDataImportId)
}

export async function createSkuFromSalesRow(salesDataImportId: string, rowId: string, sourceSkuId: string) {
  const salesImport = salesDataService.getSalesDataImportById(salesDataImportId)
  if (!salesImport) throw new Error('판매데이터를 찾을 수 없습니다.')
  const products = await productService.listProducts()
  const candidate = products.flatMap((product) => product.skus.map((sku) => ({ product, sku }))).find(({ sku }) => sku.id === sourceSkuId)
  if (!candidate) throw new Error('조건을 복사할 기준 구성을 찾을 수 없습니다.')
  const targetRow = salesDataService.getRowsByImportId(salesDataImportId).find((row) => row.id === rowId)
  if (!targetRow) throw new Error('등록할 판매행을 찾을 수 없습니다.')
  if (parseFlavorPack(targetRow.optionName)) {
    const packSkus = candidate.product.skus.filter(sku => sku.active && matchFlavorPack(targetRow.optionName, sku.optionName, '', sku.productName || candidate.product.productName))
    if (packSkus.length === 1) return manuallyMatchSalesRow(salesDataImportId, rowId, packSkus[0].id)
    throw new Error('맛 구성은 세부옵션입니다. 신규 SKU를 만들지 않고 기존 개수별 SKU를 확인해주세요.')
  }
  const existing = candidate.product.skus.find((sku) => normalize(sku.optionName) === normalize(targetRow.optionName))
  if (existing) return manuallyMatchSalesRow(salesDataImportId, rowId, existing.id)
  const now = new Date().toISOString()
  const nextSku: ProductSku = {
    ...candidate.sku,
    id: crypto.randomUUID(),
    skuCode: `${candidate.sku.skuCode || candidate.product.productCode}-AUTO-${candidate.product.skus.length + 1}`,
    productId: candidate.product.id,
    optionName: targetRow.optionName,
    representative: false,
    createdAt: now,
    updatedAt: now,
  }
  const persistedKeys = new Set(['id', 'createdAt', 'updatedAt', 'version', 'companyCommissionRate'])
  const input = Object.fromEntries(Object.entries(candidate.product).filter(([key]) => !persistedKeys.has(key))) as ProductMasterInput
  await productService.updateProduct(candidate.product.id, { ...input, skus: [...candidate.product.skus, nextSku] })
  return manuallyMatchSalesRow(salesDataImportId, rowId, nextSku.id)
}
