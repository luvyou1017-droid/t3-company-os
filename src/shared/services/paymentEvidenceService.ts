import type {
  EvidenceOwnerType,
  PaymentEvidence,
  RequiredEvidenceValidation,
} from '../types/paymentEvidence'
import type { SellerBusinessType } from '../types/sellerSettlement'
import { getRequiredEvidenceType, validateEvidenceRecords } from '../utils/paymentEvidence'
import { STORAGE_KEYS, storageService } from './storageService'
import { DEFAULT_EVIDENCE_REVIEWER } from '../data/users'
import { campaignService } from './campaignService'
import { notificationService } from './notificationService'
import { workService } from './workService'
import { createPaymentEvidenceRepository } from '../repositories/paymentEvidenceRepository'

const now = () => new Date().toISOString()

export interface PaymentEvidenceRepository {
  list(): PaymentEvidence[]
  save(items: PaymentEvidence[]): void
}

const localStorageRepository: PaymentEvidenceRepository = {
  list: () => storageService.getItem<PaymentEvidence[]>(STORAGE_KEYS.paymentEvidence, []),
  save: (items) => storageService.setItem(STORAGE_KEYS.paymentEvidence, items),
}

function persist(item: PaymentEvidence) {
  localStorageRepository.save([item, ...localStorageRepository.list().filter((evidence) => evidence.id !== item.id)])
  return item
}

export const paymentEvidenceService = {
  getAllEvidence() { return localStorageRepository.list() },
  getEvidenceBySettlementId(settlementId: string, ownerType?: EvidenceOwnerType) {
    return this.getAllEvidence().filter((item) => item.settlementId === settlementId && (!ownerType || item.ownerType === ownerType))
  },
  getEvidenceByPaymentRequestId(paymentRequestId: string) {
    return this.getAllEvidence().filter((item) => item.paymentRequestId === paymentRequestId)
  },
  uploadEvidenceMetadata(input: Omit<PaymentEvidence, 'id' | 'uploadedAt' | 'reviewStatus'> & { id?: string }) {
    const current = this.getEvidenceBySettlementId(input.settlementId, input.ownerType)
      .filter((item) => item.evidenceType === input.evidenceType)
    const previous = current.sort((a, b) => (b.revision ?? 1) - (a.revision ?? 1))[0]
    return persist({
      ...input, id: input.id ?? `evidence-${crypto.randomUUID()}`, uploadedAt: now(), reviewStatus: 'uploaded',
      revision: (previous?.revision ?? 0) + 1, previousEvidenceId: previous?.id,
    })
  },
  removeEvidence(id: string) {
    localStorageRepository.save(this.getAllEvidence().filter((item) => item.id !== id))
  },
  requestEvidenceReview(id: string) {
    const item = this.getAllEvidence().find((candidate) => candidate.id === id)
    if (!item) throw new Error('증빙자료를 찾을 수 없습니다.')
    const next = persist({ ...item, reviewStatus: 'review_pending', reviewedBy: undefined, reviewedAt: undefined, rejectionReason: undefined })
    const campaign = campaignService.getCampaignById(item.campaignId)
    const workId = `payment-evidence-work-${item.id}`
    const aiWarning = item.aiReviewStatus === 'mismatched' ? '금액 불일치 확인 필요'
      : item.aiReviewStatus === 'failed' ? 'AI 분석 실패 · 직접 확인 필요'
        : item.aiReviewStatus === 'needs_review' ? 'AI가 금액을 확실히 읽지 못함 · 직접 확인 필요' : ''
    if (!workService.getWorkItems().some((work) => work.sourceType === 'payment_evidence' && work.sourceId === item.id)) {
      workService.createWorkItem({
        id: workId,
        title: `[${campaign?.campaignName ?? item.campaignId}] ${item.ownerName} 증빙 검수`,
        description: `새 증빙자료 검수 요청이 도착했습니다.${aiWarning ? `\n${aiWarning}` : ''}`,
        workType: '셀러 증빙 확인',
        status: 'pending',
        campaignId: item.campaignId,
        sourceType: 'payment_evidence',
        sourceId: item.id,
        campaignName: campaign?.campaignName ?? item.campaignId,
        sellerName: campaign?.sellerName ?? '-',
        brandName: campaign?.brandName ?? '-',
        assigneeId: DEFAULT_EVIDENCE_REVIEWER.id,
        assigneeName: DEFAULT_EVIDENCE_REVIEWER.name,
        assigneeRole: DEFAULT_EVIDENCE_REVIEWER.role,
        dueDate: new Date().toISOString().slice(0, 10),
        dueTime: '18:00',
        dueAt: `${new Date().toISOString().slice(0, 10)} 18:00`,
        createdReason: '증빙 검수 요청',
        relatedMenu: '증빙 검수',
        checklistName: 'payment_evidence',
        relatedLink: `/payments/evidence-review/${item.id}`,
        priority: item.aiReviewStatus === 'mismatched' ? 'high' : undefined,
        activityLogs: [{ id: crypto.randomUUID(), at: now(), message: `증빙 검수 업무가 자동 생성되었습니다.${aiWarning ? ` ${aiWarning}` : ''}` }],
      })
    }
    notificationService.createNotification({
      id: `payment-evidence-notification-${item.id}`,
      campaignId: item.campaignId,
      relatedType: 'payment',
      relatedId: item.id,
      recipientId: DEFAULT_EVIDENCE_REVIEWER.id,
      recipientName: DEFAULT_EVIDENCE_REVIEWER.name,
      csCaseId: item.id,
      caseNumber: item.id,
      title: '새 증빙자료 검수 요청이 도착했습니다.',
      message: `${campaign?.campaignName ?? item.campaignId} · ${item.ownerName}`,
      createdAt: now(),
      read: false,
      isRead: false,
    })
    return next
  },
  approveEvidence(id: string, reviewedBy = DEFAULT_EVIDENCE_REVIEWER.name, reviewMemo = '검수 승인', overrideReason?: string) {
    const item = this.getAllEvidence().find((candidate) => candidate.id === id)
    if (!item || item.reviewStatus !== 'review_pending') throw new Error('검수 대기 중인 증빙만 승인할 수 있습니다.')
    if (item.aiReviewStatus === 'mismatched' && !overrideReason?.trim()) throw new Error('금액 불일치 예외 승인 사유를 입력해주세요.')
    return persist({
      ...item, reviewStatus: 'approved', humanReviewStatus: 'approved', reviewedBy, reviewedAt: now(),
      reviewMemo, overrideReason: overrideReason?.trim(), rejectionReason: undefined,
    })
  },
  rejectEvidence(id: string, rejectionReason: string, reviewedBy = DEFAULT_EVIDENCE_REVIEWER.name) {
    if (!rejectionReason.trim()) throw new Error('반려 사유를 입력해주세요.')
    const item = this.getAllEvidence().find((candidate) => candidate.id === id)
    if (!item || item.reviewStatus !== 'review_pending') throw new Error('검수 대기 중인 증빙만 반려할 수 있습니다.')
    return persist({ ...item, reviewStatus: 'rejected', humanReviewStatus: 'rejected', reviewedBy, reviewedAt: now(), rejectionReason: rejectionReason.trim() })
  },
  linkToPaymentRequest(settlementId: string, ownerType: EvidenceOwnerType, paymentRequestId: string) {
    localStorageRepository.save(this.getAllEvidence().map((item) =>
      item.settlementId === settlementId && item.ownerType === ownerType ? { ...item, paymentRequestId } : item))
  },
  validateRequiredEvidence(settlementId: string, ownerType: EvidenceOwnerType, businessType: SellerBusinessType, withholdingRegistered = false): RequiredEvidenceValidation {
    return validateEvidenceRecords(this.getAllEvidence(), settlementId, ownerType, businessType, withholdingRegistered)
  },
  getMissingEvidenceReasons(settlementId: string, ownerType: EvidenceOwnerType, businessType: SellerBusinessType, withholdingRegistered = false) {
    return this.validateRequiredEvidence(settlementId, ownerType, businessType, withholdingRegistered).reasons
  },
  getRecommendedEvidenceType: getRequiredEvidenceType,
  saveEvidenceToProvider(item: PaymentEvidence) {
    return createPaymentEvidenceRepository().upsert(item)
  },
}
