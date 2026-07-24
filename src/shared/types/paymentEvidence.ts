import type { SellerBusinessType } from './sellerSettlement'

export type EvidenceOwnerType = 'seller' | 'manager'
export type EvidenceDocumentType = 'tax_invoice' | 'cash_receipt' | 'withholding_entry' | 'other'
export type EvidenceReviewStatus = 'not_uploaded' | 'uploaded' | 'review_pending' | 'approved' | 'rejected'

export interface PaymentEvidence {
  id: string
  campaignId: string
  settlementId: string
  paymentRequestId?: string
  ownerType: EvidenceOwnerType
  ownerId: string
  ownerName: string
  businessType: SellerBusinessType
  evidenceType: EvidenceDocumentType
  fileName: string
  fileType: string
  fileSize: number
  previewUrl?: string
  storageBucket?: string
  storagePath?: string
  uploadedBy: string
  uploadedAt: string
  reviewStatus: EvidenceReviewStatus
  reviewedBy?: string
  reviewedAt?: string
  rejectionReason?: string
  reviewMemo?: string
  revision?: number
  previousEvidenceId?: string
  aiReviewStatus?: import('./evidenceAiReview').EvidenceAiReviewStatus
  aiExtractedAmount?: number
  aiExpectedAmount?: number
  aiDifferenceAmount?: number
  humanReviewStatus?: EvidenceReviewStatus
  overrideReason?: string
  memo?: string
}

export type RequiredEvidenceValidation = {
  valid: boolean
  reasons: string[]
  requiredType?: EvidenceDocumentType
}
