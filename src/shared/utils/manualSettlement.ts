import type { SalesDataImport, SalesDataRow } from '../types/salesData.ts'

// Same rounding as the settlement engine: round each SKU, or the campaign total.
export function manualCommissionComparison(source: SalesDataImport, rows: SalesDataRow[]) {
  const campaignTotal = source.commissionCalculationType === 'campaign_total'
  let total = 0
  let seller = 0
  let netSales = 0
  for (const row of rows) {
    const totalRate = campaignTotal ? source.totalCommissionRate : row.totalCommissionRate ?? source.totalCommissionRate
    const sellerRate = campaignTotal ? source.sellerCommissionRate ?? source.commissionRate : row.sellerCommissionRate ?? source.sellerCommissionRate ?? source.commissionRate
    if (!row.optionName.trim() || ![row.quantity, row.canceledQuantity, row.refundedQuantity].every((value) => Number.isInteger(value) && value >= 0)
      || !Number.isInteger(row.unitPrice) || row.unitPrice <= 0 || row.quantity < row.canceledQuantity + row.refundedQuantity
      || totalRate === undefined || sellerRate === undefined || !Number.isFinite(totalRate) || !Number.isFinite(sellerRate)
      || totalRate <= 0 || totalRate > 100 || sellerRate < 0 || sellerRate > totalRate) return undefined
    const sales = (row.quantity - row.canceledQuantity - row.refundedQuantity) * row.unitPrice
    netSales += sales
    total += Math.round(sales * totalRate / 100)
    seller += Math.round(sales * sellerRate / 100)
  }
  if (!rows.length) return undefined
  if (campaignTotal) {
    total = Math.round(netSales * source.totalCommissionRate! / 100)
    seller = Math.round(netSales * (source.sellerCommissionRate ?? source.commissionRate)! / 100)
  }
  const reported = source.manualSettlement?.reportedCommissionAmount
  return { total, seller, vendor: total - seller, difference: reported === undefined ? undefined : total - reported }
}
