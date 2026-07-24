import type { PaymentRequest, PaymentRequestStatus } from '../types/sellerSettlement'
import { validateSellerSettlement } from '../utils/sellerSettlement'
import { sellerSettlementService } from './sellerSettlementService'
import { STORAGE_KEYS, storageService } from './storageService'

const now = () => new Date().toISOString()

function save(request: PaymentRequest) {
  storageService.setItem(STORAGE_KEYS.paymentRequests, [request, ...paymentRequestService.getPaymentRequests().filter((item) => item.id !== request.id)])
  return request
}

function transition(id: string, status: PaymentRequestStatus, patch: Partial<PaymentRequest> = {}) {
  const request = paymentRequestService.getPaymentRequestById(id)
  if (!request) throw new Error('요청을 찾을 수 없습니다.')
  return save({ ...request, ...patch, status })
}

export const paymentRequestService = {
  getPaymentRequests() {
    const existing = storageService.getItem<PaymentRequest[]>(STORAGE_KEYS.paymentRequests, [])
    if (existing.length) return existing
    const seeded = sellerSettlementService.getDocuments().map((document, index) => {
      const c = document.calculation
      const direction = document.salesChannelType === 'seller_checkout' ? 'seller_to_company' as const : 'company_to_seller' as const
      const statuses: PaymentRequestStatus[] = ['approval_pending', 'sent', 'evidence_pending']
      return {
        id: `payment-request-${document.settlementId}`, campaignId: document.campaignId, settlementId: document.settlementId,
        sellerId: document.sellerId, direction, salesChannelType: document.salesChannelType,
        businessType: document.businessType, evidenceType: document.evidenceType,
        grossSettlementAmount: c.sellerGrossSettlementAmount, vatExcludedAmount: c.vatExcludedAmount,
        withholdingBaseAmount: c.withholdingBaseAmount, withholdingTaxAmount: c.withholdingTaxAmount,
        deductions: c.sellerDeductions, finalPaymentAmount: c.finalSellerPaymentAmount,
        sellerRemittanceToCompany: c.sellerRemittanceToCompany, evidenceStatus: index === 2 ? 'pending' as const : 'confirmed' as const,
        accountConfirmed: true, requestedBy: '허수정', requestedAt: '2026-07-19T09:00:00.000Z',
        dueDate: document.dueDate, status: statuses[index % statuses.length], memo: 'MVP mock 요청',
      }
    })
    storageService.setItem(STORAGE_KEYS.paymentRequests, seeded)
    return seeded
  },
  getPaymentRequestById(id: string) { return this.getPaymentRequests().find((item) => item.id === id) },
  createPaymentRequest(settlementId: string, requestedBy: string) {
    const document = sellerSettlementService.getDocumentBySettlementId(settlementId) ?? sellerSettlementService.createSellerDocument(settlementId)
    const rule = sellerSettlementService.getSellerSettlementRule(document.campaignId)
    if (!rule) throw new Error('셀러 정산 규칙이 없습니다.')
    const validation = validateSellerSettlement(rule, document.calculation)
    if (!validation.valid) throw new Error(validation.errors.join('\n'))
    const c = document.calculation
    return save({
      id: `payment-request-${crypto.randomUUID()}`, campaignId: document.campaignId, settlementId,
      sellerId: document.sellerId, direction: document.salesChannelType === 'seller_checkout' ? 'seller_to_company' : 'company_to_seller',
      salesChannelType: document.salesChannelType, businessType: document.businessType, evidenceType: document.evidenceType,
      grossSettlementAmount: c.sellerGrossSettlementAmount, vatExcludedAmount: c.vatExcludedAmount,
      withholdingBaseAmount: c.withholdingBaseAmount, withholdingTaxAmount: c.withholdingTaxAmount,
      deductions: c.sellerDeductions, finalPaymentAmount: c.finalSellerPaymentAmount,
      sellerRemittanceToCompany: c.sellerRemittanceToCompany, evidenceStatus: 'confirmed', accountConfirmed: true,
      requestedBy, requestedAt: now(), dueDate: document.dueDate,
      status: document.salesChannelType === 'seller_checkout' ? 'request_ready' : 'approval_pending', memo: '',
    })
  },
  requestApproval(id: string) { return transition(id, 'approval_pending') },
  approvePaymentRequest(id: string, approvedBy = '대표 김승인') { return transition(id, 'approved', { approvedBy, approvedAt: now() }) },
  markPaymentCompleted(id: string, completedBy = '허수정') { return transition(id, 'payment_completed', { completedBy, completedAt: now() }) },
  markSellerRemittanceConfirmed(id: string, completedBy = '허수정') { return transition(id, 'remittance_confirmed', { completedBy, completedAt: now() }) },
  rejectPaymentRequest(id: string, memo: string) { return transition(id, 'rejected', { memo }) },
  holdPaymentRequest(id: string, memo: string) { return transition(id, 'on_hold', { memo }) },
}
