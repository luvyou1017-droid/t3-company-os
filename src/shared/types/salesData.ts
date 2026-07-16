export type SalesReviewStatus = '업로드 대기' | '업로드 완료' | '검수 중' | '오류 확인 필요' | '확정 완료'

export type SalesSettlementStatus = '정산 전' | '정산 가능' | '정산 생성됨' | '정산 완료'

export type SalesDataSource = 'file' | 'manual' | 'brand-email' | 'brand-link'

export type SalesValidationStatus = 'valid' | 'warning' | 'error'

export type SalesValidationResult = {
  status: SalesValidationStatus
  message: string
  rowId?: string
}

export type SalesDataImport = {
  id: string
  campaignId: string
  fileName: string
  fileSize: number
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
  sampleDeductionAmount?: number
  eventDeductionAmount?: number
}

export type SalesDataRow = {
  id: string
  salesDataImportId: string
  campaignId: string
  optionName: string
  quantity: number
  unitPrice: number
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
