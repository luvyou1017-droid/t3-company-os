import type { EvidenceAiComparison, EvidenceAiExtraction, EvidenceExpectedContext } from '../types/evidenceAiReview'

export const EVIDENCE_AMOUNT_TOLERANCE = 0
export const EVIDENCE_AI_CONFIDENCE_THRESHOLD = 0.7

export function createMockEvidenceExtraction(fileReference: string, context: EvidenceExpectedContext): EvidenceAiExtraction {
  const normalized = fileReference.toLowerCase()
  const documentType = context.evidenceType === 'tax_invoice'
    ? 'tax_invoice'
    : context.evidenceType === 'cash_receipt' ? 'cash_receipt' : 'unknown'
  if (normalized.includes('failed')) throw new Error('Mock AI 분석 실패')
  if (normalized.includes('unclear')) return { documentType, confidence: 0.38, warnings: ['금액 영역을 확실히 읽지 못했습니다.'] }
  const totalAmount = normalized.includes('matched')
    ? context.expectedAmount
    : normalized.includes('mismatch') ? Math.max(0, context.expectedAmount - 15_130) : context.mockAmount
  return {
    documentType,
    supplierName: 'Mock 공급자',
    recipientName: 'T3 Company',
    issueDate: new Date().toISOString().slice(0, 10),
    supplyAmount: totalAmount === undefined ? undefined : Math.round(totalAmount / 1.1),
    vatAmount: totalAmount === undefined ? undefined : totalAmount - Math.round(totalAmount / 1.1),
    totalAmount,
    confidence: totalAmount === undefined ? 0.55 : 0.96,
    warnings: totalAmount === undefined ? ['파일명에 matched, mismatch 또는 unclear를 포함해 Mock 결과를 확인할 수 있습니다.'] : [],
  }
}

export function compareEvidenceAmount(extraction: EvidenceAiExtraction, context: EvidenceExpectedContext): EvidenceAiComparison {
  if (context.isSellerPaymentWindow) {
    return { expectedAmount: context.expectedAmount, extractedAmount: extraction.totalAmount, differenceAmount: extraction.totalAmount === undefined ? undefined : extraction.totalAmount - context.expectedAmount, status: 'needs_review', comparisonBasis: 'manual_review', reason: '셀러 결제창의 증빙 금액과 회사 입금 요청액은 의미가 달라 직접 확인이 필요합니다.' }
  }
  const comparisonBasis = context.businessType === 'simplified_business' ? 'cash_receipt_amount' : 'tax_invoice_total'
  if (extraction.totalAmount === undefined || extraction.confidence < EVIDENCE_AI_CONFIDENCE_THRESHOLD) {
    return { expectedAmount: context.expectedAmount, extractedAmount: extraction.totalAmount, differenceAmount: extraction.totalAmount === undefined ? undefined : extraction.totalAmount - context.expectedAmount, status: 'needs_review', comparisonBasis, reason: '금액을 읽지 못했거나 신뢰도가 낮아 직접 확인이 필요합니다.' }
  }
  const differenceAmount = Math.round(extraction.totalAmount) - Math.round(context.expectedAmount)
  const matched = Math.abs(differenceAmount) <= EVIDENCE_AMOUNT_TOLERANCE
  return { expectedAmount: Math.round(context.expectedAmount), extractedAmount: Math.round(extraction.totalAmount), differenceAmount, status: matched ? 'matched' : 'mismatched', comparisonBasis, reason: matched ? '원 단위 증빙 발행금액이 정산 기준금액과 일치합니다.' : `원 단위 금액 차이가 ${differenceAmount.toLocaleString('ko-KR')}원입니다.` }
}
