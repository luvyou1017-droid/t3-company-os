import type { Campaign } from '../types/campaign'
import type { SalesDataImport, SalesDataRow } from '../types/salesData'
import { campaignChannel } from './uploadSettlementConditions'

export function calculateVendorDocument(rows: SalesDataRow[], source: SalesDataImport, campaign?: Campaign) {
  const channel = campaignChannel(campaign, source)
  const receivable = channel === 'seller_checkout'
  const items = rows.map((row) => {
    const quantity = Math.max(row.quantity - row.canceledQuantity - row.refundedQuantity, 0)
    const rate = row.sellerCommissionRate
    const validRate = rate !== undefined && Number.isFinite(rate) && rate >= 0 && rate <= 100
    const commission = validRate ? Math.round(row.netSales * rate / 100) : undefined
    return { row, quantity, rate, commission, supplyAmount: commission === undefined ? undefined : row.netSales - commission }
  })
  const missingRate = items.some((item) => item.commission === undefined)
  const salesTotal = items.reduce((sum, item) => sum + item.row.netSales, 0)
  const commissionTotal = missingRate ? undefined : items.reduce((sum, item) => sum + item.commission!, 0)
  const supplyTotal = commissionTotal === undefined ? undefined : salesTotal - commissionTotal
  // Seller-checkout files often expose the collected customer shipping only as
  // supplierShippingCost. In that flow it is also the amount the seller must
  // remit to the company, so use it as the final fallback for the receivable.
  const recordedShipping = source.shippingDetails?.length
    ? source.shippingDetails.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0)
    : source.shippingRevenue
      ?? source.fileAnalysis?.includedShippingRevenue
  const supplierShipping = source.fileAnalysis?.supplierShippingCost
  const shipping = receivable && (recordedShipping === undefined || recordedShipping === 0) && supplierShipping !== undefined && supplierShipping > 0
    ? supplierShipping
    : recordedShipping
  const shippingKnown = shipping !== undefined && Number.isFinite(shipping) && shipping >= 0
  const finalAmount = !channel ? undefined : receivable
    ? supplyTotal === undefined || !shippingKnown ? undefined : supplyTotal + shipping!
    : commissionTotal
  return { items, channel, receivable, salesTotal, commissionTotal, supplyTotal, shipping: shippingKnown ? shipping : undefined, finalAmount }
}
