export type SettlementStatus =
  | 'draft'
  | 'calculating'
  | 'review_pending'
  | 'revision_required'
  | 'manager_reviewed'
  | 'approval_pending'
  | 'approved'
  | 'payment_ready'
  | 'partially_paid'
  | 'completed'
  | 'canceled'

export type SettlementTaxType = 'tax_invoice' | 'cash_receipt' | 'withholding_3_3'
export type SettlementEvidenceStatus = 'unchecked' | 'pending' | 'confirmed' | 'not_required'
export type SettlementDeductionType = 'sample' | 'event' | 'purchase' | 'shipping' | 'refund' | 'promotion' | 'other'
export type SettlementCostOwner = 'company' | 'seller' | 'brand' | 'manager' | 'undecided'
export type SettlementApplyLocation =
  | 'net_company_commission'
  | 'seller_payment'
  | 'manager_payment'
  | 'record_only'
  | 'needs_review'

export type SettlementDeduction = {
  id: string
  settlementId: string
  campaignId: string
  type: SettlementDeductionType
  title: string
  amount: number
  costOwner: SettlementCostOwner
  linkedData: string
  evidenceStatus: SettlementEvidenceStatus
  applyLocation: SettlementApplyLocation
  reflected: boolean
  memo: string
  createdAt: string
  updatedAt: string
}

export type SettlementCalculationStep = {
  id: string
  order: number
  label: string
  inputValues: string[]
  formula: string
  result: number | string
  source: string
  modified: boolean
  calculatedAt: string
}

export type SettlementCalculationSnapshot = {
  grossSales: number
  netSales: number
  totalCommissionRate: number
  sellerCommissionRate: number
  commissionRate: number
  grossCommission: number
  sellerCommissionAmount: number
  vendorCommission: number
  deductions: SettlementDeduction[]
  deductionTotal: number
  companySampleDeduction: number
  companyEventDeduction: number
  companyOtherDeduction: number
  sellerDeduction: number
  sellerDeductionTotal: number
  managerDeduction: number
  managerDeductionTotal: number
  distributableVendorCommission: number
  netCompanyCommission: number
  managerShareRate: number
  companyShareRate: number
  managerRate: number
  companyRate: number
  managerAmount: number
  companyAmount: number
  finalSellerPaymentAmount: number
  sellerPaymentAmount: number
  taxAmount: number
  finalPaymentAmount: number
  calculatedAt: string
  calculatedBy: string
}

export type SettlementReviewChecklist = {
  salesMatches: boolean
  commissionRateConfirmed: boolean
  sampleCostReflected: boolean
  eventCostReflected: boolean
  otherDeductionsConfirmed: boolean
  costOwnersConfirmed: boolean
  managerShareConfirmed: boolean
  taxTypeConfirmed: boolean
  evidenceConfirmed: boolean
  paymentAccountConfirmed: boolean
}

export type SettlementActivityAction =
  | 'draft_created'
  | 'calculation_run'
  | 'deduction_added'
  | 'deduction_updated'
  | 'deduction_removed'
  | 'commission_rate_updated'
  | 'manager_review_requested'
  | 'manager_review_completed'
  | 'revision_requested'
  | 'approval_requested'
  | 'approved'
  | 'payment_ready'
  | 'seller_payment_completed'
  | 'manager_payment_completed'
  | 'company_settlement_completed'
  | 'completed'

export type SettlementActivityLog = {
  id: string
  settlementId: string
  campaignId: string
  at: string
  actor: string
  action: SettlementActivityAction
  previousStatus?: SettlementStatus
  nextStatus?: SettlementStatus
  reason: string
  version: number
}

export type SettlementVersion = {
  id: string
  settlementId: string
  campaignId: string
  version: number
  changedAt: string
  changedBy: string
  reason: string
  beforeAmount: number
  afterAmount: number
  status: SettlementStatus
  snapshot: SettlementCalculationSnapshot
}

export type Settlement = {
  id: string
  campaignId: string
  salesDataImportId: string
  settlementVersion: number
  status: SettlementStatus
  createdAt: string
  updatedAt: string
  createdBy: string
  assigneeName: string
  paymentDueDate: string
  taxType: SettlementTaxType
  evidenceStatus: SettlementEvidenceStatus
  accountConfirmed: boolean
  taxEvidenceConfirmed: boolean
  sellerPaymentCompleted: boolean
  managerPaymentCompleted: boolean
  companySettlementCompleted: boolean
  reviewChecklist: SettlementReviewChecklist
  calculationSnapshot?: SettlementCalculationSnapshot
  originalSnapshot?: SettlementCalculationSnapshot
  currentCalculation: SettlementCalculationSnapshot
  calculationSteps: SettlementCalculationStep[]
  hasSourceChanged: boolean
  sourceChangeReason?: string
}

export type SettlementValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export type SettlementVersionComparison = {
  label: string
  before: number
  after: number
  changed: boolean
}
