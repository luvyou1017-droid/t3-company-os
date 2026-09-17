export type SalesReviewStatus = '업로드 대기' | '업로드 완료' | '검수 중' | '오류 확인 필요' | '확정 완료'

export type SalesSettlementStatus = '정산 전' | '정산 가능' | '정산 생성됨' | '정산 완료'

export type SalesDataSource = 'file' | 'manual' | 'brand-email' | 'brand-link'
export type PendingPaymentPolicy = 'exclude' | 'include'

export type SalesValidationStatus = 'valid' | 'warning' | 'error'

export type SalesValidationResult = {
  status: SalesValidationStatus
  message: string
  rowId?: string
}

export type SalesEventCostOwner = 'company_manager_prepaid' | 'company' | 'seller' | 'manager' | 'brand'

export type SalesEventCost = {
  id: string
  name: string
  amount: number
  owner: SalesEventCostOwner
  unitPrice?: number
  quantity?: number
  companyUnitCost?: number
  supplierSupportRate?: number
}

export type SalesDataImport = {
  supplyAudience?: 'seller' | 'vendor'
  settlementVendorName?: string
  settlementVendorId?: string

  id: string
  campaignId: string
  fileName: string
  fileSize: number
  originalSalesFileStoragePath?: string
  originalSalesFileStoredAt?: string
  sourceType: SalesDataSource
  uploadedBy: string
  uploadedAt: string
  reviewStatus: SalesReviewStatus
  settlementStatus: SalesSettlementStatus
  confirmedAt?: string
  confirmedBy?: string
  totalQuantity: number
  totalSalesAmount: number
  notes: string
  uploadedProductName?: string
  salesStartDate?: string
  salesEndDate?: string
  reviewerId?: string
  reviewerName?: string
  totalCommissionRate?: number
  sellerCommissionRate?: number
  commissionRate?: number
  commissionCalculationType?: CommissionCalculationType
  sampleDeductionAmount?: number
  eventDeductionAmount?: number
  eventName?: string
  eventCostOwner?: SalesEventCostOwner
  eventCosts?: SalesEventCost[]
  shippingDetails?: Array<{ label: string; quantity: number; unitPrice: number }>
  shippingRevenue?: number
  srookPayNormalAmount?: number
  srookPayPurchaseAmount?: number
  srookPayFeeRate?: number
  srookPayEstimatedFeeAmount?: number
  srookPayActualFeeAmount?: number
  fileAnalysis?: SalesFileAnalysis
  pendingPaymentPolicy?: PendingPaymentPolicy
  commissionSyncMatchedRows?: number
  commissionSyncUnmatchedRows?: number
  commissionSyncedAt?: string
  commissionSyncVersion?: number
  commissionSyncIssues?: CommissionSyncIssue[]
  commissionManualMatches?: Record<string, string>
  settlementTerms?: import('./settlementTerms').SettlementTerms
  fileOrigin?: 'order_hub' | 'srookpay'
  documentAuthor?: import('./settlementTerms').SettlementDocumentAuthor
  documentKind?: import('./settlementTerms').SettlementDocumentKind
  manualSettlement?: {
    amountType: 'seller_vendor_commission'
    reportedCommissionAmount?: number
    reportedOffsetAmount?: number
    quantityBasis: 'net' | 'gross'
    sourceMessage: string
  }
}

export type CommissionSyncSuggestion = {
  skuId: string
  productId: string
  brandName: string
  productName: string
  optionName: string
  groupBuyPrice: number
  pricingType?: 'fixed' | 'quantity_tier'
  minimumQuantity?: number
  maximumQuantity?: number
  similarity: number
  priceMatched: boolean
  totalCommissionRate: number
  sellerCommissionRate: number
  companyCommissionRate: number
}

export type CommissionSyncIssue = {
  rowId: string
  salesOptionName: string
  unitPrice: number
  reason?: 'sku_not_found' | 'commission_policy_missing'
  message?: string
  suggestions: CommissionSyncSuggestion[]
}

export type SalesFileAnalysis = {
  sourceDocumentType?: 'customer_sales' | 'supplier_settlement' | 'supplier_dispatch'
  dispatchSheets?: Array<{ sheetName: string; quantity: number; rowCount: number; duplicateRowCount: number }>
  finalSettlementQuantity?: number
  supplierShippingCost?: number
  supplierPayableTotal?: number
  formatName: string
  sheetName: string
  headerRow: number
  sourceRowCount: number
  includedRowCount: number
  excludedRowCount: number
  sourceQuantity: number
  includedQuantity: number
  sourceGrossSales: number
  includedGrossSales: number
  excludedGrossSales: number
  sourceShippingRevenue?: number
  includedShippingRevenue?: number
  pendingPaymentShippingRevenue?: number
  pendingPaymentRowCount: number
  pendingPaymentQuantity: number
  pendingPaymentSales: number
  pendingPaymentPolicy?: PendingPaymentPolicy
  supplierSettlementAmount?: number
  sellerCommissionRateUsed?: number
  declaredGrossSales?: number
  supplyTotal?: number
  declaredMargin?: number
  statusBreakdown: Array<{ status: string; quantity: number; amount: number; included: boolean }>
  detectedColumns: string[]
  warnings: string[]
}

export type SalesDataRow = {
  id: string
  skuId?: string
  productId?: string
  productName?: string
  agreedUnitPrice?: number
  priceSource?: 'file' | 'sku' | 'manual'
  salesDataImportId: string
  campaignId: string
  optionName: string
  quantity: number
  unitPrice: number
  /** This settlement only. Does not update the product/SKU master. */
  settlementSupplyPrice?: number
  totalCommissionRate?: number
  sellerCommissionRate?: number
  grossSales: number
  canceledQuantity: number
  refundedQuantity: number
  netQuantity: number
  netSales: number
  validationStatus: SalesValidationStatus
  validationMessage: string
}

export type SalesDataTotals = {
  totalQuantity: number
  totalSalesAmount: number
  canceledQuantity: number
  refundedQuantity: number
  netQuantity: number
  netSales: number
  expectedCommission: number
  companyRemainingCommission: number
}
import type { CommissionCalculationType } from './commission'
