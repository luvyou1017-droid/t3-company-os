import type { PaymentRecipientType, PaymentRequest, PaymentRequestStatus } from '../types/sellerSettlement'

export const duplicateBlockingPaymentStatuses: PaymentRequestStatus[] = [
  'evidence_pending', 'request_ready', 'approval_pending', 'approved', 'sent', 'payment_completed', 'remittance_confirmed', 'on_hold',
]

export function hasDuplicatePaymentRequest(
  requests: PaymentRequest[],
  key: { settlementId: string; recipientType: PaymentRecipientType; recipientId: string; sourceVersion: number },
) {
  return requests.some((request) =>
    request.settlementId === key.settlementId &&
    request.recipientType === key.recipientType &&
    request.recipientId === key.recipientId &&
    duplicateBlockingPaymentStatuses.includes(request.status))
}
