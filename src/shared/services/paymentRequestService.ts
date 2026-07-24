import type { PaymentRequest, PaymentRequestStatus } from '../types/sellerSettlement'
import { validateSellerSettlement } from '../utils/sellerSettlement'
import type { EvidenceOwnerType } from '../types/paymentEvidence'
import type { SellerBusinessType } from '../types/sellerSettlement'
import { calculateWithholding } from '../utils/withholdingTax'
import { campaignService } from './campaignService'
import { paymentEvidenceService } from './paymentEvidenceService'
import { sellerSettlementService } from './sellerSettlementService'
import { settlementService } from './settlementService'
import { STORAGE_KEYS, storageService } from './storageService'
import { withholdingTaxService } from './withholdingTaxService'

const now = () => new Date().toISOString()

export type PaymentRequestValidationInput = {
  settlementId: string
  ownerType: EvidenceOwnerType
  ownerId: string
  businessType: SellerBusinessType
  evidenceTypeConfirmed: boolean
  accountConfirmed: boolean
  calculationCompleted: boolean
  calculationErrors: string[]
  amountConfirmed?: boolean
}

function validate(input: PaymentRequestValidationInput) {
  const settlement = settlementService.getSettlementById(input.settlementId)
  const withholding = withholdingTaxService.getBySettlementOwner(input.settlementId, input.ownerType, input.ownerId)
    .some((item) => item.status !== 'canceled')
  const reasons: string[] = []
  if (!settlement || !['approved', 'payment_ready', 'partially_paid', 'completed'].includes(settlement.status)) {
    reasons.push(input.ownerType === 'seller' ? '정산서가 확정되지 않았습니다.' : '매니저 정산금액이 확정되지 않았습니다.')
  }
  if (!input.evidenceTypeConfirmed) reasons.push('증빙 유형이 확인되지 않았습니다.')
  reasons.push(...paymentEvidenceService.getMissingEvidenceReasons(input.settlementId, input.ownerType, input.businessType, withholding))
  if (!input.accountConfirmed) reasons.push('지급 계좌가 확인되지 않았습니다.')
  if (!input.calculationCompleted || input.amountConfirmed === false) reasons.push('최종 지급액 계산이 완료되지 않았습니다.')
  if (input.calculationErrors.length) reasons.push('최종 지급액 계산 오류가 있습니다.')
  return { valid: reasons.length === 0, reasons }
}

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
    const seeded: PaymentRequest[] = sellerSettlementService.getDocuments().map((document, index) => {
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
  validateSellerPaymentRequest(input: Omit<PaymentRequestValidationInput, 'ownerType'>) {
    return validate({ ...input, ownerType: 'seller' })
  },
  validateManagerPaymentRequest(input: Omit<PaymentRequestValidationInput, 'ownerType'>) {
    return validate({ ...input, ownerType: 'manager' })
  },
  canCreatePaymentRequest(input: PaymentRequestValidationInput) { return validate(input).valid },
  getPaymentRequestBlockReasons(input: PaymentRequestValidationInput) { return validate(input).reasons },
  createPaymentRequest(settlementId: string, requestedBy: string) {
    const document = sellerSettlementService.getDocumentBySettlementId(settlementId) ?? sellerSettlementService.createSellerDocument(settlementId)
    const rule = sellerSettlementService.getSellerSettlementRule(document.campaignId)
    if (!rule) throw new Error('셀러 정산 규칙이 없습니다.')
    const validation = validateSellerSettlement(rule, document.calculation)
    if (!validation.valid) throw new Error(validation.errors.join('\n'))
    withholdingTaxService.syncFromConfirmedSettlements()
    const requestValidation = validate({
      settlementId, ownerType: 'seller', ownerId: document.sellerId, businessType: rule.businessType,
      evidenceTypeConfirmed: rule.evidenceConfirmed && Boolean(rule.confirmedEvidenceType),
      accountConfirmed: settlementService.getSettlementById(settlementId)?.accountConfirmed ?? false,
      calculationCompleted: true, calculationErrors: validation.errors, amountConfirmed: true,
    })
    if (!requestValidation.valid) throw new Error(requestValidation.reasons.join('\n'))
    const c = document.calculation
    const withholding = calculateWithholding(c.sellerGrossSettlementAmount, c.sellerDeductions)
    const request = save({
      id: `payment-request-${crypto.randomUUID()}`, campaignId: document.campaignId, settlementId,
      sellerId: document.sellerId, direction: document.salesChannelType === 'seller_checkout' ? 'seller_to_company' : 'company_to_seller',
      ownerType: 'seller', ownerId: document.sellerId, ownerName: document.sellerName,
      salesChannelType: document.salesChannelType, businessType: document.businessType, evidenceType: document.evidenceType,
      grossSettlementAmount: c.sellerGrossSettlementAmount, vatExcludedAmount: c.vatExcludedAmount,
      withholdingBaseAmount: c.withholdingBaseAmount, withholdingTaxAmount: c.withholdingTaxAmount,
      incomeTaxAmount: rule.businessType === 'freelancer' ? withholding.incomeTaxAmount : 0,
      localIncomeTaxAmount: rule.businessType === 'freelancer' ? withholding.localIncomeTaxAmount : 0,
      deductions: c.sellerDeductions, finalPaymentAmount: c.finalSellerPaymentAmount,
      sellerRemittanceToCompany: c.sellerRemittanceToCompany, evidenceStatus: 'confirmed', accountConfirmed: true,
      requestedBy, requestedAt: now(), dueDate: document.dueDate,
      status: document.salesChannelType === 'seller_checkout' ? 'request_ready' : 'approval_pending', memo: '',
    })
    paymentEvidenceService.linkToPaymentRequest(settlementId, 'seller', request.id)
    const taxItem = withholdingTaxService.getBySettlementOwner(settlementId, 'seller', document.sellerId)
      .find((item) => item.sourceVersion === (settlementService.getSettlementById(settlementId)?.settlementVersion ?? 1))
    if (taxItem) withholdingTaxService.linkPaymentRequest(taxItem.id, request.id)
    return request
  },
  createManagerPaymentRequest(settlementId: string, requestedBy = '허수정', businessType: SellerBusinessType = 'simplified_business') {
    const settlement = settlementService.getSettlementById(settlementId)
    if (!settlement) throw new Error('정산을 찾을 수 없습니다.')
    const campaign = campaignService.getCampaignById(settlement.campaignId)
    const rule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
    if (!rule || !campaign) throw new Error('캠페인 또는 정산 규칙이 없습니다.')
    const managerId = campaign.managerId
    const managerName = campaign.managerName
    const validation = validate({
      settlementId, ownerType: 'manager', ownerId: managerId, businessType,
      evidenceTypeConfirmed: true, accountConfirmed: settlement.accountConfirmed,
      calculationCompleted: true, calculationErrors: [], amountConfirmed: settlement.currentCalculation.managerAmount >= 0,
    })
    if (!validation.valid) throw new Error(validation.reasons.join('\n'))
    const gross = settlement.currentCalculation.managerAmount
    const deductions = settlement.currentCalculation.managerDeductionTotal
    const tax = calculateWithholding(gross, deductions)
    const vatExcluded = Math.round(gross / 1.1)
    const finalPaymentAmount = businessType === 'freelancer' ? tax.finalPaymentAmount
      : businessType === 'simplified_business' ? vatExcluded - deductions : gross - deductions
    const request = save({
      id: `payment-request-${crypto.randomUUID()}`, campaignId: settlement.campaignId, settlementId,
      sellerId: managerId, ownerType: 'manager', ownerId: managerId, ownerName: managerName,
      direction: 'company_to_seller', salesChannelType: rule.salesChannelType, businessType,
      evidenceType: businessType === 'freelancer' ? 'withholding_3_3' : businessType === 'simplified_business' ? 'cash_receipt' : 'tax_invoice',
      grossSettlementAmount: gross, vatExcludedAmount: vatExcluded,
      withholdingBaseAmount: businessType === 'freelancer' ? tax.withholdingBaseAmount : 0,
      withholdingTaxAmount: businessType === 'freelancer' ? tax.totalWithholdingTaxAmount : 0,
      incomeTaxAmount: businessType === 'freelancer' ? tax.incomeTaxAmount : 0,
      localIncomeTaxAmount: businessType === 'freelancer' ? tax.localIncomeTaxAmount : 0,
      deductions, finalPaymentAmount, sellerRemittanceToCompany: 0, evidenceStatus: 'confirmed',
      accountConfirmed: settlement.accountConfirmed, requestedBy, requestedAt: now(), dueDate: settlement.paymentDueDate,
      status: 'approval_pending', memo: '매니저 지급 요청',
    })
    paymentEvidenceService.linkToPaymentRequest(settlementId, 'manager', request.id)
    const taxItem = withholdingTaxService.getBySettlementOwner(settlementId, 'manager', managerId)
      .find((item) => item.sourceVersion === settlement.settlementVersion)
    if (taxItem) withholdingTaxService.linkPaymentRequest(taxItem.id, request.id)
    return request
  },
  requestApproval(id: string) { return transition(id, 'approval_pending') },
  approvePaymentRequest(id: string, approvedBy = '대표 김승인') { return transition(id, 'approved', { approvedBy, approvedAt: now() }) },
  markPaymentCompleted(id: string, completedBy = '허수정') { return transition(id, 'payment_completed', { completedBy, completedAt: now() }) },
  markSellerRemittanceConfirmed(id: string, completedBy = '허수정') { return transition(id, 'remittance_confirmed', { completedBy, completedAt: now() }) },
  rejectPaymentRequest(id: string, memo: string) { return transition(id, 'rejected', { memo }) },
  holdPaymentRequest(id: string, memo: string) { return transition(id, 'on_hold', { memo }) },
}
