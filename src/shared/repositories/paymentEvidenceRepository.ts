import type { PaymentEvidence } from '../types/paymentEvidence'
import { getDataProviderMode } from '../lib/dataProvider'
import { STORAGE_KEYS, storageService } from '../services/storageService'
import { LocalRepository, SupabaseRepository, type DataRepository } from './baseRepository'
import { toDatabaseUuid } from '../utils/databaseId'

export class LocalPaymentEvidenceRepository extends LocalRepository<PaymentEvidence> {
  constructor() { super(() => storageService.getItem<PaymentEvidence[]>(STORAGE_KEYS.paymentEvidence, []), (items) => storageService.setItem(STORAGE_KEYS.paymentEvidence, items)) }
}
export class SupabasePaymentEvidenceRepository extends SupabaseRepository<PaymentEvidence> {
  constructor() { super('payment_evidence') }
  protected databaseId(id: string) { return toDatabaseUuid(id) }
  protected toRow(item: PaymentEvidence) {
    return {
      id: toDatabaseUuid(item.id), campaign_id: toDatabaseUuid(item.campaignId), settlement_id: toDatabaseUuid(item.settlementId), payment_request_id: item.paymentRequestId ? toDatabaseUuid(item.paymentRequestId) : null,
      owner_type: item.ownerType, owner_id: toDatabaseUuid(item.ownerId), owner_name: item.ownerName, business_type: item.businessType,
      evidence_type: item.evidenceType, storage_bucket: item.storageBucket, storage_path: item.storagePath,
      original_file_name: item.fileName, mime_type: item.fileType, file_size: item.fileSize,
      review_status: item.reviewStatus, revision: item.revision ?? 1, uploaded_by: item.uploadedBy,
      uploaded_at: item.uploadedAt, reviewed_by: item.reviewedBy, reviewed_at: item.reviewedAt,
      rejection_reason: item.rejectionReason, review_memo: item.reviewMemo, metadata: item,
    }
  }
}
export function createPaymentEvidenceRepository(): DataRepository<PaymentEvidence> {
  return getDataProviderMode() === 'supabase' ? new SupabasePaymentEvidenceRepository() : new LocalPaymentEvidenceRepository()
}
