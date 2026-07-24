import type {
  EvidenceOwnerType,
  PaymentEvidence,
  RequiredEvidenceValidation,
} from '../types/paymentEvidence'
import type { SellerBusinessType } from '../types/sellerSettlement'
import { getRequiredEvidenceType, validateEvidenceRecords } from '../utils/paymentEvidence'
import { STORAGE_KEYS, storageService } from './storageService'

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
  uploadEvidenceMetadata(input: Omit<PaymentEvidence, 'id' | 'uploadedAt' | 'reviewStatus'>) {
    const current = this.getEvidenceBySettlementId(input.settlementId, input.ownerType)
      .filter((item) => item.evidenceType === input.evidenceType)
    current.forEach((item) => localStorageRepository.save(localStorageRepository.list().filter((candidate) => candidate.id !== item.id)))
    return persist({ ...input, id: `evidence-${crypto.randomUUID()}`, uploadedAt: now(), reviewStatus: 'uploaded' })
  },
  removeEvidence(id: string) {
    localStorageRepository.save(this.getAllEvidence().filter((item) => item.id !== id))
  },
  requestEvidenceReview(id: string) {
    const item = this.getAllEvidence().find((candidate) => candidate.id === id)
    if (!item) throw new Error('증빙자료를 찾을 수 없습니다.')
    return persist({ ...item, reviewStatus: 'review_pending', reviewedBy: undefined, reviewedAt: undefined, rejectionReason: undefined })
  },
  approveEvidence(id: string, reviewedBy = '허수정') {
    const item = this.getAllEvidence().find((candidate) => candidate.id === id)
    if (!item || item.reviewStatus !== 'review_pending') throw new Error('검수 대기 중인 증빙만 승인할 수 있습니다.')
    return persist({ ...item, reviewStatus: 'approved', reviewedBy, reviewedAt: now(), rejectionReason: undefined })
  },
  rejectEvidence(id: string, rejectionReason: string, reviewedBy = '허수정') {
    if (!rejectionReason.trim()) throw new Error('반려 사유를 입력해주세요.')
    const item = this.getAllEvidence().find((candidate) => candidate.id === id)
    if (!item || item.reviewStatus !== 'review_pending') throw new Error('검수 대기 중인 증빙만 반려할 수 있습니다.')
    return persist({ ...item, reviewStatus: 'rejected', reviewedBy, reviewedAt: now(), rejectionReason: rejectionReason.trim() })
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
}
