import type { ProductMaster } from '../types'
export type ProposalRateEvidence = { source: string; product: string; option: string; sale: number; supply: number; rate: number }

const normalize = (value: string) => value.normalize('NFC').toLowerCase().replace(/\s+/g, '')
const baseOption = (value: string) => normalize(value.replace(/ \[(?:본사 네이버 스마트스토어|백화점, 홈쇼핑) 기준\]$/, ''))

// Only the exact imported source and commercial terms can supply a missing rate.
// Positive existing rates are deliberately left for review, never overwritten.
export function reviewProposalRates(product: ProductMaster, evidence: ProposalRateEvidence[]) {
  let filled = 0
  let labeled = 0
  const unresolved: string[] = []
  const conflicts: string[] = []
  const skus = product.skus.map((sku) => {
    if (!sku.active) return sku
    const matches = evidence.filter((row) => normalize(row.source) === normalize(product.sourceFileName ?? '')
      && normalize(row.product) === normalize(sku.productName || product.productName)
      && baseOption(row.option) === baseOption(sku.optionName)
      && row.sale === sku.groupBuyPrice && row.supply === sku.supplyPrice)
    const rates = [...new Set(matches.map((row) => row.rate))]
    if (rates.length !== 1) {
      if (!sku.sellerCommissionRate) unresolved.push(sku.optionName)
      return sku
    }
    const rate = rates[0]
    if (sku.sellerCommissionRate && Math.abs(sku.sellerCommissionRate - rate) > 0.0001) {
      conflicts.push(sku.optionName)
      return sku
    }
    const names = [...new Set(matches.map((row) => row.option))]
    const optionName = names.length === 1 ? names[0] : sku.optionName
    const missing = (sku.sellerCommissionRate === undefined || sku.sellerCommissionRate === 0) && rate > 0
    if (missing) filled++
    if (optionName !== sku.optionName) labeled++
    return missing || optionName !== sku.optionName ? { ...sku, optionName, sellerCommissionRate: rate, updatedAt: new Date().toISOString() } : sku
  })
  const representative = skus.find((sku) => sku.active && sku.representative) ?? skus.find((sku) => sku.active)
  const sellerCommissionRate = !product.sellerCommissionRate && representative?.sellerCommissionRate ? representative.sellerCommissionRate : product.sellerCommissionRate
  const policies = new Set(skus.filter((sku) => sku.active).map((sku) => `${sku.totalCommissionRate}:${sku.sellerCommissionRate}`))
  return { filled, labeled, unresolved, conflicts, changed: filled > 0 || labeled > 0 || sellerCommissionRate !== product.sellerCommissionRate,
    product: { ...product, skus, sellerCommissionRate, commissionCalculationType: policies.size > 1 ? 'sku' as const : product.commissionCalculationType } }
}
