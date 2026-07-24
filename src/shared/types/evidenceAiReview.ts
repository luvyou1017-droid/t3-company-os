import type { EvidenceDocumentType, EvidenceOwnerType } from './paymentEvidence'
import type { SellerBusinessType } from './sellerSettlement'

export type EvidenceAiReviewStatus = 'not_analyzed' | 'analyzing' | 'matched' | 'mismatched' | 'needs_review' | 'failed'

export interface EvidenceAiExtraction {
  documentType: 'tax_invoice' | 'cash_receipt' | 'unknown'
  supplierName?: string
  recipientName?: string
  issueDate?: string
  supplyAmount?: number
  vatAmount?: number
  totalAmount?: number
  confidence: number
  warnings: string[]
}

export interface EvidenceAiComparison {
  expectedAmount: number
  extractedAmount?: number
  differenceAmount?: number
  status: 'matched' | 'mismatched' | 'needs_review'
  comparisonBasis: 'tax_invoice_total' | 'cash_receipt_amount' | 'manual_review'
  reason: string
}

export interface EvidenceAiReview {
  id: string
  evidenceId: string
  campaignId: string
  settlementId: string
  ownerType: EvidenceOwnerType
  ownerId: string
  extraction: EvidenceAiExtraction
  comparison: EvidenceAiComparison
  analyzedAt: string
  analyzedBy: 'mock_ai' | 'api'
  modelVersion?: string
}

export interface EvidenceExpectedContext {
  evidenceId: string
  campaignId: string
  settlementId: string
  ownerType: EvidenceOwnerType
  ownerId: string
  businessType: SellerBusinessType
  evidenceType: EvidenceDocumentType
  expectedAmount: number
  isSellerPaymentWindow: boolean
  mockAmount?: number
}

export interface EvidenceAiProvider {
  analyze(fileReference: string, expectedContext: EvidenceExpectedContext): Promise<EvidenceAiExtraction>
}
