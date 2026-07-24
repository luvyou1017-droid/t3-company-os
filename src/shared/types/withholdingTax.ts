export type WithholdingOwnerType = 'seller' | 'manager'
export type WithholdingTaxStatus =
  | 'draft' | 'ready' | 'uploaded' | 'reported' | 'paid' | 'revision_required' | 'canceled'

export interface WithholdingTaxItem {
  id: string
  campaignId: string
  settlementId: string
  paymentRequestId?: string
  ownerType: WithholdingOwnerType
  ownerId: string
  ownerName: string
  paymentMonth: string
  paymentDate?: string
  grossSettlementAmount: number
  withholdingBaseAmount: number
  incomeTaxRate: 3
  incomeTaxAmount: number
  localIncomeTaxRate: 0.3
  localIncomeTaxAmount: number
  totalWithholdingTaxAmount: number
  finalPaymentAmount: number
  deductions: number
  sourceVersion: number
  status: WithholdingTaxStatus
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  memo?: string
}

export type WithholdingCalculation = Pick<WithholdingTaxItem,
  'grossSettlementAmount' | 'withholdingBaseAmount' | 'incomeTaxRate' | 'incomeTaxAmount' |
  'localIncomeTaxRate' | 'localIncomeTaxAmount' | 'totalWithholdingTaxAmount' | 'finalPaymentAmount' | 'deductions'
> & { log: string[] }
