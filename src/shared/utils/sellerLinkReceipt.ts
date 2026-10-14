import type { Campaign } from '../types/campaign'
import type { SalesDataImport, SalesDataRow } from '../types/salesData'
import type { Settlement } from '../types/settlement'
import { calculateVendorDocument } from './vendorSettlementDocument'
import { sellerAdditionalPayments } from './settlementAdjustments'

export function sellerLinkReceiptAmount(settlement: Settlement, source: SalesDataImport, rows: SalesDataRow[], campaign?: Campaign) {
  const report = calculateVendorDocument(rows, source, campaign)
  if (!report.receivable || report.finalAmount === undefined) return undefined
  const adjustment = source.supplyAudience === 'vendor' ? 0 : settlement.currentCalculation.sellerDeductionTotal
    - sellerAdditionalPayments(settlement.currentCalculation.deductions, settlement.currentCalculation.adjustmentCalculationVersion)
  return report.finalAmount + adjustment
}
