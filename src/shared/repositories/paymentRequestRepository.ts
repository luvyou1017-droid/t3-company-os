import type { PaymentRequest } from '../types/sellerSettlement'
import { getDataProviderMode } from '../lib/dataProvider'
import { STORAGE_KEYS, storageService } from '../services/storageService'
import { LocalRepository, SupabaseRepository, type DataRepository } from './baseRepository'
import { toDatabaseUuid } from '../utils/databaseId'

export class LocalPaymentRequestRepository extends LocalRepository<PaymentRequest> {
  constructor() { super(() => storageService.getItem<PaymentRequest[]>(STORAGE_KEYS.paymentRequests, []), (items) => storageService.setItem(STORAGE_KEYS.paymentRequests, items)) }
}
export class SupabasePaymentRequestRepository extends SupabaseRepository<PaymentRequest> {
  constructor() { super('payment_requests') }
  protected databaseId(id: string) { return toDatabaseUuid(id) }
  protected toRow(item: PaymentRequest) {
    return {
      id: toDatabaseUuid(item.id), campaign_id: toDatabaseUuid(item.campaignId), settlement_id: toDatabaseUuid(item.settlementId), recipient_type: item.recipientType,
      recipient_id: toDatabaseUuid(item.recipientId), recipient_name: item.recipientName, direction: item.direction, amount: item.amount,
      gross_amount: item.grossSettlementAmount, income_tax_amount: item.incomeTaxAmount, local_income_tax_amount: item.localIncomeTaxAmount,
      withholding_tax_amount: item.withholdingTaxAmount, final_amount: item.finalPaymentAmount, evidence_type: item.evidenceType,
      evidence_status: item.evidenceStatus, account_confirmed: item.accountConfirmed, status: item.status,
      batch_request_id: item.batchRequestId ? toDatabaseUuid(item.batchRequestId) : null, source_version: item.sourceVersion, requested_by: item.requestedBy,
      requested_at: item.requestedAt, approved_by: item.approvedBy, approved_at: item.approvedAt,
      completed_by: item.completedBy, completed_at: item.completedAt, memo: item.memo, metadata: this.metadata(item),
    }
  }
}
export function createPaymentRequestRepository(): DataRepository<PaymentRequest> {
  return getDataProviderMode() === 'supabase' ? new SupabasePaymentRequestRepository() : new LocalPaymentRequestRepository()
}
