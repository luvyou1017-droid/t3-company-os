class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}

globalThis.localStorage = new MemoryStorage()

const { createServer } = await import('vite')
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { sellerMasterService } = await vite.ssrLoadModule('/src/shared/services/sellerMasterService.ts')
const { sellerSettlementService } = await vite.ssrLoadModule('/src/shared/services/sellerSettlementService.ts')
const { managerPaymentService } = await vite.ssrLoadModule('/src/shared/services/managerPaymentService.ts')
const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
const { salesDataService } = await vite.ssrLoadModule('/src/shared/services/salesDataService.ts')
const { paymentRequestService } = await vite.ssrLoadModule('/src/shared/services/paymentRequestService.ts')
const { withholdingTaxService } = await vite.ssrLoadModule('/src/shared/services/withholdingTaxService.ts')
const { calculateWithholding } = await vite.ssrLoadModule('/src/shared/utils/withholdingTax.ts')
const { calculateManagerProductRow } = await vite.ssrLoadModule('/src/shared/utils/settlementDocument.ts')
const { getRecommendedEvidenceType, normalizeSellerBusinessType } = await vite.ssrLoadModule('/src/shared/utils/sellerSettlement.ts')
const { STORAGE_KEYS, storageService } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
const { sensitiveIdentityService } = await vite.ssrLoadModule('/src/shared/services/sensitiveIdentityService.ts')
const { campaignEventOperationService } = await vite.ssrLoadModule('/src/shared/services/campaignEventOperationService.ts')
const { campaignService } = await vite.ssrLoadModule('/src/shared/services/campaignService.ts')
const { canEditSettlement } = await vite.ssrLoadModule('/src/shared/data/users.ts')

const transientResidentNumber = ['900101', '1', '234567'].join('')
sensitiveIdentityService.stage('seller', 'seller-sensitive-test', transientResidentNumber)
const maskedResidentNumber = sensitiveIdentityService.getMasked('seller', 'seller-sensitive-test')
const persistedClientData = [...globalThis.localStorage.data.values()].join('')

const sellerSaved = sellerMasterService.saveSellerProfile({
  id: 'seller-SCH-005', name: '헬시윤', businessName: '(주)헬시윤', businessType: 'simplified_business',
  defaultMdId: 'md-SCH-005', defaultManagerId: 'u-001', bankName: '국민은행', accountNumber: '123-456', accountHolder: '(주)헬시윤',
})
const sellerRead = sellerMasterService.getSellerById('seller-SCH-005')
storageService.setItem(STORAGE_KEYS.sellerSettlementRules, sellerSettlementService.getRules().filter((rule) => rule.campaignId !== 'SCH-009'))
sellerMasterService.saveSellerProfile({ id: 'seller-SCH-009', name: '라이프지수', businessName: '(주)라이프지수', businessType: 'general_business', defaultMdId: 'md-SCH-009', defaultManagerId: 'u-001', bankName: '신한은행', accountNumber: '111-222-333333', accountHolder: '(주)라이프지수' })
const premiumRule = sellerSettlementService.ensureSellerSettlementRule('SCH-009')
const premiumBusinessType = normalizeSellerBusinessType(sellerMasterService.getSellerById('seller-SCH-009')?.businessType)
const premiumEvidenceType = getRecommendedEvidenceType(premiumBusinessType)
sellerSettlementService.saveRule({ ...premiumRule, businessType: premiumBusinessType, recommendedEvidenceType: premiumEvidenceType, confirmedEvidenceType: premiumEvidenceType, evidenceConfirmed: true })
const refreshedPremiumRule = sellerSettlementService.getSellerSettlementRule('SCH-009')
const manager = managerPaymentService.getProfile('u-001')
const premiumSettlement = settlementService.getSettlements().find((item) => item.campaignId === 'SCH-009')
  ?? settlementService.createSettlementFromSalesData('sales-009', 'review_pending')
const healthSettlement = settlementService.getSettlements().find((item) => item.campaignId === 'SCH-005')
if (!premiumSettlement || !healthSettlement) throw new Error('정산 더미데이터가 없습니다.')

const revisionTestSettlement = { ...healthSettlement, id: `${healthSettlement.id}-revision-test`, status: 'revision_required', settlementConfirmed: false, sourceChangeReason: '이벤트비 수정 테스트', sellerPaymentRequestStatus: undefined, managerPaymentRequestStatus: undefined }
const revisionTestDeductions = settlementService.getDeductionsBySettlementId(healthSettlement.id).map((item) => ({ ...item, id: `${item.id}-revision-test`, settlementId: revisionTestSettlement.id }))
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), revisionTestSettlement])
storageService.setItem(STORAGE_KEYS.settlementDeductions, [...settlementService.getDeductions(), ...revisionTestDeductions])
const revisionDraft = { settlementId: revisionTestSettlement.id, reason: '이벤트 확정비 반영', rows: salesDataService.getRowsByImportId(revisionTestSettlement.salesDataImportId), totalCommissionRate: revisionTestSettlement.currentCalculation.totalCommissionRate, sellerCommissionRate: revisionTestSettlement.currentCalculation.sellerCommissionRate, deductions: revisionTestDeductions.map((item, index) => index === 0 ? { ...item, amount: item.amount + 1_000 } : item) }
const revisionPreview = settlementService.previewRevision(revisionDraft, '허수정')
const skuRevisionDraft = { ...revisionDraft, rows: revisionDraft.rows.map((row, index) => ({ ...row, totalCommissionRate: index === 0 ? 24 : revisionDraft.totalCommissionRate, sellerCommissionRate: revisionDraft.sellerCommissionRate })) }
const skuRevisionPreview = settlementService.previewRevision(skuRevisionDraft, '허수정')
const revisionSaved = settlementService.saveRevision(revisionDraft, '허수정', '정산 담당자')
const savedRevisionVersion = settlementService.getSettlementVersionsBySettlementId(revisionTestSettlement.id)[0]
const expectedSkuGrossCommission = skuRevisionDraft.rows.reduce((sum, row) => sum + Math.round(row.quantity * row.unitPrice * row.totalCommissionRate / 100), 0)
const revisionPermissionBlocked = (() => { try { settlementService.saveRevision(revisionDraft, '허윤정', '대표'); return false } catch (error) { return error instanceof Error && error.message.includes('수정 권한') } })()

const revisionWorkflowSettlement = { ...healthSettlement, id: `${healthSettlement.id}-revision-workflow`, status: 'review_pending', settlementConfirmed: false, sourceChangeReason: undefined, sellerPaymentRequestStatus: undefined, managerPaymentRequestStatus: undefined }
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), revisionWorkflowSettlement])
const revisionWorkflowRequested = settlementService.requestRevision(revisionWorkflowSettlement.id, '판매수량 확인', '허수정')
let revisionWorkflowRequest = settlementService.getPendingRevisionRequest(revisionWorkflowSettlement.id)
const revisionWorkflowUpdated = settlementService.updateRevisionRequest(revisionWorkflowRequest.id, '판매수량과 수수료율 확인', '허수정')
const revisionWorkflowCancelled = settlementService.cancelRevisionRequest(revisionWorkflowRequest.id, '허수정')
const revisionWorkflowAfterCancel = settlementService.getSettlementById(revisionWorkflowSettlement.id)

const rejectedWorkflowSettlement = { ...revisionWorkflowSettlement, id: `${healthSettlement.id}-revision-rejected` }
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), rejectedWorkflowSettlement])
settlementService.requestRevision(rejectedWorkflowSettlement.id, '이벤트비 확인', '요청자')
const rejectedWorkflowRequest = settlementService.getPendingRevisionRequest(rejectedWorkflowSettlement.id)
const revisionWorkflowRejected = settlementService.rejectRevisionRequest(rejectedWorkflowRequest.id, '기존 계산이 맞음', '허수정', '정산 담당자')
const rejectedWorkflowState = settlementService.getSettlementById(rejectedWorkflowSettlement.id)

const resolvedWorkflowSettlement = { ...revisionWorkflowSettlement, id: `${healthSettlement.id}-revision-resolved` }
const resolvedWorkflowDeductions = settlementService.getDeductionsBySettlementId(healthSettlement.id).map((item) => ({ ...item, id: `${item.id}-resolved`, settlementId: resolvedWorkflowSettlement.id }))
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), resolvedWorkflowSettlement])
storageService.setItem(STORAGE_KEYS.settlementDeductions, [...settlementService.getDeductions(), ...resolvedWorkflowDeductions])
settlementService.requestRevision(resolvedWorkflowSettlement.id, '정산 반영 요청', '요청자')
const resolvedDraft = { settlementId: resolvedWorkflowSettlement.id, reason: '정산 반영 완료', rows: salesDataService.getRowsByImportId(resolvedWorkflowSettlement.salesDataImportId), totalCommissionRate: resolvedWorkflowSettlement.currentCalculation.totalCommissionRate, sellerCommissionRate: resolvedWorkflowSettlement.currentCalculation.sellerCommissionRate, deductions: resolvedWorkflowDeductions }
settlementService.saveRevision(resolvedDraft, '허수정', '정산 담당자')
const revisionWorkflowResolved = settlementService.getRevisionRequestsBySettlementId(resolvedWorkflowSettlement.id)[0]

const directEvent = campaignEventOperationService.save({ id: 'event-direct-test', campaignId: 'SCH-005', payer: 'vendor', eventType: 'purchase_complete', eventName: '네이버페이 이벤트', rewardProductName: '네이버페이 5,000원', rewardUnitPrice: 5_000, plannedQuantity: 10, confirmedQuantity: 9, estimatedTotalAmount: 50_000, confirmedTotalAmount: 45_000, costHandling: 'company_direct', shippingOwner: 'company', shippingStatus: 'shipping_pending', winnerCountConfirmed: true, updatedAt: new Date().toISOString() })
const freeEvent = campaignEventOperationService.save({ ...directEvent, id: 'event-free-test', campaignId: 'SCH-004', eventName: '업체 무상 이벤트', costHandling: 'vendor_free', payer: 'company_support', confirmedTotalAmount: 0 })
let prepaidEvent = campaignEventOperationService.save({ ...directEvent, id: 'event-prepaid-test', campaignId: 'SCH-006', eventName: '승인형 선결제', costHandling: 'manager_prepaid', payer: 'manager', managerPrepayment: { status: 'not_requested' } })
const unapprovedPrepaymentCost = campaignEventOperationService.getConfirmedSettlementCost(prepaidEvent)
prepaidEvent = campaignEventOperationService.requestManagerPrepayment('SCH-006', prepaidEvent.id, '긴급 발송', 50_000, 'u-001')
prepaidEvent = campaignEventOperationService.approveManagerPrepayment('SCH-006', prepaidEvent.id, 50_000)
prepaidEvent = campaignEventOperationService.confirmManagerPrepaymentEvidence('SCH-006', prepaidEvent.id, 45_000)
const approvedPrepaymentCost = campaignEventOperationService.getConfirmedSettlementCost(prepaidEvent)
let pendingWinnerEvent = campaignEventOperationService.save({ ...directEvent, id: 'event-pending-winner-test', campaignId: 'SCH-010', eventName: '당첨자 미확정 이벤트', confirmedQuantity: undefined, confirmedTotalAmount: undefined, winnerCountConfirmed: false, shippingStatus: 'winner_registration_pending' })
const pendingWinnerBlocksConfirmation = campaignEventOperationService.validateForSettlementConfirmation('SCH-010').length === 1
pendingWinnerEvent = campaignEventOperationService.confirmWinnerCount('SCH-010', pendingWinnerEvent.id, 9)
const winnerConfirmedAllowsConfirmation = campaignEventOperationService.validateForSettlementConfirmation('SCH-010').length === 0 && pendingWinnerEvent.confirmedTotalAmount === 45_000 && pendingWinnerEvent.shippingStatus !== 'shipped'
storageService.setItem(STORAGE_KEYS.settlements, settlementService.getSettlements().map((item) => item.id === premiumSettlement.id ? { ...item, settlementConfirmed: true, settlementConfirmedAt: item.updatedAt, settlementConfirmedBy: '허수정', settlementConfirmedVersion: item.settlementVersion } : item))

const premiumManagerValidation = paymentRequestService.validateManagerPaymentRequest({
  settlementId: premiumSettlement.id, ownerId: 'u-001', businessType: manager.businessType,
  evidenceTypeConfirmed: true, accountConfirmed: true, calculationCompleted: true,
  calculationErrors: [], amountConfirmed: premiumSettlement.currentCalculation.managerAmount >= 0,
  sourceVersion: premiumSettlement.settlementVersion,
})
const premiumSellerValidation = paymentRequestService.validateSellerPaymentRequest({
  settlementId: premiumSettlement.id, ownerId: 'seller-SCH-009', businessType: premiumBusinessType,
  evidenceTypeConfirmed: false, accountConfirmed: true, calculationCompleted: true,
  calculationErrors: [], amountConfirmed: true, sourceVersion: premiumSettlement.settlementVersion,
})
const premiumGross = premiumSettlement.currentCalculation.managerAmount + premiumSettlement.currentCalculation.managerDeductionTotal
const premiumTax = calculateWithholding(premiumGross, premiumSettlement.currentCalculation.managerDeductionTotal)
const premiumCompanyAmountBeforeRequest = premiumSettlement.currentCalculation.companyAmount
const premiumRequest = paymentRequestService.createManagerPaymentRequest(premiumSettlement.id, '테스트', manager.businessType, undefined, { accountConfirmed: true })
const updatedPremiumRequest = paymentRequestService.updatePaymentRequest(premiumRequest.id, { memo: '수정된 지급 메모', accountConfirmed: true, evidenceStatus: premiumRequest.evidenceStatus })
const independentlyTrackedPremium = settlementService.getSettlementById(premiumSettlement.id)
campaignService.saveCampaigns(campaignService.getCampaigns().map((item) => item.id === premiumSettlement.campaignId ? { ...item, salesChannelType: 'supplier_link' } : item))
const premiumSellerRequest = paymentRequestService.createPaymentRequest(premiumSettlement.id, '셀러 snapshot 테스트', { accountConfirmed: true })
const reportedPremiumSellerRequest = paymentRequestService.updateDocumentCheck(premiumSellerRequest.id, 'reported_issued', '셀러가 발행했다고 전달', '지급 담당자')
const originalPremiumRule = sellerSettlementService.getSellerSettlementRule(premiumSettlement.campaignId)
campaignService.saveCampaigns(campaignService.getCampaigns().map((item) => item.id === premiumSettlement.campaignId ? { ...item, salesChannelType: undefined } : item))
sellerSettlementService.saveRule({ ...originalPremiumRule, businessType: 'freelancer', recommendedEvidenceType: 'withholding_3_3', confirmedEvidenceType: undefined, evidenceConfirmed: false })
const freelancerDocumentWithoutPaymentMethod = sellerSettlementService.createSellerDocument(premiumSettlement.id, false)
sellerSettlementService.saveRule(originalPremiumRule)
campaignService.saveCampaigns(campaignService.getCampaigns().map((item) => item.id === premiumSettlement.campaignId ? { ...item, salesChannelType: 'supplier_link' } : item))
const premiumVersionBeforeRevision = independentlyTrackedPremium.settlementVersion
const premiumCalculationBeforeRevision = {
  finalPaymentAmount: independentlyTrackedPremium.currentCalculation.finalPaymentAmount,
  managerAmount: independentlyTrackedPremium.currentCalculation.managerAmount,
  companyAmount: independentlyTrackedPremium.currentCalculation.companyAmount,
}
const revisionReason = '이벤트비 확인 필요'
const revisionRequested = settlementService.requestRevision(premiumSettlement.id, revisionReason, '테스트 요청자')
const revisionLog = settlementService.getActivityLogsBySettlementId(premiumSettlement.id).find((item) => item.action === 'revision_requested' && item.reason === revisionReason)
const unresolvedRevisionBlocksConfirmation = (() => {
  try { settlementService.confirmSettlement(premiumSettlement.id, '허수정'); return false }
  catch (error) { return error instanceof Error && error.message.includes('해결되지 않은 수정 요청') }
})()

const approvedSettlements = settlementService.getSettlements().map((item) => ({ ...item, status: 'approved', accountConfirmed: true }))
storageService.setItem(STORAGE_KEYS.settlements, approvedSettlements)
const approvedHealth = settlementService.getSettlementById(healthSettlement.id)
const releasedHealth = settlementService.releaseSettlementConfirmation(approvedHealth.id, '확정 흐름 테스트', '허수정')
const unconfirmedHealthValidation = paymentRequestService.validateManagerPaymentRequest({ settlementId: approvedHealth.id, ownerId: 'u-001', businessType: manager.businessType, evidenceTypeConfirmed: true, accountConfirmed: true, calculationCompleted: true, calculationErrors: [], amountConfirmed: true, sourceVersion: approvedHealth.settlementVersion })
const reconfirmedHealth = settlementService.confirmSettlement(approvedHealth.id, '허수정')
const unauthorizedReleaseBlocked = (() => {
  try { settlementService.releaseSettlementConfirmation(approvedHealth.id, '권한 테스트', '김병희', '매니저'); return false }
  catch (error) { return error instanceof Error && error.message.includes('권한이 없습니다') }
})()
const healthConfirmationLogs = settlementService.getActivityLogsBySettlementId(approvedHealth.id)
const healthProductSubtotal = salesDataService.getRowsByImportId(approvedHealth.salesDataImportId).reduce((total, row) => {
  const calculated = calculateManagerProductRow(row, approvedHealth.currentCalculation.totalCommissionRate)
  return { quantity: total.quantity + calculated.quantity, salesAmount: total.salesAmount + row.unitPrice * calculated.quantity, salesCommission: total.salesCommission + calculated.salesCommission }
}, { quantity: 0, salesAmount: 0, salesCommission: 0 })
const healthTax = calculateWithholding(approvedHealth.currentCalculation.managerAmount + approvedHealth.currentCalculation.managerDeductionTotal, approvedHealth.currentCalculation.managerDeductionTotal)
const beforeRequests = paymentRequestService.getPaymentRequests().length
const request = paymentRequestService.createManagerPaymentRequest(approvedHealth.id, '테스트', manager.businessType, undefined, { accountConfirmed: true })
const crossVersionDuplicateValidation = paymentRequestService.validateManagerPaymentRequest({ settlementId: approvedHealth.id, ownerId: 'u-001', businessType: manager.businessType, evidenceTypeConfirmed: true, accountConfirmed: true, calculationCompleted: true, calculationErrors: [], amountConfirmed: true, sourceVersion: approvedHealth.settlementVersion + 1 })
const paymentActivityLogs = settlementService.getActivityLogsBySettlementId(approvedHealth.id)
const activeRequestBlocksRelease = (() => {
  try { settlementService.releaseSettlementConfirmation(approvedHealth.id, '요청 충돌 테스트', '허수정', '정산 담당자'); return false }
  catch (error) { return error instanceof Error && error.message.includes('지급요청이 생성된') }
})()
const afterRequests = paymentRequestService.getPaymentRequests().length
const approvalFixture = { ...request, id: `payment-request-${request.settlementId}`, memo: 'MVP mock 요청' }
storageService.setItem(STORAGE_KEYS.paymentRequests, [approvalFixture, ...paymentRequestService.getPaymentRequests()])
const operationalRequests = paymentRequestService.getOperationalPaymentRequests()
const taxItemsAfterRequest = withholdingTaxService.getBySettlementOwner(approvedHealth.id, 'manager', 'u-001')
withholdingTaxService.upsert({ settlementId: approvedHealth.id, ownerType: 'manager', ownerId: 'u-001', ownerName: '허윤정', grossSettlementAmount: 69_440, deductions: 0, sourceVersion: approvedHealth.settlementVersion })
const taxItemsAfterRepeat = withholdingTaxService.getBySettlementOwner(approvedHealth.id, 'manager', 'u-001')

const failureSettlement = { ...approvedHealth, id: `${approvedHealth.id}-failure`, settlementVersion: approvedHealth.settlementVersion + 1 }
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), failureSettlement])
const originalUpsert = withholdingTaxService.upsert
const requestsBeforeFailure = paymentRequestService.getPaymentRequests().length
withholdingTaxService.upsert = () => { throw new Error('원천세 저장 실패') }
let failureBlocked = false
let failureMessage = ''
try {
  paymentRequestService.createManagerPaymentRequest(failureSettlement.id, '테스트', 'freelancer', undefined, { accountConfirmed: true })
} catch (error) { failureMessage = error instanceof Error ? error.message : ''; failureBlocked = failureMessage === '원천세 등록에 실패했습니다. 지급 요청은 생성되지 않았습니다.' && paymentRequestService.getPaymentRequests().length === requestsBeforeFailure }
withholdingTaxService.upsert = originalUpsert
const sellerOnlySettlement = settlementService.updatePaymentRequestStatus(failureSettlement.id, 'seller', 'approval_pending')
const independentlyUpdatedRecipients = settlementService.updatePaymentRequestStatus(failureSettlement.id, 'manager', 'request_ready')

const duplicateBlocked = (() => {
  try { paymentRequestService.createManagerPaymentRequest(approvedHealth.id, '테스트', manager.businessType, undefined, { accountConfirmed: true }); return false }
  catch (error) { return error instanceof Error && error.message.includes('이미 지급 요청이 생성되어 있습니다.') }
})()

const cancellationSettlement = { ...approvedHealth, id: `${approvedHealth.id}-cancellation`, settlementConfirmed: true, settlementConfirmedAt: approvedHealth.updatedAt, settlementConfirmedBy: '허수정', sellerPaymentRequestStatus: undefined, managerPaymentRequestStatus: undefined, sellerPaymentCompleted: false, managerPaymentCompleted: false }
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), cancellationSettlement])
const cancellableManagerRequest = paymentRequestService.createManagerPaymentRequest(cancellationSettlement.id, '취소 테스트', manager.businessType, undefined, { accountConfirmed: true, bankNameSnapshot: manager.bankName, accountNumberSnapshot: manager.accountNumber, accountHolderSnapshot: manager.accountHolder })
const canceledManagerRequest = paymentRequestService.cancelPaymentRequest(cancellableManagerRequest.id, '정산 수정 전 요청 취소', '허수정')
const cancellationState = settlementService.getSettlementById(cancellationSettlement.id)
const releasedAfterCancellation = settlementService.releaseSettlementConfirmation(cancellationSettlement.id, '지급요청 취소 후 확정 해제', '허수정', '정산 담당자')
const cancellationLog = settlementService.getActivityLogsBySettlementId(cancellationSettlement.id).find((item) => item.action === 'manager_payment_request_canceled')

paymentRequestService.approvePaymentRequest(premiumRequest.id, '대표 테스트')
const approvedCancellationBlocked = (() => { try { paymentRequestService.cancelPaymentRequest(premiumRequest.id, '승인 후 취소', '허수정'); return false } catch (error) { return error instanceof Error && error.message.includes('대표 승인이 완료') } })()
const approvedEditBlocked = (() => {
  try { paymentRequestService.updatePaymentRequest(premiumRequest.id, { memo: '승인 후 수정', accountConfirmed: true, evidenceStatus: premiumRequest.evidenceStatus }); return false }
  catch (error) { return error instanceof Error && error.message === '이미 대표 승인이 완료되어 지급요청을 수정할 수 없습니다.' }
})()
paymentRequestService.markPaymentCompleted(premiumRequest.id, '지급 테스트')
const completedCancellationBlocked = (() => { try { paymentRequestService.cancelPaymentRequest(premiumRequest.id, '지급 후 취소', '허수정'); return false } catch (error) { return error instanceof Error && error.message.includes('지급 완료') } })()
const completedEditBlocked = (() => {
  try { paymentRequestService.updatePaymentRequest(premiumRequest.id, { memo: '지급 후 수정', accountConfirmed: true, evidenceStatus: premiumRequest.evidenceStatus }); return false }
  catch (error) { return error instanceof Error && error.message === '이미 지급 완료된 건입니다.' }
})()
const completedPaymentBlocksRelease = (() => {
  try { settlementService.releaseSettlementConfirmation(premiumSettlement.id, '지급 완료 테스트', '허수정', '정산 담당자'); return false }
  catch (error) { return error instanceof Error && error.message.includes('지급 완료된 정산서') }
})()

const batchSettlementA = { ...approvedHealth, id: `${approvedHealth.id}-batch-a`, sellerPaymentRequestStatus: undefined, managerPaymentRequestStatus: undefined, sellerPaymentCompleted: false, managerPaymentCompleted: false }
const batchSettlementB = { ...approvedHealth, id: `${approvedHealth.id}-batch-b`, sellerPaymentRequestStatus: undefined, managerPaymentRequestStatus: undefined, sellerPaymentCompleted: false, managerPaymentCompleted: false }
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), batchSettlementA, batchSettlementB])
const batchRequestA = paymentRequestService.createManagerPaymentRequest(batchSettlementA.id, '일괄 지급 테스트', manager.businessType, undefined, { accountConfirmed: true, bankNameSnapshot: manager.bankName, accountNumberSnapshot: manager.accountNumber, accountHolderSnapshot: manager.accountHolder })
const batchRequestB = paymentRequestService.createManagerPaymentRequest(batchSettlementB.id, '일괄 지급 테스트', manager.businessType, undefined, { accountConfirmed: true, bankNameSnapshot: manager.bankName, accountNumberSnapshot: manager.accountNumber, accountHolderSnapshot: manager.accountHolder })
paymentRequestService.approvePaymentRequest(batchRequestA.id, '대표 테스트')
paymentRequestService.approvePaymentRequest(batchRequestB.id, '대표 테스트')
const completedBatchRequests = paymentRequestService.markPaymentBatchCompleted([batchRequestA.id, batchRequestA.id, batchRequestB.id], '지급 담당자')
const completedBatchSettlementA = settlementService.getSettlementById(batchSettlementA.id)
const completedBatchSettlementB = settlementService.getSettlementById(batchSettlementB.id)
const duplicateBatchCompletionBlocked = (() => {
  try { paymentRequestService.markPaymentBatchCompleted([batchRequestA.id, batchRequestB.id], '지급 담당자'); return false }
  catch (error) { return error instanceof Error && error.message.includes('대표 승인 완료된 지급건만') }
})()

const checks = [
  ['정산 수정 권한', canEditSettlement('정산 담당자') && !canEditSettlement('대표') && revisionPermissionBlocked],
  ['수정 재계산·전후 비교', revisionPreview.companyAmount !== revisionTestSettlement.currentCalculation.companyAmount],
  ['정산 수정 새 version 저장', revisionSaved.settlementVersion === revisionTestSettlement.settlementVersion + 1 && settlementService.getSettlementVersionsBySettlementId(revisionSaved.id).some((item) => item.version === revisionSaved.settlementVersion)],
  ['SKU별 수수료 계산·version 입력값 보존', skuRevisionPreview.grossCommission === expectedSkuGrossCommission && Boolean(savedRevisionVersion.revisionInput?.rows.length) && Boolean(savedRevisionVersion.previousRevisionInput)],
  ['수정요청 내용 수정·취소', revisionWorkflowRequested.status === 'revision_required' && revisionWorkflowUpdated.reason === '판매수량과 수수료율 확인' && revisionWorkflowCancelled.status === 'cancelled' && revisionWorkflowAfterCancel.status === 'review_pending' && !settlementService.getPendingRevisionRequest(revisionWorkflowSettlement.id)],
  ['수정요청 반려', revisionWorkflowRejected.status === 'rejected' && revisionWorkflowRejected.rejectionReason === '기존 계산이 맞음' && rejectedWorkflowState.status === 'review_pending'],
  ['정산 수정 저장 시 수정요청 resolved', revisionWorkflowResolved.status === 'resolved' && revisionWorkflowResolved.resolvedBy === '허수정'],
  ['수정 완료 후 확정 가능 상태 재평가', revisionTestSettlement.status === 'revision_required' && revisionSaved.status === 'review_pending' && !settlementService.isSettlementConfirmed(revisionSaved)],
  ['회사 직접 발송 예정 10명·실제 9명', directEvent.estimatedTotalAmount === 50_000 && campaignEventOperationService.getConfirmedSettlementCost(directEvent) === 45_000 && directEvent.shippingStatus === 'shipping_pending'],
  ['업체 무상 이벤트 정산 차감 없음', campaignEventOperationService.getConfirmedSettlementCost(freeEvent) === 0 && freeEvent.winnerCountConfirmed],
  ['매니저 선결제 승인형 실제 사용액', unapprovedPrepaymentCost === 0 && approvedPrepaymentCost === 45_000 && prepaidEvent.managerPrepayment?.status === 'evidence_confirmed'],
  ['이벤트 당첨자 확정 조건·발송 완료 비필수', pendingWinnerBlocksConfirmation && winnerConfirmedAllowsConfirmation],
  ['주민등록번호 메모리 전용·마스킹 처리', maskedResidentNumber === '900101-1******' && !persistedClientData.includes(transientResidentNumber)],
  ['셀러명/사업자명 독립 저장', sellerSaved.name === '헬시윤' && sellerRead.businessName === '(주)헬시윤'],
  ['셀러 사업자 유형 저장', sellerRead.businessType === 'simplified_business'],
  ['프리미엄 침구 Master/정산 규칙 동기화', premiumBusinessType === 'general_business' && refreshedPremiumRule?.businessType === 'general_business'],
  ['프리미엄 침구 증빙 유형 자동 결정', refreshedPremiumRule?.confirmedEvidenceType === 'tax_invoice' && refreshedPremiumRule.evidenceConfirmed],
  ['사업자 유형 공통 normalization', normalizeSellerBusinessType('corporation') === 'general_business'],
  ['Manager Master 사업자 유형', manager?.businessType === 'freelancer' && managerPaymentService.getBusinessType('허윤정') === 'freelancer'],
  ['프리미엄 침구 수동 정산 확인 없이 지급 가능', premiumManagerValidation.valid && !premiumManagerValidation.reasons.some((reason) => reason.includes('정산금액이 확정'))],
  ['셀러 미확정/증빙 사전 경고 없이 지급 가능', premiumSellerValidation.valid && !premiumSellerValidation.reasons.some((reason) => reason.includes('확정') || reason.includes('증빙') || reason.includes('캡처본'))],
  ['프리미엄 침구 지급 요청 최종액 일치', premiumRequest.finalPaymentAmount === premiumTax.finalPaymentAmount && premiumRequest.status === 'approval_pending'],
  ['지급 요청 정보 수정 및 상태 유지', updatedPremiumRequest.memo === '수정된 지급 메모' && updatedPremiumRequest.status === 'approval_pending' && updatedPremiumRequest.finalPaymentAmount === premiumRequest.finalPaymentAmount],
  ['셀러 지급요청 계좌 snapshot', premiumSellerRequest.bankNameSnapshot === '신한은행' && premiumSellerRequest.accountNumberSnapshot === '111-222-333333' && premiumSellerRequest.accountHolderSnapshot === '(주)라이프지수'],
  ['매니저 지급요청 계좌 snapshot', cancellableManagerRequest.bankNameSnapshot === manager.bankName && cancellableManagerRequest.accountNumberSnapshot === manager.accountNumber && cancellableManagerRequest.accountHolderSnapshot === manager.accountHolder],
  ['세금계산서 발행 전달·추후 확인 이력', reportedPremiumSellerRequest.documentCheckStatus === 'reported_issued' && reportedPremiumSellerRequest.taxInvoiceFollowUpRequired === true && reportedPremiumSellerRequest.taxInvoiceFinalConfirmed === false && reportedPremiumSellerRequest.documentCheckMemo === '셀러가 발행했다고 전달' && reportedPremiumSellerRequest.documentCheckHistory?.some((item) => item.status === 'reported_issued' && item.checkedBy === '지급 담당자' && item.memo === '셀러가 발행했다고 전달' && Boolean(item.checkedAt))],
  ['프리랜서 결제방식·증빙파일 미설정 지급문서 생성', freelancerDocumentWithoutPaymentMethod.businessType === 'freelancer' && freelancerDocumentWithoutPaymentMethod.evidenceType === 'withholding_3_3' && freelancerDocumentWithoutPaymentMethod.salesChannelType === 'supplier_link'],
  ['대표 승인 후 지급 요청 수정 제한', approvedEditBlocked],
  ['지급 완료 후 지급 요청 수정 제한', completedEditBlocked],
  ['셀러/매니저 지급 상태 독립 관리', independentlyTrackedPremium.managerPaymentRequestStatus === 'approval_pending' && !independentlyTrackedPremium.sellerPaymentRequestStatus],
  ['셀러 선행 및 반대 순서 상태 독립', sellerOnlySettlement?.sellerPaymentRequestStatus === 'approval_pending' && !sellerOnlySettlement.managerPaymentRequestStatus && independentlyUpdatedRecipients?.sellerPaymentRequestStatus === 'approval_pending' && independentlyUpdatedRecipients.managerPaymentRequestStatus === 'request_ready'],
  ['수정 요청 이력 및 현재 버전 보존', revisionRequested?.status === 'revision_required' && revisionRequested.settlementVersion === premiumVersionBeforeRevision && revisionRequested.currentCalculation.finalPaymentAmount === premiumCalculationBeforeRevision.finalPaymentAmount && revisionRequested.currentCalculation.managerAmount === premiumCalculationBeforeRevision.managerAmount && revisionRequested.currentCalculation.companyAmount === premiumCalculationBeforeRevision.companyAmount && revisionLog?.actor === '테스트 요청자' && revisionLog.version === premiumVersionBeforeRevision],
  ['회사 귀속 계산 데이터 유지', Number.isFinite(premiumCompanyAmountBeforeRequest) && settlementService.getSettlementById(premiumSettlement.id).currentCalculation.companyAmount === premiumCompanyAmountBeforeRequest],
  ['건강식품 VAT 포함 배분금액', healthTax.grossSettlementAmount === 69_440],
  ['미확정 정산서 지급요청 차단', !unconfirmedHealthValidation.valid && unconfirmedHealthValidation.reasons.includes('정산서를 먼저 확정해주세요.')],
  ['미해결 수정요청 확정 차단', unresolvedRevisionBlocksConfirmation],
  ['권한 없는 사용자 확정 해제 차단', unauthorizedReleaseBlocked],
  ['지급요청 존재 시 확정 해제 차단', activeRequestBlocksRelease],
  ['지급 완료 후 확정 해제 차단', completedPaymentBlocksRelease],
  ['정산서 확정 해제·재확정 이력', releasedHealth.settlementConfirmed === false && reconfirmedHealth.settlementConfirmed === true && reconfirmedHealth.settlementConfirmedVersion === approvedHealth.settlementVersion && healthConfirmationLogs.some((item) => item.action === 'settlement_confirmation_released') && healthConfirmationLogs.some((item) => item.action === 'settlement_confirmed')],
  ['매니저 상품 판매 소계', healthProductSubtotal.quantity === 108 && healthProductSubtotal.salesAmount === 3_024_000 && healthProductSubtotal.salesCommission === 756_000],
  ['건강식품 원천세 계산', healthTax.withholdingBaseAmount === 63_127 && healthTax.incomeTaxAmount === 1_890 && healthTax.localIncomeTaxAmount === 180 && healthTax.finalPaymentAmount === 61_057],
  ['지급요청 원천세 snapshot·리스트 일치', request.withholdingTaxItemId === taxItemsAfterRequest[0]?.id && request.withholdingBaseAmount === healthTax.withholdingBaseAmount && request.incomeTaxAmount === healthTax.incomeTaxAmount && request.localIncomeTaxAmount === healthTax.localIncomeTaxAmount && request.withholdingTaxAmount === healthTax.totalWithholdingTaxAmount && request.finalPaymentAmount === healthTax.finalPaymentAmount && taxItemsAfterRequest[0]?.withholdingBaseAmount === request.withholdingBaseAmount && taxItemsAfterRequest[0]?.incomeTaxAmount === request.incomeTaxAmount && taxItemsAfterRequest[0]?.localIncomeTaxAmount === request.localIncomeTaxAmount && taxItemsAfterRequest[0]?.totalWithholdingTaxAmount === request.withholdingTaxAmount && taxItemsAfterRequest[0]?.finalPaymentAmount === request.finalPaymentAmount],
  ['건강식품 입금 예정일', approvedHealth.paymentDueDate === '2026-08-16'],
  ['매니저 지급요청 감사 이력', paymentActivityLogs.some((item) => item.action === 'manager_payment_requested' && item.version === approvedHealth.settlementVersion)],
  ['지급 요청 최종액 일치', request.finalPaymentAmount === healthTax.finalPaymentAmount],
  ['지급승인 별도 fixture 운영 조회 제외', paymentRequestService.getPaymentRequests().some((item) => item.id === approvalFixture.id) && !operationalRequests.some((item) => item.id === approvalFixture.id) && operationalRequests.some((item) => item.id === request.id)],
  ['원천세 선등록 후 지급 요청 생성', taxItemsAfterRequest.length === 1 && afterRequests === beforeRequests + 1 && request.status === 'approval_pending'],
  ['원천세 중복 등록 방지', taxItemsAfterRepeat.length === 1 && taxItemsAfterRepeat[0].id === taxItemsAfterRequest[0].id],
  ['지급 요청 중복 생성 방지', duplicateBlocked],
  ['이전 version active 지급요청 중복 방지', !crossVersionDuplicateValidation.valid && crossVersionDuplicateValidation.reasons.includes('이미 지급 요청이 생성되어 있습니다.')],
  ['지급요청 취소 이력·대상 독립 복원', canceledManagerRequest.status === 'canceled' && canceledManagerRequest.cancellationReason === '정산 수정 전 요청 취소' && canceledManagerRequest.previousStatusBeforeCancellation === 'approval_pending' && cancellationState.managerPaymentRequestStatus === 'canceled' && cancellationState.sellerPaymentRequestStatus === undefined && cancellationState.settlementConfirmed === true && Boolean(cancellationLog)],
  ['지급요청 취소 후 확정 해제 재시도', releasedAfterCancellation.settlementConfirmed === false],
  ['대표 승인·지급 완료 취소 제한', approvedCancellationBlocked && completedCancellationBlocked],
  ['일괄 입금 완료 batch·실지급액 기록', completedBatchRequests.length === 2 && new Set(completedBatchRequests.map((item) => item.id)).size === 2 && Boolean(completedBatchRequests[0].payoutBatchId) && completedBatchRequests.every((item) => item.status === 'payment_completed' && item.payoutBatchId === completedBatchRequests[0].payoutBatchId && item.actualPaidAmount === item.finalPaymentAmount && item.completedBy === '지급 담당자' && Boolean(item.completedAt))],
  ['일괄 입금 완료 정산 대상 독립 동기화', completedBatchSettlementA?.managerPaymentCompleted === true && completedBatchSettlementA.managerPaymentRequestStatus === 'payment_completed' && completedBatchSettlementA.sellerPaymentCompleted === false && completedBatchSettlementB?.managerPaymentCompleted === true && completedBatchSettlementB.managerPaymentRequestStatus === 'payment_completed' && completedBatchSettlementB.sellerPaymentCompleted === false],
  ['일괄 지급 중복 ID·재완료 방지', duplicateBatchCompletionBlocked],
  [`원천세 등록 실패 시 지급 요청 미생성${failureMessage ? ` · ${failureMessage}` : ''}`, failureBlocked],
]

checks.forEach(([label, passed]) => console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`))
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
await vite.close()
