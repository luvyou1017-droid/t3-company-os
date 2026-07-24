import type {
  EvidenceAiComparison,
  EvidenceAiExtraction,
  EvidenceAiProvider,
  EvidenceAiReview,
  EvidenceAiReviewStatus,
  EvidenceExpectedContext,
} from '../types/evidenceAiReview'
import type { PaymentEvidence } from '../types/paymentEvidence'
import { STORAGE_KEYS, storageService } from './storageService'
import { workService } from './workService'
import { compareEvidenceAmount, createMockEvidenceExtraction, EVIDENCE_AI_CONFIDENCE_THRESHOLD, EVIDENCE_AMOUNT_TOLERANCE } from '../utils/evidenceAiReview'

export { EVIDENCE_AI_CONFIDENCE_THRESHOLD, EVIDENCE_AMOUNT_TOLERANCE }

const statusLabels: Record<EvidenceAiReviewStatus, string> = {
  not_analyzed: 'AI 분석 전',
  analyzing: 'AI 분석 중',
  matched: '금액 일치',
  mismatched: '금액 불일치',
  needs_review: '직접 확인 필요',
  failed: '분석 실패',
}

export class MockEvidenceAiProvider implements EvidenceAiProvider {
  async analyze(fileReference: string, context: EvidenceExpectedContext): Promise<EvidenceAiExtraction> {
    return createMockEvidenceExtraction(fileReference, context)
  }
}

export const mockEvidenceAiProvider = new MockEvidenceAiProvider()

function updateEvidenceSnapshot(evidenceId: string, review?: EvidenceAiReview, status: EvidenceAiReviewStatus = 'not_analyzed') {
  const records = storageService.getItem<PaymentEvidence[]>(STORAGE_KEYS.paymentEvidence, [])
  storageService.setItem(STORAGE_KEYS.paymentEvidence, records.map((item) => item.id === evidenceId ? {
    ...item,
    aiReviewStatus: status,
    aiExtractedAmount: review?.comparison.extractedAmount,
    aiExpectedAmount: review?.comparison.expectedAmount,
    aiDifferenceAmount: review?.comparison.differenceAmount,
  } : item))
}

function updateReviewWork(evidenceId: string, status: EvidenceAiReviewStatus) {
  const items = workService.getWorkItems()
  const index = items.findIndex((item) => item.sourceType === 'payment_evidence' && item.sourceId === evidenceId)
  if (index < 0 || !['mismatched', 'needs_review', 'failed'].includes(status)) return
  const message = status === 'mismatched' ? '금액 불일치 확인 필요' : status === 'failed' ? 'AI 분석 실패 · 직접 확인 필요' : 'AI가 금액을 확실히 읽지 못함 · 직접 확인 필요'
  items[index] = {
    ...items[index],
    priority: status === 'mismatched' ? 'high' : items[index].priority,
    description: `${items[index].description}\n${message}`,
    activityLogs: [...items[index].activityLogs, { id: crypto.randomUUID(), at: new Date().toISOString(), message }],
  }
  workService.saveWorkItems(items)
}

export const evidenceAiReviewService = {
  provider: mockEvidenceAiProvider as EvidenceAiProvider,
  getEvidenceAiReview(evidenceId: string) {
    return storageService.getItem<EvidenceAiReview[]>(STORAGE_KEYS.evidenceAiReviews, []).find((item) => item.evidenceId === evidenceId)
  },
  saveEvidenceAiReview(review: EvidenceAiReview) {
    const reviews = storageService.getItem<EvidenceAiReview[]>(STORAGE_KEYS.evidenceAiReviews, [])
    storageService.setItem(STORAGE_KEYS.evidenceAiReviews, [review, ...reviews.filter((item) => item.evidenceId !== review.evidenceId)])
    updateEvidenceSnapshot(review.evidenceId, review, review.comparison.status)
    updateReviewWork(review.evidenceId, review.comparison.status)
    return review
  },
  clearEvidenceAiReview(evidenceId: string) {
    const reviews = storageService.getItem<EvidenceAiReview[]>(STORAGE_KEYS.evidenceAiReviews, [])
    storageService.setItem(STORAGE_KEYS.evidenceAiReviews, reviews.filter((item) => item.evidenceId !== evidenceId))
    updateEvidenceSnapshot(evidenceId)
  },
  compareEvidenceAmount(extraction: EvidenceAiExtraction, context: EvidenceExpectedContext): EvidenceAiComparison {
    return compareEvidenceAmount(extraction, context)
  },
  async analyzeEvidenceMock(evidence: PaymentEvidence, context: EvidenceExpectedContext) {
    updateEvidenceSnapshot(evidence.id, undefined, 'analyzing')
    try {
      const extraction = await this.provider.analyze(evidence.fileName, context)
      const comparison = this.compareEvidenceAmount(extraction, context)
      return this.saveEvidenceAiReview({
        id: `evidence-ai-${crypto.randomUUID()}`,
        evidenceId: evidence.id,
        campaignId: evidence.campaignId,
        settlementId: evidence.settlementId,
        ownerType: evidence.ownerType,
        ownerId: evidence.ownerId,
        extraction,
        comparison,
        analyzedAt: new Date().toISOString(),
        analyzedBy: 'mock_ai',
        modelVersion: 'mock-filename-v1',
      })
    } catch (error) {
      updateEvidenceSnapshot(evidence.id, undefined, 'failed')
      updateReviewWork(evidence.id, 'failed')
      throw error
    }
  },
  getEvidenceAiStatusLabel(status: EvidenceAiReviewStatus = 'not_analyzed') {
    return statusLabels[status]
  },
}
