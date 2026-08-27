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

const sellerSaved = sellerMasterService.saveSellerProfile({
  id: 'seller-SCH-005', name: '헬시윤', businessName: '(주)헬시윤', businessType: 'simplified_business',
  defaultMdId: 'md-SCH-005', defaultManagerId: 'u-001', bankName: '국민은행', accountNumber: '123-456', accountHolder: '(주)헬시윤',
})
const sellerRead = sellerMasterService.getSellerById('seller-SCH-005')
storageService.setItem(STORAGE_KEYS.sellerSettlementRules, sellerSettlementService.getRules().filter((rule) => rule.campaignId !== 'SCH-009'))
sellerMasterService.saveSellerProfile({ id: 'seller-SCH-009', name: '라이프지수', businessName: '(주)라이프지수', businessType: 'general_business', defaultMdId: 'md-SCH-009', defaultManagerId: 'u-001' })
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
const premiumVersionBeforeRevision = independentlyTrackedPremium.settlementVersion
const premiumCalculationBeforeRevision = {
  finalPaymentAmount: independentlyTrackedPremium.currentCalculation.finalPaymentAmount,
  managerAmount: independentlyTrackedPremium.currentCalculation.managerAmount,
  companyAmount: independentlyTrackedPremium.currentCalculation.companyAmount,
}
const revisionReason = '이벤트비 확인 필요'
const revisionRequested = settlementService.requestRevision(premiumSettlement.id, revisionReason, '테스트 요청자')
const revisionLog = settlementService.getActivityLogsBySettlementId(premiumSettlement.id).find((item) => item.action === 'revision_requested' && item.reason === revisionReason)

const approvedSettlements = settlementService.getSettlements().map((item) => ({ ...item, status: 'approved', accountConfirmed: true }))
storageService.setItem(STORAGE_KEYS.settlements, approvedSettlements)
const approvedHealth = settlementService.getSettlementById(healthSettlement.id)
const releasedHealth = settlementService.releaseSettlementConfirmation(approvedHealth.id, '확정 흐름 테스트', '허수정')
const reconfirmedHealth = settlementService.confirmSettlement(approvedHealth.id, '허수정')
const healthConfirmationLogs = settlementService.getActivityLogsBySettlementId(approvedHealth.id)
const healthProductSubtotal = salesDataService.getRowsByImportId(approvedHealth.salesDataImportId).reduce((total, row) => {
  const calculated = calculateManagerProductRow(row, approvedHealth.currentCalculation.totalCommissionRate)
  return { quantity: total.quantity + calculated.quantity, salesAmount: total.salesAmount + row.unitPrice * calculated.quantity, salesCommission: total.salesCommission + calculated.salesCommission }
}, { quantity: 0, salesAmount: 0, salesCommission: 0 })
const healthTax = calculateWithholding(approvedHealth.currentCalculation.managerAmount + approvedHealth.currentCalculation.managerDeductionTotal, approvedHealth.currentCalculation.managerDeductionTotal)
const beforeRequests = paymentRequestService.getPaymentRequests().length
const request = paymentRequestService.createManagerPaymentRequest(approvedHealth.id, '테스트', manager.businessType, undefined, { accountConfirmed: true })
const afterRequests = paymentRequestService.getPaymentRequests().length
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

const duplicateBlocked = (() => {
  try { paymentRequestService.createManagerPaymentRequest(approvedHealth.id, '테스트', manager.businessType, undefined, { accountConfirmed: true }); return false }
  catch (error) { return error instanceof Error && error.message.includes('이미 지급 요청이 생성되어 있습니다.') }
})()

paymentRequestService.approvePaymentRequest(premiumRequest.id, '대표 테스트')
const approvedEditBlocked = (() => {
  try { paymentRequestService.updatePaymentRequest(premiumRequest.id, { memo: '승인 후 수정', accountConfirmed: true, evidenceStatus: premiumRequest.evidenceStatus }); return false }
  catch (error) { return error instanceof Error && error.message === '이미 대표 승인이 완료되어 지급요청을 수정할 수 없습니다.' }
})()
paymentRequestService.markPaymentCompleted(premiumRequest.id, '지급 테스트')
const completedEditBlocked = (() => {
  try { paymentRequestService.updatePaymentRequest(premiumRequest.id, { memo: '지급 후 수정', accountConfirmed: true, evidenceStatus: premiumRequest.evidenceStatus }); return false }
  catch (error) { return error instanceof Error && error.message === '이미 지급 완료된 건입니다.' }
})()

const checks = [
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
  ['대표 승인 후 지급 요청 수정 제한', approvedEditBlocked],
  ['지급 완료 후 지급 요청 수정 제한', completedEditBlocked],
  ['셀러/매니저 지급 상태 독립 관리', independentlyTrackedPremium.managerPaymentRequestStatus === 'approval_pending' && !independentlyTrackedPremium.sellerPaymentRequestStatus],
  ['수정 요청 이력 및 현재 버전 보존', revisionRequested?.status === 'revision_required' && revisionRequested.settlementVersion === premiumVersionBeforeRevision && revisionRequested.currentCalculation.finalPaymentAmount === premiumCalculationBeforeRevision.finalPaymentAmount && revisionRequested.currentCalculation.managerAmount === premiumCalculationBeforeRevision.managerAmount && revisionRequested.currentCalculation.companyAmount === premiumCalculationBeforeRevision.companyAmount && revisionLog?.actor === '테스트 요청자' && revisionLog.version === premiumVersionBeforeRevision],
  ['회사 귀속 계산 데이터 유지', Number.isFinite(premiumCompanyAmountBeforeRequest) && settlementService.getSettlementById(premiumSettlement.id).currentCalculation.companyAmount === premiumCompanyAmountBeforeRequest],
  ['건강식품 VAT 포함 배분금액', healthTax.grossSettlementAmount === 69_440],
  ['정산서 확정 해제·재확정 이력', releasedHealth.settlementConfirmed === false && reconfirmedHealth.settlementConfirmed === true && reconfirmedHealth.settlementConfirmedVersion === approvedHealth.settlementVersion && healthConfirmationLogs.some((item) => item.action === 'settlement_confirmation_released') && healthConfirmationLogs.some((item) => item.action === 'settlement_confirmed')],
  ['매니저 상품 판매 소계', healthProductSubtotal.quantity === 108 && healthProductSubtotal.salesAmount === 3_024_000 && healthProductSubtotal.salesCommission === 756_000],
  ['건강식품 원천세 계산', healthTax.withholdingBaseAmount === 63_127 && healthTax.incomeTaxAmount === 1_890 && healthTax.localIncomeTaxAmount === 180 && healthTax.finalPaymentAmount === 61_057],
  ['지급 요청 최종액 일치', request.finalPaymentAmount === healthTax.finalPaymentAmount],
  ['원천세 선등록 후 지급 요청 생성', taxItemsAfterRequest.length === 1 && afterRequests === beforeRequests + 1 && request.status === 'approval_pending'],
  ['원천세 중복 등록 방지', taxItemsAfterRepeat.length === 1 && taxItemsAfterRepeat[0].id === taxItemsAfterRequest[0].id],
  ['지급 요청 중복 생성 방지', duplicateBlocked],
  [`원천세 등록 실패 시 지급 요청 미생성${failureMessage ? ` · ${failureMessage}` : ''}`, failureBlocked],
]

checks.forEach(([label, passed]) => console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`))
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
await vite.close()
