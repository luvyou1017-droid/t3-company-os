import { calculateSupplierPayment, type SupplierPayment } from './supplierPayment'
import type { SalesDataImport, SalesDataRow } from '../types/salesData'
import type { CampaignSalesChannelType } from '../types/campaign'

// Same arithmetic and fallback order as the existing supplier document.
export function supplierDocumentAmounts(source: SalesDataImport, rows: SalesDataRow[], channel?: CampaignSalesChannelType, terms?: SupplierPayment, preserveLegacy = false) {
  if (channel !== 'supplier_link' && !preserveLegacy) {
    const payment = calculateSupplierPayment(terms, rows)
    return { supplierCollects: false, knownChannel: Boolean(channel), supply: payment.supply, shipping: payment.shipping, commission: undefined, amount: channel ? payment.amount : undefined }
  }
  const file = source.fileAnalysis
  const supplierCollects = channel === 'supplier_link'
  const knownChannel = Boolean(channel)
  const hasSettlementSupplyOverride = rows.some((row) => row.settlementSupplyPrice !== undefined)
  const calculatedSupply = rows.every((row) => row.settlementSupplyPrice !== undefined || row.totalCommissionRate !== undefined)
    ? rows.reduce((sum, row) => {
      const quantity = Math.max(row.quantity - row.canceledQuantity - row.refundedQuantity, 0)
      const unitSupply = row.settlementSupplyPrice ?? Math.round(row.unitPrice * (1 - row.totalCommissionRate! / 100))
      return sum + unitSupply * quantity
    }, 0)
    : undefined
  const supply = hasSettlementSupplyOverride ? calculatedSupply : file?.supplyTotal ?? calculatedSupply
  const hasSettlementShipping = Boolean(source.shippingDetails?.length || source.shippingRevenue !== undefined)
  const shipping = source.shippingDetails?.length
    ? source.shippingDetails.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    : source.shippingRevenue ?? file?.supplierShippingCost ?? file?.includedShippingRevenue
  const calculatedPayable = supply !== undefined && shipping !== undefined ? supply + shipping : undefined
  const payable = hasSettlementSupplyOverride || hasSettlementShipping ? calculatedPayable : file?.supplierPayableTotal ?? calculatedPayable
  const commission = rows.every(row=>row.totalCommissionRate!==undefined) ? rows.reduce((sum,row)=>sum+Math.round(row.netSales*row.totalCommissionRate!/100),0):undefined
  const amount = !knownChannel ? undefined : supplierCollects ? commission : payable
  return { supplierCollects, knownChannel, supply, shipping, commission, amount }
}

export function supplierOffsetSummary(source: SalesDataImport, base: number | undefined, supplierCollects: boolean) {
  const manual = source.manualSettlement
  const offset = manual?.reportedOffsetAmount
  if (offset === undefined || offset === 0) return { offset: 0, finalAmount: base, needsReview: false }
  const reported = manual?.reportedCommissionAmount
  const valid = supplierCollects && base !== undefined && Number.isFinite(base) && Number.isFinite(offset) && offset >= 0 && reported !== undefined && Number.isFinite(reported) && reported === base && offset <= base
  // reportedCommissionAmount is BEFORE offset. Never subtract from an already-net total.
  return { offset, finalAmount: valid ? base! - offset : undefined, needsReview: !valid }
}
