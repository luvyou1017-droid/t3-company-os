export type SalesChannelType = 'supplier_link' | 'wise_shop_link' | 'seller_checkout'
export type MoneyCollector = 'supplier' | 'wise_shop' | 'seller'
export type SettlementDirection = 'company_pays_seller' | 'seller_pays_company'
export type SellerBusinessType = 'corporation' | 'general_business' | 'simplified_business' | 'freelancer'
export type SellerEvidenceType = 'tax_invoice' | 'cash_receipt' | 'withholding_3_3'
export type PaymentRequestDirection = 'company_to_seller' | 'seller_to_company'
export type PaymentRequestStatus =
  | 'draft' | 'evidence_pending' | 'request_ready' | 'approval_pending' | 'approved'
  | 'sent' | 'payment_completed' | 'remittance_confirmed' | 'on_hold' | 'rejected'

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
  direction: PaymentRequestDirection
  salesChannelType: SalesChannelType
  businessType: SellerBusinessType
  evidenceType: SellerEvidenceType
  grossSettlementAmount: number
  vatExcludedAmount: number
  withholdingBaseAmount: number
  withholdingTaxAmount: number
  deductions: number
  finalPaymentAmount: number
  sellerRemittanceToCompany: number
  evidenceStatus: 'pending' | 'confirmed'
  accountConfirmed: boolean
  requestedBy: string
  requestedAt: string
  dueDate: string
  approvedBy?: string
  approvedAt?: string
  completedBy?: string
  completedAt?: string
  status: PaymentRequestStatus
  memo: string
}

export type SellerSettlementValidation = { valid: boolean; errors: string[] }
