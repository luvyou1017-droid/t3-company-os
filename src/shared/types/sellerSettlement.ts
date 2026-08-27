export type SalesChannelType = 'supplier_link' | 'wise_shop_link' | 'seller_checkout'
export type MoneyCollector = 'supplier' | 'wise_shop' | 'seller'
export type SettlementDirection = 'company_pays_seller' | 'seller_pays_company'
export type SellerBusinessType = 'corporation' | 'general_business' | 'simplified_business' | 'freelancer'
export type SellerEvidenceType = 'tax_invoice' | 'cash_receipt' | 'withholding_3_3'
export type PaymentRequestDirection = 'company_to_seller' | 'seller_to_company'
export type PaymentRequestStatus =
  | 'draft' | 'evidence_pending' | 'request_ready' | 'approval_pending' | 'approved'
  | 'sent' | 'payment_completed' | 'remittance_confirmed' | 'on_hold' | 'rejected' | 'canceled'
export type PaymentRecipientType = 'seller' | 'manager'
export type PaymentDocumentCheckStatus = 'needs_review' | 'attached' | 'reported_issued' | 'follow_up' | 'confirmed'

export type SellerSettlementRule = {
  campaignId: string
  salesChannelType: SalesChannelType
  moneyCollector: MoneyCollector
  settlementDirection: SettlementDirection
  sellerCommissionRate: number
  externalMallExtraRate: number
  externalMallExtraReason: string
  externalMallExtraApprovedBy: string
  externalMallExtraApprovedAt: string
  businessType: SellerBusinessType
  recommendedEvidenceType: SellerEvidenceType
  confirmedEvidenceType?: SellerEvidenceType
  evidenceConfirmed: boolean
  evidenceConfirmedBy?: string
  evidenceConfirmedAt?: string
  evidenceMemo?: string
  shippingAmount: number
  sellerDeductions: number
  updatedAt: string
}

export type SellerSettlementCalculation = {
  productSalesAmount: number
  shippingAmount: number
  totalCollectedAmount: number
  totalCommissionRate: number
  totalCommissionAmount: number
  sellerCommissionRate: number
  externalMallExtraRate: number
  effectiveSellerCommissionRate: number
  sellerCommissionAmount: number
  vendorCommissionAmount: number
  sellerDeductions: number
  supplierInvoiceAmount: number
  sellerGrossSettlementAmount: number
  supplierCostAmount: number
  sellerKeepsAmount: number
  sellerRemittanceToCompany: number
  companyRemittanceToSupplier: number
  taxDocumentAmount: number
  vatExcludedAmount: number
  withholdingBaseAmount: number
  withholdingTaxAmount: number
  finalSellerPaymentAmount: number
}

export type SellerSettlementItem = {
  optionName: string
  quantity: number
  unitPrice: number
  amount: number
}

export type SellerSettlementDocument = {
  id: string
  settlementId: string
  campaignId: string
  sellerId: string
  sellerName: string
  campaignName: string
  salesPeriod: string
  productName: string
  items: SellerSettlementItem[]
  salesChannelType: SalesChannelType
  direction: SettlementDirection
  businessType: SellerBusinessType
  evidenceType: SellerEvidenceType
  evidenceRequestAmount: number
  dueDate: string
  companyAccountPlaceholder: string
  remittanceConfirmed: boolean
  calculation: SellerSettlementCalculation
  createdAt: string
}

export type PaymentRequest = {
  id: string
  campaignId: string
  settlementId: string
  sellerId: string
  recipientType: PaymentRecipientType
  recipientId: string
  recipientName: string
  managerId: string
  managerName: string
  amount: number
  withholdingTaxItemId?: string
  batchRequestId?: string
  sourceVersion: number
  ownerType?: PaymentRecipientType
  ownerId?: string
  ownerName?: string
  direction: PaymentRequestDirection
  salesChannelType: SalesChannelType
  businessType: SellerBusinessType
  evidenceType: SellerEvidenceType
  grossSettlementAmount: number
  vatExcludedAmount: number
  withholdingBaseAmount: number
  withholdingTaxAmount: number
  incomeTaxAmount?: number
  localIncomeTaxAmount?: number
  deductions: number
  finalPaymentAmount: number
  sellerRemittanceToCompany: number
  evidenceStatus: 'pending' | 'confirmed'
  accountConfirmed: boolean
  bankNameSnapshot?: string
  accountNumberSnapshot?: string
  accountHolderSnapshot?: string
  withdrawalMemoSnapshot?: string
  depositMemoSnapshot?: string
  documentCheckStatus?: PaymentDocumentCheckStatus
  documentCheckMemo?: string
  documentCheckedBy?: string
  documentCheckedAt?: string
  documentCheckHistory?: Array<{ status: PaymentDocumentCheckStatus; memo: string; checkedBy: string; checkedAt: string }>
  taxInvoiceFollowUpRequired?: boolean
  taxInvoiceFinalConfirmed?: boolean
  requestedBy: string
  requestedAt: string
  dueDate: string
  approvedBy?: string
  approvedAt?: string
  completedBy?: string
  completedAt?: string
  actualPaidAmount?: number
  payoutBatchId?: string
  canceledBy?: string
  canceledAt?: string
  cancellationReason?: string
  previousStatusBeforeCancellation?: PaymentRequestStatus
  status: PaymentRequestStatus
  memo: string
}

export interface PaymentRequestBatch {
  id: string
  managerId: string
  managerName: string
  recipientType: 'manager'
  paymentRequestIds: string[]
  campaignIds: string[]
  itemCount: number
  grossAmount: number
  incomeTaxAmount: number
  localIncomeTaxAmount: number
  totalWithholdingTaxAmount: number
  finalAmount: number
  requestedBy: string
  requestedAt: string
  status: PaymentRequestStatus
  memo?: string
}

export type SellerSettlementValidation = { valid: boolean; errors: string[] }
