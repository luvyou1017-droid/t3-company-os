import type { PaymentRequest, PaymentRequestStatus } from '../types/sellerSettlement'
import { validateSellerSettlement } from '../utils/sellerSettlement'
import type { EvidenceOwnerType } from '../types/paymentEvidence'
import type { SellerBusinessType } from '../types/sellerSettlement'
import { calculateWithholding } from '../utils/withholdingTax'
import { duplicateBlockingPaymentStatuses, hasDuplicatePaymentRequest } from '../utils/paymentRequest'
import { campaignService } from './campaignService'
import { paymentEvidenceService } from './paymentEvidenceService'
import { sellerSettlementService } from './sellerSettlementService'
import { salesDataService } from './salesDataService'
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
  sourceVersion?: number
}

type CreatePaymentRequestOptions = { allowEvidencePending?: boolean; memo?: string; accountConfirmed?: boolean }
const editablePaymentRequestStatuses: PaymentRequestStatus[] = ['evidence_pending', 'request_ready', 'approval_pending', 'on_hold']

function validate(input: PaymentRequestValidationInput) {
  const settlement = settlementService.getSettlementById(input.settlementId)
  const reasons: string[] = []
  if (!settlement) {
    reasons.push(input.ownerType === 'seller' ? '셀러 정산 정보를 찾을 수 없습니다.' : '매니저 정산 정보를 찾을 수 없습니다.')
  } else if (!settlementService.isSettlementConfirmed(settlement)) {
    reasons.push('정산서를 먼저 확정해주세요.')
  } else if (input.ownerType === 'manager') {
    const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
    const calculation = settlement.currentCalculation
    const finiteAmounts = [
      calculation.grossCommission, calculation.sellerCommissionAmount,
      calculation.distributableVendorCommission, calculation.managerAmount,
      calculation.managerDeductionTotal,
    ].every(Number.isFinite)
    const commissionRatesValid = Number.isFinite(calculation.totalCommissionRate) && Number.isFinite(calculation.sellerCommissionRate)
      && calculation.totalCommissionRate >= calculation.sellerCommissionRate && calculation.sellerCommissionRate >= 0
    const managerShareValid = Number.isFinite(calculation.managerShareRate) && Number.isFinite(calculation.companyShareRate)
      && calculation.managerShareRate >= 0 && calculation.managerShareRate <= 100
      && Math.abs(calculation.managerShareRate + calculation.companyShareRate - 100) < 0.001
    const managerCalculationReady = salesImport?.reviewStatus === '확정 완료' && finiteAmounts && commissionRatesValid && managerShareValid && calculation.managerAmount >= 0
    if (!managerCalculationReady) reasons.push('매니저 최종 지급액을 계산할 수 없습니다.')
  }
  if (!input.accountConfirmed) reasons.push('지급 계좌가 확인되지 않았습니다.')
  if (!input.calculationCompleted || input.amountConfirmed === false) reasons.push('최종 지급액 계산이 완료되지 않았습니다.')
  if (input.calculationErrors.length) reasons.push('최종 지급액 계산 오류가 있습니다.')
  const duplicate = hasDuplicatePaymentRequest(paymentRequestService.getPaymentRequests(), {
    settlementId: input.settlementId, recipientType: input.ownerType, recipientId: input.ownerId,
    sourceVersion: input.sourceVersion ?? settlement?.settlementVersion ?? 1,
  })
  if (duplicate) reasons.push('이미 지급 요청이 생성되어 있습니다.')
  return { valid: reasons.length === 0, reasons }
}

function save(request: PaymentRequest) {
  storageService.setItem(STORAGE_KEYS.paymentRequests, [request, ...paymentRequestService.getPaymentRequests().filter((item) => item.id !== request.id)])
  campaignService.updatePaymentRequestStatus(request.campaignId, request.recipientType, request.status, request.completedAt)
  settlementService.updatePaymentRequestStatus(request.settlementId, request.recipientType, request.status, request.completedAt)
  return request
}

function transition(id: string, status: PaymentRequestStatus, patch: Partial<PaymentRequest> = {}) {
  const request = paymentRequestService.getPaymentRequestById(id)
  if (!request) throw new Error('요청을 찾을 수 없습니다.')
  return save({ ...request, ...patch, status })
}

function normalizeRequest(request: PaymentRequest): PaymentRequest {
  const campaign = campaignService.getCampaignById(request.campaignId)
  const settlement = settlementService.getSettlementById(request.settlementId)
  const recipientType = request.recipientType ?? request.ownerType ?? 'seller'
  const recipientId = request.recipientId ?? request.ownerId ?? request.sellerId
  const recipientName = request.recipientName ?? request.ownerName ??
    (recipientType === 'manager' ? campaign?.managerName : campaign?.sellerName) ?? recipientId
  return {
    ...request,
    recipientType,
    recipientId,
    recipientName,
    managerId: request.managerId ?? campaign?.managerId ?? '',
    managerName: request.managerName ?? campaign?.managerName ?? '',
    amount: request.amount ?? request.finalPaymentAmount,
    sourceVersion: request.sourceVersion ?? settlement?.settlementVersion ?? 1,
    ownerType: recipientType,
    ownerId: recipientId,
    ownerName: recipientName,
  }
}

export const paymentRequestService = {
  getPaymentRequests() {
    const existing = storageService.getItem<PaymentRequest[]>(STORAGE_KEYS.paymentRequests, [])
    if (existing.length) return existing.map(normalizeRequest)
    const seeded: PaymentRequest[] = sellerSettlementService.getDocuments().map((document, index) => {
      const c = document.calculation
      const direction = document.salesChannelType === 'seller_checkout' ? 'seller_to_company' as const : 'company_to_seller' as const
      const statuses: PaymentRequestStatus[] = ['approval_pending', 'sent', 'evidence_pending']
      return {
        id: `payment-request-${document.settlementId}`, campaignId: document.campaignId, settlementId: document.settlementId,
        sellerId: document.sellerId, recipientType: 'seller', recipientId: document.sellerId, recipientName: document.sellerName,
        managerId: campaignService.getCampaignById(document.campaignId)?.managerId ?? '',
        managerName: campaignService.getCampaignById(document.campaignId)?.managerName ?? '',
        amount: c.finalSellerPaymentAmount, sourceVersion: settlementService.getSettlementById(document.settlementId)?.settlementVersion ?? 1,
        direction, salesChannelType: document.salesChannelType,
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
  canEditPaymentRequest(request: PaymentRequest) { return editablePaymentRequestStatuses.includes(request.status) },
  updatePaymentRequest(id: string, patch: Pick<PaymentRequest, 'memo' | 'accountConfirmed' | 'evidenceStatus'>) {
    const request = this.getPaymentRequestById(id)
    if (!request) throw new Error('지급 요청을 찾을 수 없습니다.')
    if (!this.canEditPaymentRequest(request)) {
      if (request.status === 'payment_completed' || request.status === 'remittance_confirmed') throw new Error('이미 지급 완료된 건입니다.')
      throw new Error('이미 대표 승인이 완료되어 지급요청을 수정할 수 없습니다.')
    }
    return save({ ...request, ...patch })
  },
  getPaymentRequestForRecipient(settlementId: string, recipientType: EvidenceOwnerType, recipientId: string, sourceVersion: number) {
    return this.getPaymentRequests().find((request) =>
      request.settlementId === settlementId && request.recipientType === recipientType &&
      request.recipientId === recipientId && request.sourceVersion === sourceVersion &&
      duplicateBlockingPaymentStatuses.includes(request.status))
  },
  validateSellerPaymentRequest(input: Omit<PaymentRequestValidationInput, 'ownerType'>) {
    return validate({ ...input, ownerType: 'seller' })
  },
  validateManagerPaymentRequest(input: Omit<PaymentRequestValidationInput, 'ownerType'>) {
    return validate({ ...input, ownerType: 'manager' })
  },
  canCreatePaymentRequest(input: PaymentRequestValidationInput) { return validate(input).valid },
  getPaymentRequestBlockReasons(input: PaymentRequestValidationInput) { return validate(input).reasons },
  createPaymentRequest(settlementId: string, requestedBy: string, options: CreatePaymentRequestOptions = {}) {
    const document = sellerSettlementService.getDocumentBySettlementId(settlementId) ?? sellerSettlementService.createSellerDocument(settlementId)
    const rule = sellerSettlementService.getSellerSettlementRule(document.campaignId)
    if (!rule) throw new Error('셀러 정산 규칙이 없습니다.')
    const validation = validateSellerSettlement(rule, document.calculation)
    if (!validation.valid) throw new Error(validation.errors.join('\n'))
    const requestValidation = validate({
      settlementId, ownerType: 'seller', ownerId: document.sellerId, businessType: rule.businessType,
      evidenceTypeConfirmed: rule.evidenceConfirmed && Boolean(rule.confirmedEvidenceType),
      accountConfirmed: options.accountConfirmed ?? settlementService.getSettlementById(settlementId)?.accountConfirmed ?? false,
      calculationCompleted: true, calculationErrors: validation.errors, amountConfirmed: true,
      sourceVersion: settlementService.getSettlementById(settlementId)?.settlementVersion,
    })
    const blockingReasons = options.allowEvidencePending
      ? requestValidation.reasons.filter((reason) => reason !== '증빙 검수가 완료되지 않았습니다.')
      : requestValidation.reasons
    if (blockingReasons.length) throw new Error(blockingReasons.join('\n'))
    const c = document.calculation
    const withholding = calculateWithholding(c.sellerGrossSettlementAmount, c.sellerDeductions)
    let taxItem
    if (rule.businessType === 'freelancer') {
      try {
        taxItem = withholdingTaxService.upsert({
          settlementId, ownerType: 'seller', ownerId: document.sellerId, ownerName: document.sellerName,
          grossSettlementAmount: c.sellerGrossSettlementAmount, deductions: c.sellerDeductions,
          sourceVersion: settlementService.getSettlementById(settlementId)?.settlementVersion ?? 1, updatedBy: requestedBy,
        })
      } catch { throw new Error('원천세 등록에 실패했습니다. 지급 요청은 생성되지 않았습니다.') }
      if (!taxItem) throw new Error('원천세 등록에 실패했습니다. 지급 요청은 생성되지 않았습니다.')
    }
    const request = save({
      id: `payment-request-${crypto.randomUUID()}`, campaignId: document.campaignId, settlementId,
      sellerId: document.sellerId, direction: document.salesChannelType === 'seller_checkout' ? 'seller_to_company' : 'company_to_seller',
      recipientType: 'seller', recipientId: document.sellerId, recipientName: document.sellerName,
      managerId: campaignService.getCampaignById(document.campaignId)?.managerId ?? '',
      managerName: campaignService.getCampaignById(document.campaignId)?.managerName ?? '',
      amount: c.finalSellerPaymentAmount, sourceVersion: settlementService.getSettlementById(settlementId)?.settlementVersion ?? 1,
      ownerType: 'seller', ownerId: document.sellerId, ownerName: document.sellerName,
      salesChannelType: document.salesChannelType, businessType: document.businessType, evidenceType: document.evidenceType,
      grossSettlementAmount: c.sellerGrossSettlementAmount, vatExcludedAmount: c.vatExcludedAmount,
      withholdingBaseAmount: c.withholdingBaseAmount, withholdingTaxAmount: c.withholdingTaxAmount,
      incomeTaxAmount: rule.businessType === 'freelancer' ? withholding.incomeTaxAmount : 0,
      localIncomeTaxAmount: rule.businessType === 'freelancer' ? withholding.localIncomeTaxAmount : 0,
      deductions: c.sellerDeductions, finalPaymentAmount: c.finalSellerPaymentAmount,
      sellerRemittanceToCompany: c.sellerRemittanceToCompany, evidenceStatus: options.allowEvidencePending ? 'pending' : 'confirmed', accountConfirmed: true,
      requestedBy, requestedAt: now(), dueDate: document.dueDate,
      status: options.allowEvidencePending ? 'evidence_pending' : rule.businessType === 'freelancer' ? 'approval_pending' : document.salesChannelType === 'seller_checkout' ? 'request_ready' : 'approval_pending', memo: options.memo?.trim() ?? '',
    })
    paymentEvidenceService.linkToPaymentRequest(settlementId, 'seller', request.id)
    if (taxItem) {
      request.withholdingTaxItemId = taxItem.id
      withholdingTaxService.linkPaymentRequest(taxItem.id, request.id)
      save(request)
    }
    return request
  },
  createManagerPaymentRequest(settlementId: string, requestedBy = '허수정', businessType: SellerBusinessType = 'simplified_business', batchRequestId?: string, options: CreatePaymentRequestOptions = {}) {
    const settlement = settlementService.getSettlementById(settlementId)
    if (!settlement) throw new Error('정산을 찾을 수 없습니다.')
    const campaign = campaignService.getCampaignById(settlement.campaignId)
    const rule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
    if (!rule || !campaign) throw new Error('캠페인 또는 정산 규칙이 없습니다.')
    const managerId = campaign.managerId
    const managerName = campaign.managerName
    const validation = validate({
      settlementId, ownerType: 'manager', ownerId: managerId, businessType,
      evidenceTypeConfirmed: true, accountConfirmed: options.accountConfirmed ?? settlement.accountConfirmed,
      calculationCompleted: true, calculationErrors: [], amountConfirmed: settlement.currentCalculation.managerAmount >= 0,
      sourceVersion: settlement.settlementVersion,
    })
    const blockingReasons = options.allowEvidencePending
      ? validation.reasons.filter((reason) => reason !== '증빙 검수가 완료되지 않았습니다.')
      : validation.reasons
    if (blockingReasons.length) throw new Error(blockingReasons.join('\n'))
    const deductions = settlement.currentCalculation.managerDeductionTotal
    const gross = settlement.currentCalculation.managerAmount + deductions
    const tax = calculateWithholding(gross, deductions)
    let taxItem
    if (businessType === 'freelancer') {
      try {
        taxItem = withholdingTaxService.upsert({
          settlementId, ownerType: 'manager', ownerId: managerId, ownerName: managerName,
          grossSettlementAmount: gross, deductions, sourceVersion: settlement.settlementVersion, updatedBy: requestedBy,
        })
      } catch { throw new Error('원천세 등록에 실패했습니다. 지급 요청은 생성되지 않았습니다.') }
      if (!taxItem) throw new Error('원천세 등록에 실패했습니다. 지급 요청은 생성되지 않았습니다.')
    }
    const vatExcluded = Math.round(gross / 1.1)
    const finalPaymentAmount = businessType === 'freelancer' ? tax.finalPaymentAmount
      : businessType === 'simplified_business' ? vatExcluded - deductions : gross - deductions
    const request = save({
      id: `payment-request-${crypto.randomUUID()}`, campaignId: settlement.campaignId, settlementId,
      sellerId: managerId, ownerType: 'manager', ownerId: managerId, ownerName: managerName,
      recipientType: 'manager', recipientId: managerId, recipientName: managerName, managerId, managerName,
      amount: finalPaymentAmount, sourceVersion: settlement.settlementVersion, batchRequestId,
      direction: 'company_to_seller', salesChannelType: rule.salesChannelType, businessType,
      evidenceType: businessType === 'freelancer' ? 'withholding_3_3' : businessType === 'simplified_business' ? 'cash_receipt' : 'tax_invoice',
      grossSettlementAmount: gross, vatExcludedAmount: vatExcluded,
      withholdingBaseAmount: businessType === 'freelancer' ? tax.withholdingBaseAmount : 0,
      withholdingTaxAmount: businessType === 'freelancer' ? tax.totalWithholdingTaxAmount : 0,
      incomeTaxAmount: businessType === 'freelancer' ? tax.incomeTaxAmount : 0,
      localIncomeTaxAmount: businessType === 'freelancer' ? tax.localIncomeTaxAmount : 0,
      deductions, finalPaymentAmount, sellerRemittanceToCompany: 0, evidenceStatus: options.allowEvidencePending ? 'pending' : 'confirmed',
      accountConfirmed: options.accountConfirmed ?? settlement.accountConfirmed, requestedBy, requestedAt: now(), dueDate: settlement.paymentDueDate,
      status: options.allowEvidencePending ? 'evidence_pending' : 'approval_pending', memo: options.memo?.trim() || '매니저 지급 요청',
    })
    paymentEvidenceService.linkToPaymentRequest(settlementId, 'manager', request.id)
    if (taxItem) {
      request.withholdingTaxItemId = taxItem.id
      withholdingTaxService.linkPaymentRequest(taxItem.id, request.id)
      save(request)
    }
    return request
  },
  requestApproval(id: string) { return transition(id, 'approval_pending') },
  approvePaymentRequest(id: string, approvedBy = '대표 김승인') { return transition(id, 'approved', { approvedBy, approvedAt: now() }) },
  markPaymentCompleted(id: string, completedBy = '허수정') {
    const current = this.getPaymentRequestById(id)
    if (!current || current.status !== 'approved') throw new Error('대표 승인 완료 후에만 지급 완료 처리할 수 있습니다.')
    const request = transition(id, 'payment_completed', { completedBy, completedAt: now() })
    if (request.recipientType === 'seller') settlementService.markSellerPaymentCompleted(request.settlementId)
    else settlementService.markManagerPaymentCompleted(request.settlementId)
    return request
  },
  markSellerRemittanceConfirmed(id: string, completedBy = '허수정') {
    const request = transition(id, 'remittance_confirmed', { completedBy, completedAt: now() })
    settlementService.markSellerPaymentCompleted(request.settlementId)
    return request
  },
  rejectPaymentRequest(id: string, memo: string) { return transition(id, 'rejected', { memo }) },
  holdPaymentRequest(id: string, memo: string) { return transition(id, 'on_hold', { memo }) },
}
